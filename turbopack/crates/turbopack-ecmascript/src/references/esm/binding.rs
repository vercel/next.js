use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::Span,
    ecma::{
        ast::{
            ComputedPropName, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Number, Prop,
            PropName, SeqExpr, SimpleAssignTarget, Str,
        },
        visit::fields::{CalleeField, PropField},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, Vc};
use turbopack_core::{chunk::ChunkingContext, module_graph::ModuleGraph};

use super::EsmAssetReference;
use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::{esm::base::ReferencedAsset, AstPath},
};

#[derive(Hash, Clone, Debug, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs, NonLocalValue)]
pub struct EsmBinding {
    pub reference: ResolvedVc<EsmAssetReference>,
    pub export: Option<RcStr>,
    pub ast_path: AstPath,
}

impl EsmBinding {
    pub fn new(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: AstPath,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
        }
    }

    pub async fn code_generation(
        &self,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = vec![];

        let export = self.export.clone();
        let imported_module = self.reference.get_referenced_asset();

        enum ImportedIdent {
            Module(String),
            None,
            Unresolvable,
        }

        let imported_ident = match &*imported_module.await? {
            ReferencedAsset::None => ImportedIdent::None,
            imported_module => imported_module
                .get_ident(chunking_context)
                .await?
                .map_or(ImportedIdent::Unresolvable, ImportedIdent::Module),
        };

        let mut ast_path = self.ast_path.0.clone();
        loop {
            match ast_path.last() {
                // Shorthand properties get special treatment because we need to rewrite them to
                // normal key-value pairs.
                Some(swc_core::ecma::visit::AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path.pop();
                    visitors.push(
                        create_visitor!(exact ast_path, visit_mut_prop(prop: &mut Prop) {
                            if let Prop::Shorthand(ident) = prop {
                                // TODO: Merge with the above condition when https://rust-lang.github.io/rfcs/2497-if-let-chains.html lands.
                                match &imported_ident {
                                    ImportedIdent::Module(imported_ident) => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Box::new(make_expr(
                                                imported_ident,
                                                export.as_deref(),
                                                ident.span,
                                                false,
                                            )),
                                        });
                                    }
                                    ImportedIdent::None => {
                                        *prop = Prop::KeyValue(KeyValueProp {
                                            key: PropName::Ident(ident.clone().into()),
                                            value: Expr::undefined(ident.span),
                                        });
                                    }
                                    ImportedIdent::Unresolvable => {
                                        // Do nothing, the reference will insert a throw
                                    }
                                }
                            }
                        }),
                    );
                    break;
                }
                // Any other expression can be replaced with the import accessor.
                Some(swc_core::ecma::visit::AstParentKind::Expr(_)) => {
                    ast_path.pop();
                    let in_call = matches!(
                        ast_path.last(),
                        Some(swc_core::ecma::visit::AstParentKind::Callee(
                            CalleeField::Expr
                        ))
                    );

                    visitors.push(
                        create_visitor!(exact ast_path, visit_mut_expr(expr: &mut Expr) {
                            use swc_core::common::Spanned;
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident) => {
                                    *expr = make_expr(imported_ident, export.as_deref(), expr.span(), in_call);
                                }
                                ImportedIdent::None => {
                                    *expr = *Expr::undefined(expr.span());
                                }
                                ImportedIdent::Unresolvable => {
                                    // Do nothing, the reference will insert a throw
                                }
                            }
                        }),
                    );
                    break;
                }
                Some(swc_core::ecma::visit::AstParentKind::BindingIdent(
                    swc_core::ecma::visit::fields::BindingIdentField::Id,
                )) => {
                    ast_path.pop();

                    // We need to handle LHS because of code like
                    // (function (RouteKind1){})(RouteKind || RouteKind = {})
                    if let Some(swc_core::ecma::visit::AstParentKind::SimpleAssignTarget(
                        swc_core::ecma::visit::fields::SimpleAssignTargetField::Ident,
                    )) = ast_path.last()
                    {
                        ast_path.pop();

                        visitors.push(
                        create_visitor!(exact ast_path, visit_mut_simple_assign_target(l: &mut SimpleAssignTarget) {
                            use swc_core::common::Spanned;
                            match &imported_ident {
                                ImportedIdent::Module(imported_ident) => {
                                    *l = match make_expr(imported_ident, export.as_deref(), l.span(), false) {
                                        Expr::Ident(ident) => SimpleAssignTarget::Ident(ident.into()),
                                        Expr::Member(member) => SimpleAssignTarget::Member(member),
                                        _ => unreachable!(),
                                    };
                                }
                                ImportedIdent::None => {
                                    // Do nothing, cannot assign to `undefined`
                                }
                                ImportedIdent::Unresolvable => {
                                    // Do nothing, the reference will insert a throw
                                }
                            }
                        }));
                        break;
                    }
                }
                Some(_) => {
                    ast_path.pop();
                }
                None => break,
            }
        }

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<EsmBinding> for CodeGen {
    fn from(val: EsmBinding) -> Self {
        CodeGen::EsmBinding(val)
    }
}

fn make_expr(imported_module: &str, export: Option<&str>, span: Span, in_call: bool) -> Expr {
    if let Some(export) = export {
        let mut expr = Expr::Member(MemberExpr {
            span,
            obj: Box::new(Expr::Ident(Ident::new(
                imported_module.into(),
                span,
                Default::default(),
            ))),
            prop: MemberProp::Computed(ComputedPropName {
                span,
                expr: Box::new(Expr::Lit(Lit::Str(Str {
                    span,
                    value: export.into(),
                    raw: None,
                }))),
            }),
        });
        if in_call {
            expr = Expr::Seq(SeqExpr {
                exprs: vec![
                    Box::new(Expr::Lit(Lit::Num(Number {
                        span,
                        value: 0.0,
                        raw: None,
                    }))),
                    Box::new(expr),
                ],
                span,
            });
        }
        expr
    } else {
        Expr::Ident(Ident::new(imported_module.into(), span, Default::default()))
    }
}
