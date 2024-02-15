use anyhow::Result;
use swc_core::{
    ecma::ast::{Callee, ExprOrSpread},
    quote_expr,
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption},
    environment::ChunkLoading,
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
};

use super::super::pattern_mapping::{PatternMapping, ResolveType};
use crate::{
    chunk::EcmascriptChunkingContext,
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    references::AstPath,
    resolve::{esm_resolve, try_to_severity},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAsyncAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
    pub in_try: bool,
    pub import_externals: bool,
}

#[turbo_tasks::value_impl]
impl EsmAsyncAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
        in_try: bool,
        import_externals: bool,
    ) -> Vc<Self> {
        Self::cell(EsmAsyncAssetReference {
            origin,
            request,
            path,
            issue_source,
            in_try,
            import_externals,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        esm_resolve(
            self.origin,
            self.request,
            Default::default(),
            try_to_severity(self.in_try),
            Some(self.issue_source),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "dynamic import {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Async))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let pm = PatternMapping::resolve_request(
            self.request,
            self.origin,
            Vc::upcast(chunking_context),
            esm_resolve(
                self.origin,
                self.request,
                Value::new(EcmaScriptModulesReferenceSubType::DynamicImport),
                try_to_severity(self.in_try),
                Some(self.issue_source),
            ),
            if matches!(
                *chunking_context.environment().chunk_loading().await?,
                ChunkLoading::None
            ) {
                Value::new(ResolveType::ChunkItem)
            } else {
                Value::new(ResolveType::AsyncChunkLoader)
            },
        )
        .await?;

        let path = &self.path.await?;
        let import_externals = self.import_externals;

        let visitor = match &*pm {
            PatternMapping::Invalid => {
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
            }
            PatternMapping::SingleLoader(_) => {
                create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                    let old_args = std::mem::take(&mut call_expr.args);
                    let expr = match old_args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                        _ => pm.create(),
                    };
                    call_expr.callee = Callee::Expr(quote_expr!(
                        "__turbopack_require__($arg)",
                        arg: Expr = expr
                    ));
                    call_expr.args = vec![
                        ExprOrSpread { spread: None, expr: quote_expr!("__turbopack_import__") },
                    ];
                })
            }
            PatternMapping::OriginalReferenceTypeExternal(_)
            | PatternMapping::OriginalReferenceExternal => {
                create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                    let old_args = std::mem::take(&mut call_expr.args);
                    let expr = match old_args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                        _ => pm.create(),
                    };
                    if import_externals {
                        call_expr.callee = Callee::Expr(quote_expr!("__turbopack_external_import__"));
                        call_expr.args = vec![
                            ExprOrSpread { spread: None, expr: Box::new(expr) },
                        ];
                    } else {
                        call_expr.callee = Callee::Expr(quote_expr!("Promise.resolve().then"));
                        call_expr.args = vec![
                            ExprOrSpread { spread: None, expr: quote_expr!(
                                "() => __turbopack_external_require__($arg, true)",
                                arg: Expr = expr
                            ) },
                        ];
                    }
                })
            }
            _ => {
                create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                    let old_args = std::mem::take(&mut call_expr.args);
                    let expr = match old_args.into_iter().next() {
                        Some(ExprOrSpread { expr, spread: None }) => pm.apply(*expr),
                        _ => pm.create(),
                    };
                    if pm.is_internal_import() {
                        call_expr.callee = Callee::Expr(quote_expr!(
                            "Promise.resolve().then",
                        ));
                        call_expr.args = vec![
                            ExprOrSpread { spread: None, expr: quote_expr!(
                                "() => __turbopack_require__($arg)",
                                arg: Expr = expr
                            ) },
                        ];
                    } else {
                        call_expr.args = vec![
                            ExprOrSpread { spread: None, expr: Box::new(expr) }
                        ]
                    }
                })
            }
        };

        Ok(CodeGeneration {
            visitors: vec![visitor],
        }
        .into())
    }
}
