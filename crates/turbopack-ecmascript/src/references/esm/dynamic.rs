use anyhow::Result;
use swc_core::{
    ecma::ast::{Callee, ExprOrSpread},
    quote_expr,
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkableAssetReference, ChunkableAssetReferenceVc,
        ChunkingType, ChunkingTypeOptionVc,
    },
    issue::{IssueSourceVc, OptionIssueSourceVc},
    reference::{AssetReference, AssetReferenceVc},
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use super::super::pattern_mapping::{PatternMapping, PatternMappingVc, ResolveType::EsmAsync};
use crate::{
    chunk::EcmascriptChunkingContextVc,
    code_gen::{
        CodeGenerateableWithAvailabilityInfo, CodeGenerateableWithAvailabilityInfoVc,
        CodeGeneration, CodeGenerationVc,
    },
    create_visitor,
    references::AstPathVc,
    resolve::{esm_resolve, try_to_severity},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct EsmAsyncAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
    pub path: AstPathVc,
    pub issue_source: IssueSourceVc,
    pub in_try: bool,
}

#[turbo_tasks::value_impl]
impl EsmAsyncAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolveOriginVc,
        request: RequestVc,
        path: AstPathVc,
        issue_source: IssueSourceVc,
        in_try: bool,
    ) -> Self {
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
impl AssetReference for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        esm_resolve(
            self.origin,
            self.request,
            Default::default(),
            OptionIssueSourceVc::some(self.issue_source),
            try_to_severity(self.in_try),
        )
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
    fn chunking_type(&self) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::SeparateAsync))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateableWithAvailabilityInfo for EsmAsyncAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        context: EcmascriptChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<CodeGenerationVc> {
        let pm = PatternMappingVc::resolve_request(
            self.request,
            self.origin,
            context.into(),
            esm_resolve(
                self.origin,
                self.request,
                Value::new(EcmaScriptModulesReferenceSubType::Undefined),
                OptionIssueSourceVc::some(self.issue_source),
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
