use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use swc_common::{collections::AHashSet, Span, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::{collect_decls, prepend, Id, HANDLER};
use swc_ecmascript::visit::{Fold, FoldWith};

use transform_css::transform_css;

mod transform_css;

pub fn styled_jsx() -> impl Fold {
  StyledJSXTransformer::default()
}

#[derive(Debug, Clone)]
pub struct JSXStyleInfo {
  hash: String,
  css: String,
  css_span: Span,
  is_global: bool,
  is_dynamic: bool,
  expressions: Vec<Box<Expr>>,
}

#[derive(Debug, Default)]
struct StyledJSXTransformer {
  styles: Vec<JSXStyleInfo>,
  static_class_name: Option<String>,
  class_name: Option<Expr>,
  file_has_styled_jsx: bool,
  has_styled_jsx: bool,
  scope_bindings: AHashSet<Id>,
}

impl Fold for StyledJSXTransformer {
  fn fold_jsx_element(&mut self, el: JSXElement) -> JSXElement {
    if self.has_styled_jsx && is_styled_jsx(&el) {
      return self.replace_jsx_style(el);
    } else if self.has_styled_jsx {
      return el.fold_children_with(self);
    }

    self.check_children_for_jsx_styles(&el.children);
    let el = el.fold_children_with(self);
    self.reset_styles_state();

    el
  }

  fn fold_jsx_fragment(&mut self, fragment: JSXFragment) -> JSXFragment {
    if self.has_styled_jsx {
      return fragment.fold_children_with(self);
    }

    self.check_children_for_jsx_styles(&fragment.children);
    let fragment = fragment.fold_children_with(self);
    self.reset_styles_state();

    fragment
  }

  fn fold_jsx_opening_element(&mut self, mut el: JSXOpeningElement) -> JSXOpeningElement {
    if !self.has_styled_jsx {
      return el;
    }

    if let JSXElementName::Ident(Ident { sym, span, .. }) = &el.name {
      if sym != "style"
        && sym != "_JSXStyle"
        && (!is_capitalized(sym as &str) || self.scope_bindings.contains(&(sym.clone(), span.ctxt)))
      {
        let mut spreads = vec![];
        let mut class_name_expr = None;
        let mut existing_index = None;
        let mut remove_spread_index = None;
        for i in (0..el.attrs.len()).rev() {
          match &el.attrs[i] {
            JSXAttrOrSpread::JSXAttr(JSXAttr {
              name: JSXAttrName::Ident(Ident { sym, .. }),
              value,
              ..
            }) => {
              if sym == "className" {
                // TODO: handle maybe no value
                existing_index = Some(i);
                class_name_expr = match value {
                  Some(JSXAttrValue::Lit(str_lit)) => Some(Expr::Lit(str_lit.clone())),
                  Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
                    expr: JSXExpr::Expr(expr),
                    ..
                  })) => Some(*expr.clone()),
                  None => None,
                  _ => panic!("Not implemented"),
                };
                break;
              }
            }
            JSXAttrOrSpread::SpreadElement(SpreadElement { expr, .. }) => {
              if let Expr::Object(ObjectLit { props, .. }) = &**expr {
                let mut has_spread = false;
                let mut has_class_name = false;
                for j in 0..props.len() {
                  if let PropOrSpread::Prop(prop) = &props[j] {
                    if let Prop::KeyValue(KeyValueProp { key, value }) = &**prop {
                      if let PropName::Ident(Ident { sym, .. }) = key {
                        if sym == "className" {
                          has_class_name = true;
                          class_name_expr = Some(*value.clone());
                          if props.len() == 1 {
                            remove_spread_index = Some(i);
                          }
                        }
                      }
                    }
                  } else {
                    has_spread = true;
                  }
                }
                if has_class_name {
                  break;
                }
                if !has_spread {
                  continue;
                }
              }

              let valid_spread = match &**expr {
                Expr::Member(_) => true,
                Expr::Ident(_) => true,
                _ => false,
              };

              if valid_spread {
                let member_dot_name = Expr::Member(MemberExpr {
                  obj: ExprOrSuper::Expr(Box::new(*expr.clone())),
                  prop: Box::new(Expr::Ident(ident("className"))),
                  span: DUMMY_SP,
                  computed: false,
                });
                // `${name} && ${name}.className != null && ${name}.className`
                spreads.push(and(
                  and(
                    *expr.clone(),
                    not_eq(
                      member_dot_name.clone(),
                      Expr::Lit(Lit::Null(Null { span: DUMMY_SP })),
                    ),
                  ),
                  member_dot_name.clone(),
                ));
              }
            }
            _ => panic!("Not implemented"),
          };
        }

        let spread_expr = match spreads.len() {
          0 => None,
          _ => Some(join_spreads(spreads)),
        };

        let class_name_expr = match class_name_expr {
          Some(Expr::Tpl(_)) => Some(class_name_expr.unwrap()),
          Some(Expr::Lit(Lit::Str(_))) => Some(class_name_expr.unwrap()),
          None => None,
          _ => Some(or(class_name_expr.unwrap(), string_literal_expr(""))),
        };

        let extra_class_name_expr = if spread_expr.is_some() && class_name_expr.is_some() {
          Some(or(spread_expr.unwrap(), class_name_expr.unwrap()))
        } else if spread_expr.is_some() {
          Some(or(spread_expr.unwrap(), string_literal_expr("")))
        } else if class_name_expr.is_some() {
          class_name_expr
        } else {
          None
        };

        let new_class_name = if let Some(extra_class_name_expr) = extra_class_name_expr {
          add(
            add(self.class_name.clone().unwrap(), string_literal_expr(" ")),
            extra_class_name_expr,
          )
        } else {
          self.class_name.clone().unwrap()
        };

        let class_name_attr = JSXAttrOrSpread::JSXAttr(JSXAttr {
          span: DUMMY_SP,
          name: JSXAttrName::Ident(ident("className")),
          value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
            expr: JSXExpr::Expr(Box::new(new_class_name)),
            span: DUMMY_SP,
          })),
        });

        if let Some(remove_spread_index) = remove_spread_index {
          el.attrs.remove(remove_spread_index);
        }
        if let Some(existing_index) = existing_index {
          el.attrs.remove(existing_index);
        }
        el.attrs.push(class_name_attr);
      }
    }

    el
  }

  fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
    let mut items = items.fold_children_with(self);
    if self.file_has_styled_jsx {
      prepend(
        &mut items,
        ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
          asserts: None,
          span: DUMMY_SP,
          type_only: false,
          specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
            local: Ident {
              sym: "_JSXStyle".into(),
              span: DUMMY_SP,
              optional: false,
            },
            span: DUMMY_SP,
          })],
          src: Str {
            has_escape: false,
            kind: StrKind::Synthesized {},
            span: DUMMY_SP,
            value: "styled-jsx/style".into(),
          },
        })),
      );
    }
    items
  }

  fn fold_function(&mut self, func: Function) -> Function {
    let current_bindings = self.scope_bindings.clone();
    self.scope_bindings = collect_decls(&func);
    let func = func.fold_children_with(self);
    self.scope_bindings = current_bindings;
    func
  }

  fn fold_arrow_expr(&mut self, func: ArrowExpr) -> ArrowExpr {
    let current_bindings = self.scope_bindings.clone();
    self.scope_bindings = collect_decls(&func);
    let func = func.fold_children_with(self);
    self.scope_bindings = current_bindings;
    func
  }
}

