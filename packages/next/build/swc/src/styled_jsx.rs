use std::collections::hash_map::DefaultHasher;
use std::hash::Hasher;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::HANDLER;
use swc_ecmascript::visit::{Fold, FoldWith};

pub fn styled_jsx() -> impl Fold {
  StyledJSXTransformer::default()
}

#[derive(Debug, Default)]
struct StyledJSXTransformer {
  class_name: Option<String>,
  file_has_styled_jsx: bool,
  has_styled_jsx: bool,
}

impl Fold for StyledJSXTransformer {
  fn fold_jsx_element(&mut self, mut el: JSXElement) -> JSXElement {
    if self.has_styled_jsx && !is_styled_jsx(&el) {
      return el.fold_children_with(self);
    }

    let mut style_hashes = vec![];
    for i in 0..el.children.len() {
      if let JSXElementChild::JSXElement(child_el) = &el.children[i] {
        if is_styled_jsx(&child_el) {
          self.file_has_styled_jsx = true;
          self.has_styled_jsx = true;
          let style_hash = get_jsx_style_info(&child_el);
          style_hashes.push(style_hash.clone());
          el.children[i] = replace_jsx_style(*child_el.clone(), hash_string(&style_hash));
        }
      }
    }

    if style_hashes.len() > 0 {
      self.class_name = Some(format!("jsx-{}", hash_string(&style_hashes.join(","))));
    }

    let el = el.fold_children_with(self);
    self.has_styled_jsx = false;
    self.class_name = None;

    el
  }

  fn fold_jsx_opening_element(&mut self, mut el: JSXOpeningElement) -> JSXOpeningElement {
    if !self.has_styled_jsx {
      return el;
    }

    if let JSXElementName::Ident(Ident { sym, .. }) = &el.name {
      if sym != "style" && sym != "_JSXStyle" {
        let mut class_name = self.class_name.clone().unwrap();
        let mut existing_index = None;
        for i in 0..el.attrs.len() {
          let attr = &el.attrs[i];
          if let JSXAttrOrSpread::JSXAttr(JSXAttr {
            name: JSXAttrName::Ident(Ident { sym, .. }),
            value,
            ..
          }) = attr
          {
            if sym == "className" {
              // TODO: handle maybe no value
              class_name = combine_class_names(class_name, &value.as_ref().unwrap());
              existing_index = Some(i);
              break;
            }
          }
        }

        let class_name_attr = JSXAttrOrSpread::JSXAttr(JSXAttr {
          span: DUMMY_SP,
          name: JSXAttrName::Ident(Ident {
            span: DUMMY_SP,
            sym: "className".into(),
            optional: false,
          }),
          value: Some(JSXAttrValue::Lit(Lit::Str(Str {
            value: class_name.into(),
            span: DUMMY_SP,
            kind: StrKind::Synthesized {},
            has_escape: false,
          }))),
        });

        if let Some(i) = existing_index {
          el.attrs[i] = class_name_attr
        } else {
          el.attrs.push(class_name_attr);
        }
      }
    }

    el
  }

  fn fold_module(&mut self, module: Module) -> Module {
    let mut module = module.fold_children_with(self);

    if self.file_has_styled_jsx {
      module
        .body
        .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
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
        })));
    }
    module
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
    if let Expr::Lit(Lit::Str(str)) = &**expr {
      hasher.write(str.value.as_ref().as_bytes());
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
            expr: JSXExpr::Expr(Box::new(Expr::Lit(Lit::Str(Str {
              value: style_hash.clone().into(),
              span: DUMMY_SP,
              kind: StrKind::Synthesized {},
              has_escape: false,
            })))),
            span: DUMMY_SP,
          })),
          span: DUMMY_SP,
        });
      }
    }
  }
  JSXElementChild::JSXElement(Box::new(el))
}

fn combine_class_names(jsx_class_name: String, value: &JSXAttrValue) -> String {
  match value {
    JSXAttrValue::Lit(Lit::Str(Str { value, .. })) => {
      format!("{} {}", jsx_class_name, value)
    }
    _ => panic!("Not implemented yet"),
  }
}

// TODO: maybe use DJBHasher (need to implement)
fn hash_string(str: &String) -> String {
  let mut hasher = DefaultHasher::new();
  hasher.write(str.as_bytes());
  let hash_result = hasher.finish();
  format!("{:x}", hash_result)
}
