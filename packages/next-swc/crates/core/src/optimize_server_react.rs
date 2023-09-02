// This transform optimizes React code for the server bundle, in particular:
// - Removes `useEffect` and `useLayoutEffect` calls
// - Refactors `useState` calls (under the `optimize_use_state` flag)

use serde::Deserialize;
use turbopack_binding::swc::core::{
    common::DUMMY_SP,
    ecma::{
        ast::*,
        visit::{Fold, FoldWith},
    },
};

#[derive(Clone, Debug, Deserialize)]
pub struct Config {
    pub optimize_use_state: bool,
}

pub fn optimize_server_react(config: Config) -> impl Fold {
    OptimizeServerReact {
        optimize_use_state: config.optimize_use_state,
        ..Default::default()
    }
}

#[derive(Debug, Default)]
struct OptimizeServerReact {
    optimize_use_state: bool,
    react_ident: Option<Id>,
    use_state_ident: Option<Id>,
    use_effect_ident: Option<Id>,
    use_layout_effect_ident: Option<Id>,
}

impl Fold for OptimizeServerReact {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        let mut new_items = vec![];

        for item in items {
            if let ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = &item {
                if import_decl.src.value.to_string() != "react" {
                    continue;
                }
                for specifier in &import_decl.specifiers {
                    if let ImportSpecifier::Named(named_import) = specifier {
                        let name = match &named_import.imported {
                            Some(n) => match &n {
                                ModuleExportName::Ident(n) => n.sym.to_string(),
                                ModuleExportName::Str(n) => n.value.to_string(),
                            },
                            None => named_import.local.sym.to_string(),
                        };

                        if name == "useState" {
                            self.use_state_ident = Some(named_import.local.to_id());
                        } else if name == "useEffect" {
                            self.use_effect_ident = Some(named_import.local.to_id());
                        } else if name == "useLayoutEffect" {
                            self.use_layout_effect_ident = Some(named_import.local.to_id());
                        }
                    } else if let ImportSpecifier::Default(default_import) = specifier {
                        self.react_ident = Some(default_import.local.to_id());
                    }
                }
            }

            new_items.push(item.fold_with(self));
        }

        new_items
    }

    fn fold_expr(&mut self, expr: Expr) -> Expr {
        if let Expr::Call(call) = &expr {
            if let Callee::Expr(box Expr::Ident(f)) = &call.callee {
                // Remove `useEffect` call
                if let Some(use_effect_ident) = &self.use_effect_ident {
                    if &f.to_id() == use_effect_ident {
                        return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                    }
                }
                // Remove `useLayoutEffect` call
                if let Some(use_layout_effect_ident) = &self.use_layout_effect_ident {
                    if &f.to_id() == use_layout_effect_ident {
                        return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                    }
                }
            } else if let Some(react_ident) = &self.react_ident {
                if let Callee::Expr(box Expr::Member(member)) = &call.callee {
                    if let box Expr::Ident(f) = &member.obj {
                        if &f.to_id() == react_ident {
                            if let MemberProp::Ident(i) = &member.prop {
                                // Remove `React.useEffect` and `React.useLayoutEffect` calls
                                if i.sym.to_string() == "useEffect" {
                                    return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                                } else if i.sym.to_string() == "useLayoutEffect" {
                                    return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                                }
                            }
                        }
                    }
                }
            }
        }

        expr
    }

    // const [state, setState] = useState(x);
    // const [state, setState] = React.useState(x);
    fn fold_var_declarators(&mut self, d: Vec<VarDeclarator>) -> Vec<VarDeclarator> {
        let mut new_d = vec![];
        for decl in d {
            if let Pat::Array(array_pat) = &decl.name {
                if array_pat.elems.len() == 2 {
                    if let Some(array_pat_1) = &array_pat.elems[0] {
                        if let Some(array_pat_2) = &array_pat.elems[1] {
                            if let Some(box expr) = &decl.init {
                                match expr {
                                    Expr::Call(call) => {
                                        if let Callee::Expr(box Expr::Ident(f)) = &call.callee {
                                            if let Some(use_state_ident) = &self.use_state_ident {
                                                if &f.to_id() == use_state_ident
                                                    && call.args.len() == 1
                                                {
                                                    // const state = x, setState = () => {};
                                                    new_d.push(VarDeclarator {
                                                        definite: false,
                                                        name: array_pat_1.clone(),
                                                        init: Some(call.args[0].expr.clone()),
                                                        span: DUMMY_SP,
                                                    });
                                                    new_d.push(VarDeclarator {
                                                        definite: false,
                                                        name: array_pat_2.clone(),
                                                        init: Some(Box::new(Expr::Arrow(
                                                            ArrowExpr {
                                                                body: Box::new(
                                                                    BlockStmtOrExpr::Expr(
                                                                        Box::new(Expr::Lit(
                                                                            Lit::Null(Null {
                                                                                span: DUMMY_SP,
                                                                            }),
                                                                        )),
                                                                    ),
                                                                ),
                                                                params: vec![],
                                                                is_async: false,
                                                                is_generator: false,
                                                                span: DUMMY_SP,
                                                                type_params: None,
                                                                return_type: None,
                                                            },
                                                        ))),
                                                        span: DUMMY_SP,
                                                    });
                                                    continue;
                                                }
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }

            new_d.push(decl.fold_with(self));
        }

        new_d
    }
}