impl StyledJSXTransformer {
  fn check_children_for_jsx_styles(&mut self, children: &Vec<JSXElementChild>) {
    let mut static_hashes = vec![];
    let mut dynamic_styles = vec![];
    for i in 0..children.len() {
      if let JSXElementChild::JSXElement(child_el) = &children[i] {
        if is_styled_jsx(&child_el) {
          self.file_has_styled_jsx = true;
          self.has_styled_jsx = true;
          let style_info = get_jsx_style_info(&child_el);
          if !style_info.is_dynamic {
            static_hashes.push(style_info.hash.clone());
          } else {
            dynamic_styles.push(style_info.clone());
          }
          self.styles.insert(0, style_info);
        }
      }
    }

    if static_hashes.len() > 0 {
      self.static_class_name = Some(format!("jsx-{}", hash_string(&static_hashes.join(","))));
    }

    let dynamic_class_name = match dynamic_styles.len() {
      0 => None,
      _ => Some(Expr::Call(CallExpr {
        callee: ExprOrSuper::Expr(Box::new(Expr::Member(MemberExpr {
          obj: ExprOrSuper::Expr(Box::new(Expr::Ident(Ident {
            sym: "_JSXStyle".into(),
            span: DUMMY_SP,
            optional: false,
          }))),
          prop: Box::new(Expr::Ident(Ident {
            sym: "dynamic".into(),
            span: DUMMY_SP,
            optional: false,
          })),
          span: DUMMY_SP,
          computed: false,
        }))),
        args: dynamic_styles
          .iter()
          .map(|style_info| {
            let hash_input = match &self.static_class_name {
              Some(class_name) => format!("{}{}", style_info.hash, class_name),
              None => style_info.hash.clone(),
            };
            ExprOrSpread {
              expr: Box::new(Expr::Array(ArrayLit {
                elems: vec![
                  Some(ExprOrSpread {
                    expr: Box::new(string_literal_expr(&hash_string(&hash_input))),
                    spread: None,
                  }),
                  Some(ExprOrSpread {
                    expr: Box::new(Expr::Array(ArrayLit {
                      elems: style_info
                        .expressions
                        .iter()
                        .map(|expression| {
                          Some(ExprOrSpread {
                            expr: expression.clone(),
                            spread: None,
                          })
                        })
                        .collect(),
                      span: DUMMY_SP,
                    })),
                    spread: None,
                  }),
                ],
                span: DUMMY_SP,
              })),
              spread: None,
            }
          })
          .collect(),
        span: DUMMY_SP,
        type_args: None,
      })),
    };

    let mut class_name_expr = match &self.static_class_name {
      Some(class_name) => Some(string_literal_expr(&class_name)),
      None => None,
    };
    if let Some(dynamic_class_name) = dynamic_class_name {
      class_name_expr = match class_name_expr {
        Some(class_name) => Some(add(class_name, dynamic_class_name)),
        None => Some(dynamic_class_name),
      };
    };
    if let Some(class_name_expr) = class_name_expr {
      self.class_name = Some(class_name_expr);
    }
  }

