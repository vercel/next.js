use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::Span,
    ecma::{
        ast::{
            ComputedPropName, Expr, Ident, KeyValueProp, Lit, MemberExpr, MemberProp, Number, Prop,
            PropName, SeqExpr, SimpleAssignTarget, Str,
        },
        visit::{
            fields::{CalleeField, PropField},
            AstParentKind,
        },
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, TaskInput, Vc};
use turbopack_core::chunk::ChunkingContext;

use super::EsmAssetReference;
use crate::{
    code_gen::{CodeGenerateable, CodeGeneration, VisitorFactory},
    create_visitor,
    references::AstPath,
};

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmBindings {
    pub bindings: Vec<EsmBinding>,
}

#[turbo_tasks::value_impl]
impl EsmBindings {
    #[turbo_tasks::function]
    pub fn new(bindings: Vec<EsmBinding>) -> Vc<Self> {
        EsmBindings { bindings }.cell()
    }
}

#[derive(
    Hash, Clone, Debug, TaskInput, Serialize, Deserialize, PartialEq, Eq, TraceRawVcs, NonLocalValue,
)]
pub struct EsmBinding {
    pub reference: ResolvedVc<EsmAssetReference>,
    pub export: Option<RcStr>,
    pub ast_path: ResolvedVc<AstPath>,
}

impl EsmBinding {
    pub fn new(
        reference: ResolvedVc<EsmAssetReference>,
        export: Option<RcStr>,
        ast_path: ResolvedVc<AstPath>,
    ) -> Self {
        EsmBinding {
            reference,
            export,
            ast_path,
        }
    }

    async fn to_visitors(
        &self,
        visitors: &mut Vec<(Vec<AstParentKind>, Box<dyn VisitorFactory>)>,
    ) -> Result<()> {
        let item = self.clone();
        let imported_module = self.reference.get_referenced_asset();

        let mut ast_path = item.ast_path.await?.clone_value();
        let imported_module = imported_module.await?.get_ident().await?;

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
                            if let Some(imported_ident) = imported_module.as_deref() {
                                *prop = Prop::KeyValue(KeyValueProp {
                                    key: PropName::Ident(ident.clone().into()),
                                    value: Box::new(make_expr(imported_ident, item.export.as_deref(), ident.span, false))
                                });
                            }
                        }
                    }));
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
                        if let Some(ident) = imported_module.as_deref() {
                            use swc_core::common::Spanned;
                            *expr = make_expr(ident, item.export.as_deref(), expr.span(), in_call);
                        }
                        // If there's no identifier for the imported module,
                        // resolution failed and will insert code that throws
                        // before this expression is reached. Leave behind the original identifier.
                    }));
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
                                if let Some(ident) = imported_module.as_deref() {
                                    use swc_core::common::Spanned;
                                    *l = match make_expr(ident, item.export.as_deref(), l.span(), false) {
                                        Expr::Ident(ident) => SimpleAssignTarget::Ident(ident.into()),
                                        Expr::Member(member) => SimpleAssignTarget::Member(member),
                                        _ => unreachable!(),
                                    };
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

        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmBindings {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        _context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let mut visitors = Vec::new();
        let bindings = self.bindings.clone();

        for item in bindings.into_iter() {
            item.to_visitors(&mut visitors).await?;
        }

        Ok(CodeGeneration::visitors(visitors))
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
