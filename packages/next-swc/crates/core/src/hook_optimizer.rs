use swc_atoms::JsWord;
use swc_common::DUMMY_SP;
use swc_ecmascript::ast::{
    ArrayPat, Callee, Decl, Expr, Ident, ImportDecl, ImportSpecifier, KeyValuePatProp, Number,
    ObjectPat, ObjectPatProp, Pat, PropName, VarDecl, VarDeclarator,
};
use swc_ecmascript::visit::{Fold, FoldWith};

pub fn hook_optimizer() -> impl Fold {
    HookOptimizer::default()
}

#[derive(Debug, Default)]
struct HookOptimizer {
    hooks: Vec<JsWord>,
}

impl Fold for HookOptimizer {
    // Find hooks imported from react/preact
    fn fold_import_decl(&mut self, decl: ImportDecl) -> ImportDecl {
        let ImportDecl {
            ref src,
            ref specifiers,
            ..
        } = decl;
        if &src.value == "react" || &src.value == "preact/hooks" {
            for specifier in specifiers {
                if let ImportSpecifier::Named(named_specifier) = specifier {
                    if named_specifier.local.sym.starts_with("use") {
                        self.hooks.push(named_specifier.local.sym.clone())
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
                let mut new_decls = Vec::with_capacity(decls.len());
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
        } = &decl;
        let init_clone = init.clone();
        if let Pat::Array(a) = name {
            if let Expr::Call(c) = &*init.as_deref().unwrap() {
                if let Callee::Expr(i) = &c.callee {
                    if let Expr::Ident(Ident { sym, .. }) = &**i {
                        if self.hooks.contains(sym) {
                            let name = get_object_pattern(a);
                            return VarDeclarator {
                                name,
                                init: init_clone,
                                span: *span,
                                definite: *definite,
                            };
                        }
                    }
                }
            }
        }

        decl
    }
}

fn get_object_pattern(array_pattern: &ArrayPat) -> Pat {
    let props: Vec<ObjectPatProp> = array_pattern
        .elems
        .iter()
        .enumerate()
        .filter_map(|(i, elem)| {
            elem.as_ref().map(|elem| {
                ObjectPatProp::KeyValue(KeyValuePatProp {
                    key: PropName::Num(Number {
                        value: i as f64,
                        span: DUMMY_SP,
                        raw: None,
                    }),
                    value: Box::new(elem.clone()),
                })
            })
        })
        .collect();

    Pat::Object(ObjectPat {
        props,
        span: DUMMY_SP,
        optional: false,
        type_ann: None,
    })
}
