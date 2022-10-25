use anyhow::Result;
use swc_core::{
    ecma::ast::{Callee, ExprOrSpread},
    quote_expr,
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::{
        ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc, ChunkingType,
        ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use super::super::pattern_mapping::{PatternMapping, PatternMappingVc, ResolveType::EsmAsync};
use crate::{
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::AstPathVc,
    resolve::esm_resolve,
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAsyncAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub path: AstPathVc,
}

#[turbo_tasks::value_impl]
impl EsmAsyncAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc, path: AstPathVc) -> Self {
        Self::cell(EsmAsyncAssetReference {
            origin,
            request,
            path,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        esm_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "dynamic import {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::SeparateAsync))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(&self, context: ChunkingContextVc) -> Result<CodeGenerationVc> {
        let pm = PatternMappingVc::resolve_request(
            self.request,
            self.origin,
            context,
            esm_resolve(self.origin, self.request),
            Value::new(EsmAsync),
        )
        .await?;

        let path = &self.path.await?;

        let visitor = if let PatternMapping::Invalid = &*pm {
            create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                let old_args = std::mem::take(&mut call_expr.args);
                let message = match old_args.first() {
                    Some(ExprOrSpread { spread: None, expr }) => {
                        quote_expr!(
                            "'could not resolve \"' + $arg + '\" into a module'",
                            arg: Expr = *expr.clone(),
                        )
                    }
                    // These are SWC bugs: https://github.com/swc-project/swc/issues/5394
                    Some(ExprOrSpread { spread: Some(_), expr: _ }) => {
                        quote_expr!("'spread operator is illegal in import() expressions.'")
                    }
                    _ => {
                        quote_expr!("'import() expressions require at least 1 argument'")
                    }
                };
                let error = quote_expr!(
                    "new Error($message)",
                    message: Expr = *message
                );
                call_expr.callee = Callee::Expr(quote_expr!("Promise.reject"));
                call_expr.args = vec![
                    ExprOrSpread { spread: None, expr: error, },
                ];
            })
        } else {
            create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                let old_args = std::mem::take(&mut call_expr.args);
                let expr = match old_args.into_iter().next() {
                    Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                    _ => pm.create(),
                };
                if pm.is_internal_import() {
                    call_expr.callee = Callee::Expr(quote_expr!(
                            "__turbopack_require__($arg)",
                            arg: Expr = expr
                    ));
                    call_expr.args = vec![
                        ExprOrSpread { spread: None, expr: quote_expr!("__turbopack_import__") },
                    ];
                } else {
                    call_expr.args = vec![
                        ExprOrSpread { spread: None, expr: box expr }
                    ]
                }

            })
        };

        Ok(CodeGeneration {
            visitors: vec![visitor],
        }
        .into())
    }
}
