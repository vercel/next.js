use anyhow::Result;
use swc_core::{
    ecma::ast::{Callee, ExprOrSpread},
    quote_expr,
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkableModuleReference, ChunkingType,
        ChunkingTypeOption,
    },
    issue::{IssueSource, OptionIssueSource},
    reference::ModuleReference,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
};

use super::super::pattern_mapping::{PatternMapping, ResolveType::EsmAsync};
use crate::{
    chunk::EcmascriptChunkingContext,
    code_gen::{CodeGenerateableWithAvailabilityInfo, CodeGeneration},
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
    ) -> Vc<Self> {
        Self::cell(EsmAsyncAssetReference {
            origin,
            request,
            path,
            issue_source,
            in_try,
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
            OptionIssueSource::some(self.issue_source),
            try_to_severity(self.in_try),
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
impl CodeGenerateableWithAvailabilityInfo for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<CodeGeneration>> {
        let pm = PatternMapping::resolve_request(
            self.request,
            self.origin,
            Vc::upcast(context),
            esm_resolve(
                self.origin,
                self.request,
                Value::new(EcmaScriptModulesReferenceSubType::Undefined),
                OptionIssueSource::some(self.issue_source),
                try_to_severity(self.in_try),
            ),
            Value::new(EsmAsync(availability_info.into_value())),
        )
        .await?;

        let path = &self.path.await?;

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
