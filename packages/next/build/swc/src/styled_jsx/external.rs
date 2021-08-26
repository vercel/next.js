use swc_common::DUMMY_SP;
use swc_ecmascript::ast::*;
use swc_ecmascript::utils::ident::{Id, IdentLike};
use swc_ecmascript::visit::{Fold, FoldWith};

use super::utils::{compute_class_names, get_jsx_style_info};

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
            Expr::TaggedTpl(process_tagged_template_expr(tagged_tpl))
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

fn process_tagged_template_expr(tagged_tpl: TaggedTpl) -> TaggedTpl {
  let style_info = get_jsx_style_info(&Expr::Tpl(tagged_tpl.tpl.clone()));
  let (static_class_name, class_name) = compute_class_names(&vec![style_info]);
  panic!("Not finished")
}
