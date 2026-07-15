use std::mem::take;

use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::{DUMMY_SP, SyntaxContext},
    ecma::ast::{
        ArrowExpr, BlockStmt, BlockStmtOrExpr, CallExpr, Callee, Expr, ExprOrSpread, ExprStmt,
        Ident, Stmt,
    },
    quote,
};
use turbo_tasks::{
    NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType, ModuleChunkItemIdExt},
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType},
    resolve::{ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request},
};
use turbopack_resolve::ecmascript::{cjs_resolve, esm_resolve};

use crate::{
    ScopeHoistingContext,
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::{
        AstPath,
        esm::{EsmAssetReference, base::ReferencedAsset},
        pattern_mapping::{PatternMapping, ResolveType},
    },
    runtime_functions::TURBOPACK_IMPORT,
    utils::module_id_to_lit,
};

/// An asset reference for modules accepted via `module.hot.accept(dep, callback)` or
/// `import.meta.hot.accept(dep, callback)`. Ensures the accepted dependency is included
/// in the chunk graph so it can be hot-replaced at runtime.
#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("module.hot.accept/decline {request}")]
pub struct ModuleHotReferenceAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
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

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }
}

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ModuleHotReferenceCodeGen {
    references: Vec<ResolvedVc<ModuleHotReferenceAssetReference>>,
    /// For ESM modules, the matching ESM import reference for each dep (if any).
    /// This is used to generate code that re-assigns the ESM namespace variable
    /// after an HMR update so that imported bindings reflect the updated module.
    esm_references: Vec<Option<ResolvedVc<EsmAssetReference>>>,
    path: AstPath,
}

impl ModuleHotReferenceCodeGen {
    pub fn new(
        references: Vec<ResolvedVc<ModuleHotReferenceAssetReference>>,
        esm_references: Vec<Option<ResolvedVc<EsmAssetReference>>>,
        path: AstPath,
    ) -> Self {
        ModuleHotReferenceCodeGen {
            references,
            esm_references,
            path,
        }
    }

    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let resolved_ids: Vec<ReadRef<PatternMapping>> = self
            .references
            .iter()
            .map(|reference| async move {
                let r = reference.await?;
                let resolve_result = reference.resolve_reference();
                PatternMapping::resolve_request(
                    *r.request,
                    *r.origin,
                    chunking_context,
                    resolve_result,
                    ResolveType::ChunkItem,
                )
                .await
            })
            .try_join()
            .await?;

        // Resolve ESM binding re-import information for each dep.
        // Each entry is (namespace_ident, module_id_expr) if the dep has a matching ESM import.
        let esm_reimports: Vec<Option<(String, SyntaxContext, Expr)>> = self
            .esm_references
            .iter()
            .map(|esm_ref| async move {
                let Some(esm_ref) = esm_ref else {
                    return Ok(None);
                };
                let referenced_asset = esm_ref.get_referenced_asset().await?;
                match &referenced_asset {
                    ReferencedAsset::Some(asset) => {
                        let ident = referenced_asset
                            .get_ident(chunking_context, None, scope_hoisting_context)
                            .await?;
                        if let Some((namespace_ident, ctxt)) =
                            ident.and_then(|i| i.into_module_namespace_ident())
                        {
                            let id = asset.chunk_item_id(chunking_context).await?;
                            let module_id_expr = module_id_to_lit(&id);
                            return Ok(Some((
                                namespace_ident,
                                ctxt.unwrap_or_default(),
                                module_id_expr,
                            )));
                        }
                        Ok(None)
                    }
                    _ => Ok(None),
                }
            })
            .try_join()
            .await?;

        let is_single = self.references.len() == 1;

        // Build the list of re-import assignment statements for the callback wrapper.
        let mut reimport_stmts: Vec<Stmt> = Vec::new();
        for (namespace_ident, ctxt, module_id_expr) in esm_reimports.iter().flatten() {
            let name = Ident::new(namespace_ident.as_str().into(), DUMMY_SP, *ctxt);
            let turbopack_import: Expr = TURBOPACK_IMPORT.into();
            reimport_stmts.push(quote!(
                "$name = $turbopack_import($id);" as Stmt,
                name = name,
                turbopack_import: Expr = turbopack_import,
                id: Expr = module_id_expr.clone(),
            ));
        }
        let has_reimports = !reimport_stmts.is_empty();

        let mut visitors = Vec::new();
        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(call_expr) = expr {
                    if call_expr.args.is_empty() {
                        return;
                    }
                    // Replace dep path strings with resolved module IDs
                    if is_single {
                        let key_expr = take(&mut *call_expr.args[0].expr);
                        *call_expr.args[0].expr = resolved_ids[0].create_id(key_expr);
                    } else if let Expr::Array(array_lit) = &mut *call_expr.args[0].expr {
                        for (i, elem) in array_lit.elems.iter_mut().enumerate() {
                            if let Some(elem) = elem
                                && i < resolved_ids.len()
                            {
                                let key_expr = take(&mut *elem.expr);
                                *elem.expr = resolved_ids[i].create_id(key_expr);
                            }
                        }
                    }

                    // Wrap or inject callback to re-import ESM bindings
                    if has_reimports {
                        let mut wrapper_stmts = reimport_stmts.clone();

                        if call_expr.args.len() >= 2 {
                            // There's a user callback — call it after re-importing
                            let user_cb = take(&mut *call_expr.args[1].expr);
                            wrapper_stmts.push(Stmt::Expr(ExprStmt {
                                span: DUMMY_SP,
                                expr: Box::new(Expr::Call(CallExpr {
                                    span: DUMMY_SP,
                                    callee: Callee::Expr(Box::new(user_cb)),
                                    args: vec![],
                                    ..Default::default()
                                })),
                            }));
                            *call_expr.args[1].expr = Expr::Arrow(ArrowExpr {
                                span: DUMMY_SP,
                                params: vec![],
                                body: Box::new(BlockStmtOrExpr::BlockStmt(BlockStmt {
                                    span: DUMMY_SP,
                                    stmts: wrapper_stmts,
                                    ..Default::default()
                                })),
                                ..Default::default()
                            });
                        } else {
                            // No user callback — add one that just re-imports
                            call_expr.args.push(ExprOrSpread {
                                spread: None,
                                expr: Box::new(Expr::Arrow(ArrowExpr {
                                    span: DUMMY_SP,
                                    params: vec![],
                                    body: Box::new(BlockStmtOrExpr::BlockStmt(BlockStmt {
                                        span: DUMMY_SP,
                                        stmts: wrapper_stmts,
                                        ..Default::default()
                                    })),
                                    ..Default::default()
                                })),
                            });
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
