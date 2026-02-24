use std::mem::take;

use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::ecma::ast::Expr;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType, ChunkingTypeOption},
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType},
    resolve::{ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request},
};
use turbopack_resolve::ecmascript::{cjs_resolve, esm_resolve};

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
};

// =====================================================================
// ModuleHotReferenceAssetReference (merged accept + decline)
// =====================================================================

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ModuleHotReferenceAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
    is_esm: bool,
}

#[turbo_tasks::value_impl]
impl ModuleHotReferenceAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
        is_esm: bool,
    ) -> Vc<Self> {
        Self::cell(ModuleHotReferenceAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
            is_esm,
        })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleHotReferenceAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        let request_str = self.request.to_string().await?;
        Ok(Vc::cell(
            format!("module.hot.accept/decline {}", request_str).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ModuleHotReferenceAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if self.is_esm {
            esm_resolve(
                *self.origin,
                *self.request,
                EcmaScriptModulesReferenceSubType::Undefined,
                self.error_mode,
                Some(self.issue_source),
            )
            .await
        } else {
            Ok(cjs_resolve(
                *self.origin,
                *self.request,
                CommonJsReferenceSubType::Undefined,
                Some(self.issue_source),
                self.error_mode,
            ))
        }
    }

    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        // module.hot.accept/decline deps are typically already loaded via require/import.
        // We use Parallel to ensure the dep is included in the chunk graph.
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        }))
    }
}

// =====================================================================
// Shared types
// =====================================================================

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Clone, Encode, Decode,
)]
pub struct ModuleHotDependencyRequest {
    pub request: ResolvedVc<Request>,
    pub request_str: RcStr,
}

// =====================================================================
// ModuleHotReferenceCodeGen (merged accept + decline)
// =====================================================================

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ModuleHotReferenceCodeGen {
    requests: Vec<ModuleHotDependencyRequest>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    path: AstPath,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
    is_esm: bool,
}

impl ModuleHotReferenceCodeGen {
    pub fn new(
        requests: Vec<ModuleHotDependencyRequest>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        path: AstPath,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
        is_esm: bool,
    ) -> Self {
        ModuleHotReferenceCodeGen {
            requests,
            origin,
            path,
            issue_source,
            error_mode,
            is_esm,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        // Resolve all dep requests to pattern mappings
        let resolved_ids: Vec<ReadRef<PatternMapping>> = self
            .requests
            .iter()
            .map(|dep| async move {
                let resolve_result = if self.is_esm {
                    esm_resolve(
                        *self.origin,
                        *dep.request,
                        EcmaScriptModulesReferenceSubType::Undefined,
                        self.error_mode,
                        Some(self.issue_source),
                    )
                    .await?
                } else {
                    cjs_resolve(
                        *self.origin,
                        *dep.request,
                        CommonJsReferenceSubType::Undefined,
                        Some(self.issue_source),
                        self.error_mode,
                    )
                };
                PatternMapping::resolve_request(
                    *dep.request,
                    *self.origin,
                    chunking_context,
                    resolve_result,
                    ResolveType::ChunkItem,
                )
                .await
            })
            .try_join()
            .await?;

        let is_single = self.requests.len() == 1;

        let mut visitors = Vec::new();
        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(call_expr) = expr {
                    if call_expr.args.is_empty() {
                        return;
                    }
                    if is_single {
                        // Single dep: replace string arg with resolved ID
                        let key_expr = take(&mut *call_expr.args[0].expr);
                        call_expr.args[0].expr = Box::new(resolved_ids[0].create_id(key_expr));
                    } else {
                        // Array of deps: replace each element with resolved ID
                        if let Expr::Array(array_lit) = &mut *call_expr.args[0].expr {
                            for (i, elem) in array_lit.elems.iter_mut().enumerate() {
                                if let Some(elem) = elem {
                                    if i < resolved_ids.len() {
                                        let key_expr = take(&mut *elem.expr);
                                        elem.expr = Box::new(resolved_ids[i].create_id(key_expr));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}

impl From<ModuleHotReferenceCodeGen> for CodeGen {
    fn from(val: ModuleHotReferenceCodeGen) -> Self {
        CodeGen::ModuleHotReferenceCodeGen(val)
    }
}
