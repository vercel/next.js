use std::mem::take;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{CallExpr, Callee, Expr, ExprOrSpread},
        utils::private_ident,
    },
    quote, quote_expr,
};
use turbo_tasks::{
    debug::ValueDebugFormat, primitives::StringVc, trace::TraceRawVcs, TryJoinIterExt, Value,
    ValueToString, ValueToStringVc,
};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc},
    issue::{IssueSourceVc, OptionIssueSourceVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResultVc},
};

use super::pattern_mapping::{PatternMappingVc, ResolveType::Cjs};
use crate::{
    chunk::EcmascriptChunkingContextVc,
    code_gen::{CodeGenerateable, CodeGenerateableVc, CodeGeneration, CodeGenerationVc},
    create_visitor,
    references::{
        pattern_mapping::{PatternMapping, PatternMappingReadRef},
        AstPathVc,
    },
    resolve::{cjs_resolve, try_to_severity},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct AmdDefineAssetReference {
    origin: ResolveOriginVc,
    request: RequestVc,
    issue_source: IssueSourceVc,
    in_try: bool,
}

#[turbo_tasks::value_impl]
impl AmdDefineAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolveOriginVc,
        request: RequestVc,
        issue_source: IssueSourceVc,
        in_try: bool,
    ) -> Self {
        Self::cell(AmdDefineAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for AmdDefineAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(
            self.origin,
            self.request,
            OptionIssueSourceVc::some(self.issue_source),
            try_to_severity(self.in_try),
        )
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

#[derive(
    ValueDebugFormat, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Copy, Clone,
)]
pub enum AmdDefineDependencyElement {
    Request(RequestVc),
    Exports,
    Module,
    Require,
}

#[derive(
    ValueDebugFormat, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, Copy, Clone,
)]
pub enum AmdDefineFactoryType {
    Unknown,
    Function,
    Value,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct AmdDefineWithDependenciesCodeGen {
    dependencies_requests: Vec<AmdDefineDependencyElement>,
    origin: ResolveOriginVc,
    path: AstPathVc,
    factory_type: AmdDefineFactoryType,
    issue_source: IssueSourceVc,
    in_try: bool,
}

impl AmdDefineWithDependenciesCodeGenVc {
    pub fn new(
        dependencies_requests: Vec<AmdDefineDependencyElement>,
        origin: ResolveOriginVc,
        path: AstPathVc,
        factory_type: AmdDefineFactoryType,
        issue_source: IssueSourceVc,
        in_try: bool,
    ) -> Self {
        Self::cell(AmdDefineWithDependenciesCodeGen {
            dependencies_requests,
            origin,
            path,
            factory_type,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for AmdDefineWithDependenciesCodeGen {
    #[turbo_tasks::function]
    async fn code_generation(
        &self,
        context: EcmascriptChunkingContextVc,
    ) -> Result<CodeGenerationVc> {
        let mut visitors = Vec::new();

        let resolved_elements = self
            .dependencies_requests
            .iter()
            .map(|element| async move {
                Ok(match element {
                    AmdDefineDependencyElement::Request(request) => {
                        ResolvedElement::PatternMapping(
                            PatternMappingVc::resolve_request(
                                *request,
                                self.origin,
                                context.into(),
                                cjs_resolve(
                                    self.origin,
                                    *request,
                                    OptionIssueSourceVc::some(self.issue_source),
                                    try_to_severity(self.in_try),
                                ),
                                Value::new(Cjs),
                            )
                            .await?,
                            request.await?.request(),
                        )
                    }
                    AmdDefineDependencyElement::Exports => {
                        ResolvedElement::Expr(quote!("exports" as Expr))
                    }
                    AmdDefineDependencyElement::Module => {
                        ResolvedElement::Expr(quote!("module" as Expr))
                    }
                    AmdDefineDependencyElement::Require => {
                        ResolvedElement::Expr(quote!("__turbopack_require__" as Expr))
                    }
                })
            })
            .try_join()
            .await?;

        let factory_type = self.factory_type;

        let path = self.path.await?;
        visitors.push(
            create_visitor!(exact path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                transform_amd_factory(call_expr, &resolved_elements, factory_type)
            }),
        );

        Ok(CodeGeneration { visitors }.into())
    }
}

enum ResolvedElement {
    PatternMapping(PatternMappingReadRef, Option<String>),
    Expr(Expr),
}

/// Transforms `define([dep1, dep2], factory)` into:
/// ```js
/// __turbopack_export_value__(
///   factory(
///     __turbopack_require__(dep1),
///     __turbopack_require__(dep2),
///   ),
/// );
/// ```
fn transform_amd_factory(
    call_expr: &mut CallExpr,
    resolved_elements: &[ResolvedElement],
    factory_type: AmdDefineFactoryType,
) {
    let CallExpr { args, callee, .. } = call_expr;
    let Some(factory) = take(args).pop().map(|e| e.expr) else {
        return;
    };

    let deps = resolved_elements
        .iter()
        .map(|element| match element {
            ResolvedElement::PatternMapping(pm, req) => match &**pm {
                PatternMapping::Invalid => quote_expr!("undefined"),
                pm => {
                    let arg = if let Some(req) = req {
                        pm.apply(req.as_str().into())
                    } else {
                        pm.create()
                    };

                    if pm.is_internal_import() {
                        quote_expr!("__turbopack_require__($arg)", arg: Expr = arg)
                    } else {
                        quote_expr!("__turbopack_external_require__($arg)", arg: Expr = arg)
                    }
                }
            },
            ResolvedElement::Expr(expr) => Box::new(expr.clone()),
        })
        .map(ExprOrSpread::from)
        .collect();

    match factory_type {
        AmdDefineFactoryType::Unknown => {
            // ((f, r = typeof f !== "function" ? f : f([...])) => r !== undefined &&
            // __turbopack_export_value__(r))(...)
            let f = private_ident!("f");
            let call_f = Expr::Call(CallExpr {
                args: deps,
                callee: Callee::Expr(Box::new(Expr::Ident(f.clone()))),
                span: DUMMY_SP,
                type_args: None,
            });
            *callee = Callee::Expr(quote_expr!(
                "($f1, r = typeof $f2 !== \"function\" ? $f3 : $call_f) => r !== undefined && \
                 __turbopack_export_value(r)",
                f1 = f.clone(),
                f2 = f.clone(),
                f3 = f,
                call_f: Expr = call_f
            ));
            args.push(ExprOrSpread {
                expr: factory,
                spread: None,
            });
        }
        AmdDefineFactoryType::Function => {
            // (r => r !== undefined && __turbopack_export_value__(r))(...([...]))
            *callee = Callee::Expr(quote_expr!(
                "r => r !== undefined && __turbopack_export_value__(r)"
            ));
            args.push(ExprOrSpread {
                expr: Box::new(Expr::Call(CallExpr {
                    args: deps,
                    callee: Callee::Expr(factory),
                    span: DUMMY_SP,
                    type_args: None,
                })),
                spread: None,
            });
        }
        AmdDefineFactoryType::Value => {
            // __turbopack_export_value__(...)
            *callee = Callee::Expr(quote_expr!("__turbopack_export_value__"));
            args.push(ExprOrSpread {
                expr: factory,
                spread: None,
            });
        }
    }
}
