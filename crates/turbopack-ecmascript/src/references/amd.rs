use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{CallExpr, Callee, Expr, ExprOrSpread, Ident},
};
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use super::pattern_mapping::{PatternMappingVc, ResolveType::Cjs};
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::{pattern_mapping::PatternMapping, AstPathVc},
    resolve::cjs_resolve,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct AmdDefineAssetReference {
    origin: ResolveOriginVc,
    request: RequestVc,
}

#[turbo_tasks::value_impl]
impl AmdDefineAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc) -> Self {
        Self::cell(AmdDefineAssetReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for AmdDefineAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AmdDefineAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "AMD define dependency {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for AmdDefineAssetReference {}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct AmdDefineWithDependenciesCodeGen {
    dependencies_requests: Vec<RequestVc>,
    origin: ResolveOriginVc,
    path: AstPathVc,
}

impl AmdDefineWithDependenciesCodeGenVc {
    pub fn new(
        dependencies_requests: Vec<RequestVc>,
        origin: ResolveOriginVc,
        path: AstPathVc,
    ) -> Self {
        Self::cell(AmdDefineWithDependenciesCodeGen {
            dependencies_requests,
            origin,
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for AmdDefineWithDependenciesCodeGen {
    #[turbo_tasks::function]
    async fn code_generation(&self, context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        let dependencies_pms: Vec<_> = self
            .dependencies_requests
            .iter()
            .map(|request| async move {
                PatternMappingVc::resolve_request(
                    self.origin,
                    context,
                    cjs_resolve(self.origin, *request),
                    Value::new(Cjs),
                )
                .await
            })
            .try_join()
            .await?;

        let path = &self.path.await?;
        visitors.push(
            // Transforms `define([dep1, dep2], factory)` into:
            // ```js
            // __turbopack_export_value__(
            //   factory(
            //     __turbopack_require__(dep1),
            //     __turbopack_require__(dep2),
            //   ),
            // );
            // ```
            create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                let args = std::mem::take(&mut call_expr.args);
                let factory = args.into_iter().last().expect("`AmdDefineWithDependenciesCodeGen` can only be created from an AMD define call with two or three arguments");
                let factory_call = Expr::Call(CallExpr {
                    callee: match factory {
                        ExprOrSpread { expr, spread: None } => {
                            Callee::Expr(expr)
                        }
                        _ => panic!("the spread operator is not supported within AMD define calls")
                    },
                    args: dependencies_pms.iter().map(|pm| {
                        match &**pm {
                            PatternMapping::Invalid => Expr::Ident(Ident::new("undefined".into(), DUMMY_SP)),
                            pm => Expr::Call(CallExpr {
                                span: DUMMY_SP,
                                callee: Callee::Expr(box Expr::Ident(Ident::new(if pm.is_internal_import() { "__turbopack_require__" } else { "require" }.into(), DUMMY_SP))),
                                args: vec![
                                    pm.create().into(),
                                ],
                                type_args: None
                            }),
                        }.into()
                    }).collect(),
                    span: DUMMY_SP,
                    type_args: None
                });
                call_expr.callee = Callee::Expr(box Expr::Ident(Ident::new("__turbopack_export_value__".into(), DUMMY_SP)));
                call_expr.args = vec![factory_call.into()];
            }),
        );

        Ok(CodeGeneration { visitors }.into())
    }
}
