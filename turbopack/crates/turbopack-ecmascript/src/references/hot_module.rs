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
    reference_type::CommonJsReferenceSubType,
    resolve::{ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request},
};
use turbopack_resolve::ecmascript::cjs_resolve;

use crate::{
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
};

// =====================================================================
// ModuleHotAcceptAssetReference
// =====================================================================

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("module.hot.accept {request}")]
pub struct ModuleHotAcceptAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
}

#[turbo_tasks::value_impl]
impl ModuleHotAcceptAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
    ) -> Vc<Self> {
        Self::cell(ModuleHotAcceptAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ModuleHotAcceptAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            CommonJsReferenceSubType::Undefined,
            Some(self.issue_source),
            self.error_mode,
        )
    }

    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        // module.hot.accept deps are typically already loaded via require/import.
        // We use Parallel to ensure the dep is included in the chunk graph.
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        }))
    }
}

// =====================================================================
// ModuleHotDeclineAssetReference
// =====================================================================

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("module.hot.decline {request}")]
pub struct ModuleHotDeclineAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
}

#[turbo_tasks::value_impl]
impl ModuleHotDeclineAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
    ) -> Vc<Self> {
        Self::cell(ModuleHotDeclineAssetReference {
            origin,
            request,
            issue_source,
            error_mode,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ModuleHotDeclineAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(
            *self.origin,
            *self.request,
            CommonJsReferenceSubType::Undefined,
            Some(self.issue_source),
            self.error_mode,
        )
    }

    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
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
// ModuleHotAcceptCodeGen
// =====================================================================

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ModuleHotAcceptCodeGen {
    requests: Vec<ModuleHotDependencyRequest>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    path: AstPath,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
}

impl ModuleHotAcceptCodeGen {
    pub fn new(
        requests: Vec<ModuleHotDependencyRequest>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        path: AstPath,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
    ) -> Self {
        ModuleHotAcceptCodeGen {
            requests,
            origin,
            path,
            issue_source,
            error_mode,
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
                PatternMapping::resolve_request(
                    *dep.request,
                    *self.origin,
                    chunking_context,
                    cjs_resolve(
                        *self.origin,
                        *dep.request,
                        CommonJsReferenceSubType::Undefined,
                        Some(self.issue_source),
                        self.error_mode,
                    ),
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

impl From<ModuleHotAcceptCodeGen> for CodeGen {
    fn from(val: ModuleHotAcceptCodeGen) -> Self {
        CodeGen::ModuleHotAcceptCodeGen(val)
    }
}

// =====================================================================
// ModuleHotDeclineCodeGen
// =====================================================================

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ModuleHotDeclineCodeGen {
    requests: Vec<ModuleHotDependencyRequest>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    path: AstPath,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
}

impl ModuleHotDeclineCodeGen {
    pub fn new(
        requests: Vec<ModuleHotDependencyRequest>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        path: AstPath,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
    ) -> Self {
        ModuleHotDeclineCodeGen {
            requests,
            origin,
            path,
            issue_source,
            error_mode,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let resolved_ids: Vec<ReadRef<PatternMapping>> = self
            .requests
            .iter()
            .map(|dep| async move {
                PatternMapping::resolve_request(
                    *dep.request,
                    *self.origin,
                    chunking_context,
                    cjs_resolve(
                        *self.origin,
                        *dep.request,
                        CommonJsReferenceSubType::Undefined,
                        Some(self.issue_source),
                        self.error_mode,
                    ),
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
                        let key_expr = take(&mut *call_expr.args[0].expr);
                        call_expr.args[0].expr = Box::new(resolved_ids[0].create_id(key_expr));
                    } else {
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

impl From<ModuleHotDeclineCodeGen> for CodeGen {
    fn from(val: ModuleHotDeclineCodeGen) -> Self {
        CodeGen::ModuleHotDeclineCodeGen(val)
    }
}
