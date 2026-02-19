use swc_core::{
    common::{Span, Spanned, DUMMY_SP},
    ecma::{
        ast::*,
        visit::{fold_pass, Fold},
    },
};

pub fn debug_instant_stack() -> impl Pass {
    fold_pass(DebugInstantStack {
        instant_export_span: None,
    })
}

struct DebugInstantStack {
    instant_export_span: Option<Span>,
}

impl Fold for DebugInstantStack {
    fn fold_module_items(&mut self, items: Vec<ModuleItem>) -> Vec<ModuleItem> {
        // Scan for `export const unstable_instant = ...`
        for item in &items {
            if let ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export_decl)) = item {
                if let Decl::Var(var_decl) = &export_decl.decl {
                    for decl in &var_decl.decls {
                        if let Pat::Ident(ident) = &decl.name {
                            if ident.id.sym == "unstable_instant" {
                                if let Some(init) = &decl.init {
                                    self.instant_export_span = Some(init.span());
                                }
                            }
                        }
                    }
                }
            }
        }

        if let Some(source_span) = self.instant_export_span {
            let mut new_items = items;
            new_items.push(ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                span: DUMMY_SP,
                decl: Decl::Var(Box::new(VarDecl {
                    decls: vec![VarDeclarator {
                        name: Pat::Ident(BindingIdent {
                            id: Ident {
                                sym: "__debugInstantStack".into(),
                                ..Default::default()
                            },
                            type_ann: None,
                        }),
                        init: Some(Box::new(Expr::Cond(CondExpr {
                            span: DUMMY_SP,
                            // process.env.NODE_ENV !== "production"
                            test: Box::new(Expr::Bin(BinExpr {
                                span: DUMMY_SP,
                                op: BinaryOp::NotEqEq,
                                left: Box::new(Expr::Member(MemberExpr {
                                    span: DUMMY_SP,
                                    obj: Box::new(Expr::Member(MemberExpr {
                                        span: DUMMY_SP,
                                        obj: Box::new(Expr::Ident(Ident {
                                            sym: "process".into(),
                                            ..Default::default()
                                        })),
                                        prop: MemberProp::Ident(IdentName {
                                            sym: "env".into(),
                                            span: DUMMY_SP,
                                        }),
                                    })),
                                    prop: MemberProp::Ident(IdentName {
                                        sym: "NODE_ENV".into(),
                                        span: DUMMY_SP,
                                    }),
                                })),
                                right: Box::new(Expr::Lit(Lit::Str(Str {
                                    span: DUMMY_SP,
                                    value: "production".into(),
                                    raw: None,
                                }))),
                            })),
                            // new Error()
                            cons: Box::new(Expr::New(NewExpr {
                                callee: Box::new(Expr::Ident(Ident {
                                    sym: "Error".into(),
                                    span: source_span,
                                    ..Default::default()
                                })),
                                args: Some(vec![]),
                                span: source_span,
                                ..Default::default()
                            })),
                            // undefined
                            alt: Box::new(Expr::Ident(Ident {
                                sym: "undefined".into(),
                                ..Default::default()
                            })),
                        }))),
                        span: DUMMY_SP,
                        definite: false,
                    }],
                    span: DUMMY_SP,
                    kind: VarDeclKind::Const,
                    ..Default::default()
                })),
            })));
            new_items
        } else {
            items
        }
    }
}
