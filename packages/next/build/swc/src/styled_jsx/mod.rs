use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use swc_common::Span;
use swc_common::{collections::AHashSet, DUMMY_SP};
use swc_ecmascript::ast::*;
use swc_ecmascript::minifier::{
  eval::{EvalResult, Evaluator},
  marks::Marks,
};
use swc_ecmascript::utils::{collect_decls, prepend, Id, HANDLER};
use swc_ecmascript::visit::{Fold, FoldWith};

use external::external_styles;
use transform_css::transform_css;
use utils::*;

mod external;
mod transform_css;
mod utils;

pub fn styled_jsx() -> impl Fold {
  StyledJSXTransformer::default()
}

#[derive(Default)]
struct StyledJSXTransformer {
  styles: Vec<JSXStyleInfo>,
  static_class_name: Option<String>,
  class_name: Option<Expr>,
  file_has_styled_jsx: bool,
  has_styled_jsx: bool,
  scope_bindings: AHashSet<Id>,
  style_import_name: Option<String>,
  evaluator: Option<Evaluator>,
}

#[derive(Debug, Clone)]
pub struct JSXStyleInfo {
  hash: String,
  css: String,
  css_span: Span,
  is_dynamic: bool,
  expressions: Vec<Box<Expr>>,
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
        && sym != self.style_import_name.as_ref().unwrap()
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
    self.style_import_name = Some(get_usable_import_specifier(&items));
    let mut items = items.fold_children_with(self);
    if self.file_has_styled_jsx {
      prepend(
        &mut items,
        styled_jsx_import_decl(self.style_import_name.as_ref().unwrap()),
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

  fn fold_module(&mut self, module: Module) -> Module {
    self.evaluator = Some(Evaluator::new(module.clone(), Marks::new()));
    let mut module = module.fold_children_with(self);
    module = module.fold_with(&mut external_styles(
      self.style_import_name.as_ref().unwrap(),
      self.file_has_styled_jsx,
    ));
    module
  }
}

impl StyledJSXTransformer {
  fn check_children_for_jsx_styles(&mut self, children: &Vec<JSXElementChild>) {
    let mut styles = vec![];
    for i in 0..children.len() {
      if let JSXElementChild::JSXElement(child_el) = &children[i] {
        if is_styled_jsx(&child_el) {
          self.file_has_styled_jsx = true;
          self.has_styled_jsx = true;
          let expr = get_style_expr(&child_el);
          let style_info = self.get_jsx_style_info(expr);
          styles.insert(0, style_info);
        }
      }
    }

    let (static_class_name, class_name) =
      compute_class_names(&styles, self.style_import_name.as_ref().unwrap());
    self.styles = styles;
    self.static_class_name = static_class_name;
    self.class_name = class_name;
  }

  fn get_jsx_style_info(&mut self, expr: &Expr) -> JSXStyleInfo {
    let mut hasher = DefaultHasher::new();
    let css: String;
    let css_span: Span;
    let is_dynamic;
    let mut expressions = vec![];
    match expr {
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
          css_span = span.clone();
          let res = self.evaluator.as_mut().unwrap().eval(&expr);
          is_dynamic = if let Some(EvalResult::Lit(_)) = res {
            false
          } else {
            true
          };
          expressions = exprs.clone();
        }
      }
      _ => panic!("Not implemented"),
    }
    return JSXStyleInfo {
      hash: format!("{:x}", hasher.finish()),
      css,
      css_span,
      is_dynamic,
      expressions,
    };
  }

  fn replace_jsx_style(&mut self, el: JSXElement) -> JSXElement {
    let style_info = self.styles.pop().unwrap();

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
    let css = transform_css(&style_info, is_global, &self.static_class_name);
    make_styled_jsx_el(&style_info, css, self.style_import_name.as_ref().unwrap())
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

fn get_style_expr(el: &JSXElement) -> &Expr {
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
    return &**expr;
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
