use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::ident::{Id, IdentLike};
use swc_ecmascript::visit::{Fold, FoldWith};

use super::transform_css::transform_css;
use super::utils::*;

pub fn external_styles() -> impl 'static + Fold {
  ExternalStyles::default()
}

#[derive(Default)]
struct ExternalStyles {
  external_bindings: Vec<Id>,
}

impl Fold for ExternalStyles {
  fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
    let ImportDecl {
      ref src,
      ref specifiers,
      ..
    } = decl;
    if &src.value == "styled-jsx/css" {
      for specifier in specifiers {
        match specifier {
          ImportSpecifier::Default(default_specifier) => {
            self.external_bindings.push(default_specifier.local.to_id())
          }
          ImportSpecifier::Named(named_specifier) => {
            self.external_bindings.push(named_specifier.local.to_id())
          }
          _ => panic!("Not implemented yet"),
        }
      }
    }

    decl
  }

  fn fold_expr(&mut self, expr: Expr) -> Expr {
    let expr = expr.fold_children_with(self);
    match expr {
      Expr::TaggedTpl(tagged_tpl) => match &*tagged_tpl.tag {
        Expr::Ident(identifier) => {
          if self.external_bindings.contains(&identifier.to_id()) {
            process_tagged_template_expr(tagged_tpl)
          } else {
            Expr::TaggedTpl(tagged_tpl)
          }
        }
        _ => Expr::TaggedTpl(tagged_tpl),
      },
      expr => expr,
    }
  }
}

fn process_tagged_template_expr(tagged_tpl: TaggedTpl) -> Expr {
  let style_info = get_jsx_style_info(&Expr::Tpl(tagged_tpl.tpl.clone()));
  let styles = vec![style_info];
  let (static_class_name, class_name) = compute_class_names(&styles);
  let mut tag_opt = None;
  if let Expr::Ident(Ident { sym, .. }) = &*tagged_tpl.tag {
    tag_opt = Some(sym.to_string());
  }
  let tag = tag_opt.unwrap();

  let css = transform_css(&styles[0], tag == "global", &static_class_name);

  if tag == "resolve" {
    return Expr::Object(ObjectLit {
      props: vec![
        PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
          key: PropName::Ident(Ident {
            sym: "styles".into(),
            span: DUMMY_SP,
            optional: false,
          }),
          value: Box::new(Expr::JSXElement(Box::new(make_styled_jsx_el(
            &styles[0], css,
          )))),
        }))),
        PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
          key: PropName::Ident(Ident {
            sym: "className".into(),
            span: DUMMY_SP,
            optional: false,
          }),
          value: Box::new(class_name.unwrap()),
        }))),
      ],
      span: DUMMY_SP,
    });
  }

  Expr::New(NewExpr {
    callee: Box::new(Expr::Ident(Ident {
      sym: "String".into(),
      span: DUMMY_SP,
      optional: false,
    })),
    args: Some(vec![ExprOrSpread {
      expr: Box::new(css),
      spread: None,
    }]),
    span: DUMMY_SP,
    type_args: None,
  })
}
