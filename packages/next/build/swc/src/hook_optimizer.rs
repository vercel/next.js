use regex::Regex;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::{
  ArrayPat, Decl, Expr, ExprOrSuper, Ident, ImportDecl, ImportSpecifier, KeyValuePatProp, Number,
  ObjectPat, ObjectPatProp, Pat, PropName, VarDecl, VarDeclarator,
};
use swc_ecmascript::visit::{Fold, FoldWith};

pub fn hook_optimizer() -> impl Fold {
  HookOptimizer::default()
}

#[derive(Debug, Default)]
struct HookOptimizer {
  hooks: Vec<String>,
}

impl Fold for HookOptimizer {
  // Find hooks imported from react/preact
  fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
    let hook_re = Regex::new(r"^use[A-Z]").unwrap();
    let ImportDecl {
      ref src,
      ref specifiers,
      ..
    } = decl;
    if &src.value == "react" || &src.value == "preact/hooks" {
      for specifier in specifiers {
        if let ImportSpecifier::Named(named_specifier) = specifier {
          if hook_re.is_match(&named_specifier.local.sym) {
            self
              .hooks
              .push(String::from(&named_specifier.local.sym as &str))
          }
        }
      }
    }

    decl
  }
  // Transform array desctructing to object destructuring for relevant hooks
  fn fold_decl(&mut self, node: Decl) -> Decl {
    let node = node.fold_children_with(self);
    match node {
      Decl::Var(VarDecl {
        decls,
        span,
        kind,
        declare,
      }) => {
        let mut new_decls: Vec<VarDeclarator> = Vec::new();
        for decl in decls {
          new_decls.push(self.get_decl(decl));
        }

        Decl::Var(VarDecl {
          decls: new_decls,
          span,
          kind,
          declare,
        })
      }
      _ => node,
    }
  }
}

impl HookOptimizer {
  fn get_decl(&mut self, decl: VarDeclarator) -> VarDeclarator {
    let VarDeclarator {
      name,
      init,
      span,
      definite,
    } = decl.clone();
    if let Pat::Array(a) = name {
      if let Expr::Call(c) = &*init.as_deref().unwrap() {
        if let ExprOrSuper::Expr(i) = &c.callee {
          if let Expr::Ident(Ident { sym, .. }) = &**i {
            if self.hooks.contains(&sym.to_string()) {
              let name = get_object_pattern(&a);
              return VarDeclarator {
                name,
                init,
                span,
                definite,
              };
            }
          }
        }
      }
    }

    return decl;
  }
}

fn get_object_pattern(array_pattern: &ArrayPat) -> Pat {
  let props: Vec<ObjectPatProp> = array_pattern
    .elems
    .iter()
    .enumerate()
    .filter_map(|(i, elem)| match elem {
      Some(elem) => Some(ObjectPatProp::KeyValue(KeyValuePatProp {
        key: PropName::Num(Number {
          value: i as f64,
          span: DUMMY_SP,
        }),
        value: Box::new(elem.clone()),
      })),
      None => None,
    })
    .collect();

  Pat::Object(ObjectPat {
    props,
    span: DUMMY_SP,
    optional: false,
    type_ann: None,
  })
}
