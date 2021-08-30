use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use swc_common::Span;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;

use super::JSXStyleInfo;

pub fn get_jsx_style_info(expr: &Expr) -> JSXStyleInfo {
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
    is_dynamic,
    expressions,
  };
}

pub fn compute_class_names(
  styles: &Vec<JSXStyleInfo>,
  style_import_name: &String,
) -> (Option<String>, Option<Expr>) {
  let mut static_class_name = None;
  let mut class_name = None;
  let mut static_hashes = vec![];
  let mut dynamic_styles = vec![];
  for style_info in styles {
    if !style_info.is_dynamic {
      static_hashes.push(style_info.hash.clone());
    } else {
      dynamic_styles.push(style_info.clone());
    }
  }

  if static_hashes.len() > 0 {
    static_class_name = Some(format!("jsx-{}", hash_string(&static_hashes.join(","))));
  }

  let dynamic_class_name = match dynamic_styles.len() {
    0 => None,
    _ => Some(Expr::Call(CallExpr {
      callee: ExprOrSuper::Expr(Box::new(Expr::Member(MemberExpr {
        obj: ExprOrSuper::Expr(Box::new(Expr::Ident(Ident {
          sym: style_import_name.to_string().into(),
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
          let hash_input = match &static_class_name {
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

  let mut class_name_expr = match &static_class_name {
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
    class_name = Some(class_name_expr);
  }

  (static_class_name, class_name)
}

pub fn make_styled_jsx_el(
  style_info: &JSXStyleInfo,
  css_expr: Expr,
  style_import_name: &String,
) -> JSXElement {
  let mut attrs = vec![JSXAttrOrSpread::JSXAttr(JSXAttr {
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
  })];

  if style_info.is_dynamic {
    attrs.push(JSXAttrOrSpread::JSXAttr(JSXAttr {
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

  let opening = JSXOpeningElement {
    name: JSXElementName::Ident(Ident {
      sym: style_import_name.to_string().into(),
      span: DUMMY_SP,
      optional: false,
    }),
    attrs,
    span: DUMMY_SP,
    self_closing: false,
    type_args: None,
  };

  let closing = Some(JSXClosingElement {
    name: JSXElementName::Ident(Ident {
      sym: style_import_name.to_string().into(),
      span: DUMMY_SP,
      optional: false,
    }),
    span: DUMMY_SP,
  });

  let children = vec![JSXElementChild::JSXExprContainer(JSXExprContainer {
    expr: JSXExpr::Expr(Box::new(css_expr)),
    span: DUMMY_SP,
  })];
  JSXElement {
    opening,
    closing,
    children,
    span: DUMMY_SP,
  }
}

pub fn get_usable_import_specifier(items: &Vec<ModuleItem>) -> String {
  // TODO
  String::from("_JSXStyle")
}

pub fn styled_jsx_import_decl(style_import_name: &String) -> ModuleItem {
  ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
    asserts: None,
    span: DUMMY_SP,
    type_only: false,
    specifiers: vec![ImportSpecifier::Default(ImportDefaultSpecifier {
      local: Ident {
        sym: String::from(style_import_name).into(),
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
  }))
}

// TODO: maybe use DJBHasher (need to implement)
pub fn hash_string(str: &String) -> String {
  let mut hasher = DefaultHasher::new();
  hasher.write(str.as_bytes());
  let hash_result = hasher.finish();
  format!("{:x}", hash_result)
}

pub fn string_literal_expr(str: &str) -> Expr {
  Expr::Lit(Lit::Str(Str {
    value: str.into(),
    span: DUMMY_SP,
    has_escape: false,
    kind: StrKind::Synthesized {},
  }))
}

pub fn ident(str: &str) -> Ident {
  Ident {
    sym: String::from(str).into(),
    span: DUMMY_SP,
    optional: false,
  }
}

pub fn is_capitalized(word: &str) -> bool {
  word.chars().next().unwrap().is_uppercase()
}

pub fn add(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::Add, left, right)
}

pub fn and(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::LogicalAnd, left, right)
}

pub fn or(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::LogicalOr, left, right)
}

pub fn not_eq(left: Expr, right: Expr) -> Expr {
  binary_expr(BinaryOp::NotEq, left, right)
}

pub fn binary_expr(op: BinaryOp, left: Expr, right: Expr) -> Expr {
  Expr::Bin(BinExpr {
    op,
    left: Box::new(left),
    right: Box::new(right),
    span: DUMMY_SP,
  })
}
