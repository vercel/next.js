use std::mem::take;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{CallExpr, Callee, Expr, ExprOrSpread, Lit},
        utils::private_ident,
    },
    quote, quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ReadRef, ResolvedVc,
    TryJoinIterExt, ValueToString, Vc,
};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext},
    issue::IssueSource,
    module_graph::ModuleGraph,
    reference::ModuleReference,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
};
use turbopack_resolve::ecmascript::cjs_resolve;

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::{
        pattern_mapping::{PatternMapping, ResolveType},
        AstPath,
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
};

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct AmdDefineAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: IssueSource,
    in_try: bool,
}

#[turbo_tasks::value_impl]
impl AmdDefineAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Vc<Self> {
        Self::cell(AmdDefineAssetReference {
            origin,
            request,
            issue_source,
            in_try,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for AmdDefineAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            Some(self.issue_source.clone()),
            self.in_try,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for AmdDefineAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("AMD define dependency {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for AmdDefineAssetReference {}

#[derive(
    ValueDebugFormat,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    Clone,
    NonLocalValue,
)]
pub enum AmdDefineDependencyElement {
    Request {
        request: ResolvedVc<Request>,
        request_str: String,
    },
    Exports,
    Module,
    Require,
}

#[derive(
    ValueDebugFormat,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    Copy,
    Clone,
    NonLocalValue,
)]
pub enum AmdDefineFactoryType {
    Unknown,
    Function,
    Value,
}

#[derive(PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat, NonLocalValue)]
pub struct AmdDefineWithDependenciesCodeGen {
    dependencies_requests: Vec<AmdDefineDependencyElement>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    path: AstPath,
    factory_type: AmdDefineFactoryType,
    issue_source: IssueSource,
    in_try: bool,
}

impl AmdDefineWithDependenciesCodeGen {
    pub fn new(
        dependencies_requests: Vec<AmdDefineDependencyElement>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        path: AstPath,
        factory_type: AmdDefineFactoryType,
        issue_source: IssueSource,
        in_try: bool,
    ) -> Self {
        AmdDefineWithDependenciesCodeGen {
            dependencies_requests,
            origin,
            path,
            factory_type,
            issue_source,
            in_try,
        }
    }

    pub async fn code_generation(
        &self,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut visitors = Vec::new();

        let resolved_elements = self
            .dependencies_requests
            .iter()
            .map(|element| async move {
                Ok(match element {
                    AmdDefineDependencyElement::Request {
                        request,
                        request_str,
                    } => ResolvedElement::PatternMapping {
                        pattern_mapping: PatternMapping::resolve_request(
                            **request,
                            *self.origin,
                            module_graph,
                            Vc::upcast(chunking_context),
                            cjs_resolve(
                                *self.origin,
                                **request,
                                Some(self.issue_source.clone()),
                                self.in_try,
                            ),
                            ResolveType::ChunkItem,
                        )
                        .await?,
                        request_str: request_str.to_string(),
                    },
                    AmdDefineDependencyElement::Exports => {
                        ResolvedElement::Expr(quote!("exports" as Expr))
                    }
                    AmdDefineDependencyElement::Module => {
                        ResolvedElement::Expr(quote!("module" as Expr))
                    }
                    AmdDefineDependencyElement::Require => {
                        ResolvedElement::Expr(TURBOPACK_REQUIRE.into())
                    }
                })
            })
            .try_join()
            .await?;

        let factory_type = self.factory_type;

        visitors.push(
            create_visitor!(exact self.path, visit_mut_call_expr(call_expr: &mut CallExpr) {
                transform_amd_factory(call_expr, &resolved_elements, factory_type)
            }),
        );

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<AmdDefineWithDependenciesCodeGen> for CodeGen {
    fn from(val: AmdDefineWithDependenciesCodeGen) -> Self {
        CodeGen::AmdDefineWithDependenciesCodeGen(Box::new(val))
    }
}

enum ResolvedElement {
    PatternMapping {
        pattern_mapping: ReadRef<PatternMapping>,
        request_str: String,
    },
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
            ResolvedElement::PatternMapping {
                pattern_mapping: pm,
                request_str: request,
            } => {
                let key_expr = Expr::Lit(Lit::Str(request.as_str().into()));
                pm.create_require(key_expr)
            }
            ResolvedElement::Expr(expr) => expr.clone(),
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
                ..Default::default()
            });
            *callee = Callee::Expr(quote_expr!(
                "($f1, r = typeof $f2 !== \"function\" ? $f3 : $call_f) => r !== undefined && \
                 $turbopack_export_value(r)",
                 f1 = f.clone(),
                 f2 = f.clone(),
                 f3 = f,
                 call_f: Expr = call_f,
                 turbopack_export_value: Expr = TURBOPACK_EXPORT_VALUE.into()
            ));
            args.push(ExprOrSpread {
                expr: factory,
                spread: None,
            });
        }
        AmdDefineFactoryType::Function => {
            // (r => r !== undefined && __turbopack_export_value__(r))(...([...]))
            *callee = Callee::Expr(quote_expr!(
                "r => r !== undefined && $turbopack_export_value(r)",
                turbopack_export_value: Expr = TURBOPACK_EXPORT_VALUE.into()
            ));
            args.push(ExprOrSpread {
                expr: Box::new(Expr::Call(CallExpr {
                    args: deps,
                    callee: Callee::Expr(factory),
                    ..Default::default()
                })),
                spread: None,
            });
        }
        AmdDefineFactoryType::Value => {
            // __turbopack_export_value__(...)
            *callee = Callee::Expr(Box::new(TURBOPACK_EXPORT_VALUE.into()));
            args.push(ExprOrSpread {
                expr: factory,
                spread: None,
            });
        }
    }
}
