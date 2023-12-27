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

fn effect_has_side_effect_deps(call: &CallExpr) -> bool {
    if call.args.len() != 2 {
        return false;
    }

    // We can't optimize if the effect has a function call as a dependency:
    // useEffect(() => {}, x())
    if let box Expr::Call(_) = &call.args[1].expr {
        return true;
    }

    // As well as:
    // useEffect(() => {}, [x()])
    if let box Expr::Array(arr) = &call.args[1].expr {
        for elem in arr.elems.iter().flatten() {
            if let ExprOrSpread {
                expr: box Expr::Call(_),
                ..
            } = elem
            {
                return true;
            }
        }
    }

    false
}

impl Fold for OptimizeServerReact {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        let mut new_items = vec![];

        for item in items {
            new_items.push(item.clone().fold_with(self));

            if let ModuleItem::ModuleDecl(ModuleDecl::Import(import_decl)) = &item {
                if import_decl.src.value != "react" {
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
        }

        new_items
    }

    fn fold_expr(&mut self, expr: Expr) -> Expr {
        if let Expr::Call(call) = &expr {
            if let Callee::Expr(box Expr::Ident(f)) = &call.callee {
                // Remove `useEffect` call
                if let Some(use_effect_ident) = &self.use_effect_ident {
                    if &f.to_id() == use_effect_ident && !effect_has_side_effect_deps(call) {
                        return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                    }
                }
                // Remove `useLayoutEffect` call
                if let Some(use_layout_effect_ident) = &self.use_layout_effect_ident {
                    if &f.to_id() == use_layout_effect_ident && !effect_has_side_effect_deps(call) {
                        return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                    }
                }
            } else if let Some(react_ident) = &self.react_ident {
                if let Callee::Expr(box Expr::Member(member)) = &call.callee {
                    if let box Expr::Ident(f) = &member.obj {
                        if &f.to_id() == react_ident {
                            if let MemberProp::Ident(i) = &member.prop {
                                // Remove `React.useEffect` and `React.useLayoutEffect` calls
                                if i.sym == "useEffect" || i.sym == "useLayoutEffect" {
                                    return Expr::Lit(Lit::Null(Null { span: DUMMY_SP }));
                                }
                            }
                        }
                    }
                }
            }
        }

        expr.fold_children_with(self)
    }

    // const [state, setState] = useState(x);
    // const [state, setState] = React.useState(x);
    fn fold_var_declarator(&mut self, decl: VarDeclarator) -> VarDeclarator {
        if !self.optimize_use_state {
            return decl;
        }

        if let Pat::Array(array_pat) = &decl.name {
            if array_pat.elems.len() == 2 {
                if let Some(box Expr::Call(call)) = &decl.init {
                    if let Callee::Expr(box Expr::Ident(f)) = &call.callee {
                        if let Some(use_state_ident) = &self.use_state_ident {
                            if &f.to_id() == use_state_ident && call.args.len() == 1 {
                                // We do the optimization only if the arg is a literal or a
                                // type that we can
                                // be sure is not a function (e.g. {} or [] lit).
                                // This is because useState allows a function as the
                                // initialiser.
                                match &call.args[0].expr {
                                    box Expr::Lit(_) | box Expr::Object(_) | box Expr::Array(_) => {
                                        // const [state, setState] = [x, () => {}];
                                        return VarDeclarator {
                                            definite: false,
                                            name: decl.name.clone(),
                                            init: Some(Box::new(Expr::Array(ArrayLit {
                                                elems: vec![
                                                    Some(call.args[0].expr.clone().into()),
                                                    Some(
                                                        Expr::Arrow(ArrowExpr {
                                                            span: DUMMY_SP,
                                                            body: Box::new(BlockStmtOrExpr::Expr(
                                                                Box::new(Expr::Lit(Lit::Null(
                                                                    Null { span: DUMMY_SP },
                                                                ))),
                                                            )),
                                                            is_async: false,
                                                            is_generator: false,
                                                            params: vec![],
                                                            return_type: None,
                                                            type_params: None,
                                                        })
                                                        .into(),
                                                    ),
                                                ],
                                                span: DUMMY_SP,
                                            }))),
                                            span: DUMMY_SP,
                                        };
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }

        decl.fold_children_with(self)
    }
}