  fn replace_jsx_style(&mut self, mut el: JSXElement) -> JSXElement {
    let style_info = self.styles.pop().unwrap();

    el.opening.name = JSXElementName::Ident(Ident {
      sym: "_JSXStyle".into(),
      span: DUMMY_SP,
      optional: false,
    });
    el.closing = if let Some(mut closing) = el.closing {
      closing.name = JSXElementName::Ident(Ident {
        sym: "_JSXStyle".into(),
        span: DUMMY_SP,
        optional: false,
      });
      Some(closing)
    } else {
      None
    };
    for i in 0..el.opening.attrs.len() {
      if let JSXAttrOrSpread::JSXAttr(JSXAttr {
        name: JSXAttrName::Ident(Ident { sym, .. }),
        ..
      }) = &el.opening.attrs[i]
      {
        if sym == "jsx" {
          el.opening.attrs[i] = JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(Ident {
              sym: "id".into(),
              span: DUMMY_SP,
              optional: false,
            }),
            value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
              expr: JSXExpr::Expr(Box::new(string_literal_expr(
                hash_string(&style_info.hash).clone().as_str(),
              ))),
              span: DUMMY_SP,
            })),
            span: DUMMY_SP,
          });
          break;
        }
      }
    }
    if style_info.is_dynamic {
      el.opening.attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
        name: JSXAttrName::Ident(Ident {
          sym: "dynamic".into(),
          span: DUMMY_SP,
          optional: false,
        }),
        value: Some(JSXAttrValue::JSXExprContainer(JSXExprContainer {
          expr: JSXExpr::Expr(Box::new(Expr::Array(ArrayLit {
            elems: style_info
              .expressions
              .iter()
              .map(|expression| {
                Some(ExprOrSpread {
                  expr: expression.clone(),
                  spread: None,
                })
              })
              .collect(),
            span: DUMMY_SP,
          }))),
          span: DUMMY_SP,
        })),
        span: DUMMY_SP,
      }));
    }

    el.children = vec![JSXElementChild::JSXExprContainer(JSXExprContainer {
      expr: JSXExpr::Expr(Box::new(transform_css(style_info, &self.static_class_name))),
      span: DUMMY_SP,
    })];
    el
  }

  fn reset_styles_state(&mut self) {
    self.has_styled_jsx = false;
    self.static_class_name = None;
    self.class_name = None;
  }
}

fn is_styled_jsx(el: &JSXElement) -> bool {
  if let JSXElementName::Ident(Ident { sym, .. }) = &el.opening.name {
    if sym != "style" {
      return false;
    }
  }

  el.opening.attrs.iter().any(|attr| {
    if let JSXAttrOrSpread::JSXAttr(JSXAttr {
      name: JSXAttrName::Ident(Ident { sym, .. }),
      ..
    }) = &attr
    {
      if sym == "jsx" {
        return true;
      }
    }
    false
  })
}

