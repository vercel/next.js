use std::collections::hash_map::DefaultHasher;
use std::hash::Hasher;
use swc_common::{collections::AHashSet, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::{collect_decls, prepend, Id, HANDLER};
use swc_ecmascript::visit::{Fold, FoldWith};

pub fn styled_jsx() -> impl Fold {
  StyledJSXTransformer::default()
}

#[derive(Debug, Default)]
struct StyledJSXTransformer {
  class_name: Option<String>,
  file_has_styled_jsx: bool,
  has_styled_jsx: bool,
  scope_bindings: AHashSet<Id>,
}

impl Fold for StyledJSXTransformer {
  fn fold_jsx_element(&mut self, mut el: JSXElement) -> JSXElement {
    if self.has_styled_jsx {
      return el.fold_children_with(self);
    }

    el.children = self.process_children(el.children);
    let el = el.fold_children_with(self);
    self.has_styled_jsx = false;
    self.class_name = None;

    el
  }

  fn fold_jsx_fragment(&mut self, mut fragment: JSXFragment) -> JSXFragment {
    if self.has_styled_jsx {
      return fragment.fold_children_with(self);
    }

    fragment.children = self.process_children(fragment.children);
    let fragment = fragment.fold_children_with(self);
    self.has_styled_jsx = false;
    self.class_name = None;

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
        let jsx_class_name = string_literal_expr(self.class_name.clone().unwrap().as_str());
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
            add(jsx_class_name, string_literal_expr(" ")),
            extra_class_name_expr,
          )
        } else {
          jsx_class_name
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
  fn process_children(&mut self, mut children: Vec<JSXElementChild>) -> Vec<JSXElementChild> {
    let mut style_hashes = vec![];
    for i in 0..children.len() {
      if let JSXElementChild::JSXElement(child_el) = &children[i] {
        if is_styled_jsx(&child_el) {
          self.file_has_styled_jsx = true;
          self.has_styled_jsx = true;
          let style_hash = get_jsx_style_info(&child_el);
          style_hashes.push(style_hash.clone());
          children[i] = replace_jsx_style(*child_el.clone(), hash_string(&style_hash));
        }
      }
    }

    if style_hashes.len() > 0 {
      self.class_name = Some(format!("jsx-{}", hash_string(&style_hashes.join(","))));
    }

    children
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

fn get_jsx_style_info(el: &JSXElement) -> String {
  if el.children.len() != 1 {
    HANDLER.with(|handler| {
      handler
        .struct_span_err(
          el.span,
          &format!(
            "Expected one child under JSX style tag, but got {} (eg: <style jsx>{{`hi`}}</style>)",
            el.children.len()
          ),
        )
        .emit()
    });
  }

  let child = &el.children[0];

  if let JSXElementChild::JSXExprContainer(JSXExprContainer {
    expr: JSXExpr::Expr(expr),
    ..
  }) = child
  {
    let mut hasher = DefaultHasher::new();
    match &**expr {
      Expr::Lit(Lit::Str(str_lit)) => hasher.write(str_lit.value.as_ref().as_bytes()),
      Expr::Tpl(Tpl { exprs, quasis, .. }) => {
        if exprs.len() == 0 {
          hasher.write(quasis[0].raw.value.as_bytes())
        }
      }
      _ => panic!("Not implemented"),
    }
    let result = hasher.finish();
    format!("{:x}", result)
  } else {
    // TODO: print the type that was found
    HANDLER.with(|handler| {
      handler
        .struct_span_err(
          el.span,
          "Expected a child of type JSXExpressionContainer under JSX Style tag (eg: <style \
           jsx>{{`hi`}}</style>)",
        )
        .emit()
    });
    panic!();
  }
}

fn replace_jsx_style(mut el: JSXElement, style_hash: String) -> JSXElementChild {
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
            expr: JSXExpr::Expr(Box::new(string_literal_expr(style_hash.clone().as_str()))),
            span: DUMMY_SP,
          })),
          span: DUMMY_SP,
        });
      }
    }
  }
  JSXElementChild::JSXElement(Box::new(el))
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

fn string_literal_expr(str: &str) -> Expr {
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
fn hash_string(str: &String) -> String {
  let mut hasher = DefaultHasher::new();
  hasher.write(str.as_bytes());
  let hash_result = hasher.finish();
  format!("{:x}", hash_result)
}

fn is_capitalized(word: &str) -> bool {
  word.chars().next().unwrap().is_uppercase()
}