fn get_jsx_style_info(el: &JSXElement) -> JSXStyleInfo {
  let is_global = el.opening.attrs.iter().any(|attr| {
    if let JSXAttrOrSpread::JSXAttr(JSXAttr {
      name: JSXAttrName::Ident(Ident { sym, .. }),
      ..
    }) = &attr
    {
      if sym == "global" {
        return true;
      }
    }
    false
  });

  let non_whitespace_children: &Vec<&JSXElementChild> = &el
    .children
    .iter()
    .filter(|child| {
      if let JSXElementChild::JSXText(txt) = child {
        if txt.value.to_string().chars().all(char::is_whitespace) {
          return false;
        }
      }
      true
    })
    .collect();

  if non_whitespace_children.len() != 1 {
    HANDLER.with(|handler| {
      handler
        .struct_span_err(
          el.span,
          &format!(
            "Expected one child under JSX style tag, but got {} (eg: <style jsx>{{`hi`}}</style>)",
            non_whitespace_children.len()
          ),
        )
        .emit()
    });
    panic!("next-swc compilation error");
  }

  if let JSXElementChild::JSXExprContainer(JSXExprContainer {
    expr: JSXExpr::Expr(expr),
    ..
  }) = non_whitespace_children[0]
  {
    let mut hasher = DefaultHasher::new();
    let css: String;
    let css_span: Span;
    let is_dynamic;
    let mut expressions = vec![];
    match &**expr {
      Expr::Lit(Lit::Str(Str { value, span, .. })) => {
        hasher.write(value.as_ref().as_bytes());
        css = value.to_string().clone();
        css_span = span.clone();
        is_dynamic = false;
      }
      Expr::Tpl(Tpl {
        exprs,
        quasis,
        span,
      }) => {
        if exprs.len() == 0 {
          hasher.write(quasis[0].raw.value.as_bytes());
          css = quasis[0].raw.value.to_string();
          css_span = span.clone();
          is_dynamic = false;
        } else {
          expr.clone().hash(&mut hasher);
          let mut s = String::new();
          for i in 0..quasis.len() {
            let placeholder = if i == quasis.len() - 1 {
              String::new()
            } else {
              String::from("__styled-jsx-placeholder__")
            };
            s = format!("{}{}{}", s, quasis[i].raw.value, placeholder)
          }
          css = String::from(s);
          dbg!(&css);
          css_span = span.clone();
          is_dynamic = true;
          expressions = exprs.clone();
        }
      }
      _ => panic!("Not implemented"),
    }

    return JSXStyleInfo {
      hash: format!("{:x}", hasher.finish()),
      css,
      css_span,
      is_global,
      is_dynamic,
      expressions,
    };
  }

  HANDLER.with(|handler| {
    handler
      .struct_span_err(
        el.span,
        "Expected a single child of type JSXExpressionContainer under JSX Style tag (eg: <style \
         jsx>{{`hi`}}</style>)",
      )
      .emit()
  });
  panic!("next-swc compilation error");
}

fn add(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::Add, left, right)
}

fn and(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::LogicalAnd, left, right)
}

fn or(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::LogicalOr, left, right)
}

fn not_eq(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::NotEq, left, right)
}

fn binary_expr(op: BinaryOp, left: Expr, right: Expr) -> Expr {
  Expr::Bin(BinExpr {
    op,
    left: Box::new(left),
    right: Box::new(right),
    span: DUMMY_SP,
  })
}

fn join_spreads(spreads: Vec<Expr>) -> Expr {
  // TODO: make sure this won't panic
  let mut new_expr = spreads[0].clone();
  for i in 1..spreads.len() {
    new_expr = Expr::Bin(BinExpr {
      op: BinaryOp::LogicalOr,
      left: Box::new(new_expr.clone()),
      right: Box::new(spreads[i].clone()),
      span: DUMMY_SP,
    })
  }
  new_expr
}

pub fn string_literal_expr(str: &str) -> Expr {
  Expr::Lit(Lit::Str(Str {
    value: str.into(),
    span: DUMMY_SP,
    has_escape: false,
    kind: StrKind::Synthesized {},
  }))
}

fn ident(str: &str) -> Ident {
  Ident {
    sym: String::from(str).into(),
    span: DUMMY_SP,
    optional: false,
  }
}

// TODO: maybe use DJBHasher (need to implement)
pub fn hash_string(str: &String) -> String {
  let mut hasher = DefaultHasher::new();
  hasher.write(str.as_bytes());
  let hash_result = hasher.finish();
  format!("{:x}", hash_result)
}

fn is_capitalized(word: &str) -> bool {
  word.chars().next().unwrap().is_uppercase()
}
