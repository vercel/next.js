use anyhow::{Result, bail};
use async_trait::async_trait;
use either::Either;
use strsim::jaro;
use swc_core::{
    common::{BytePos, DUMMY_SP, Span, SyntaxContext, source_map::PURE_SP},
    ecma::ast::{
        ComputedPropName, Decl, Expr, ExprStmt, Ident, Lit, MemberExpr, MemberProp, Number,
        SeqExpr, Stmt, Str,
    },
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc, turbobail};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType, ModuleChunkItemIdExt},
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    loader::ResolvedWebpackLoaderItem,
    module::{Module, ModuleSideEffects},
    module_graph::binding_usage_info::ModuleExportUsageInfo,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        BindingUsage, ExportUsage, ExternalType, ImportUsage, ModulePart, ModuleResolveResult,
        ModuleResolveResultItem, RequestKey, ResolveErrorMode,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        resolve,
    },
    source::Source,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    EcmascriptModuleAsset, ScopeHoistingContext, TreeShakingMode,
    analyzer::imports::ImportAnnotations,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    export::Liveness,
    magic_identifier,
    references::{
        esm::{
            EsmExport,
            export::{all_known_export_names, is_export_missing},
        },
        util::{SpecifiedChunkingType, throw_module_not_found_expr},
    },
    runtime_functions::{TURBOPACK_EXTERNAL_IMPORT, TURBOPACK_EXTERNAL_REQUIRE, TURBOPACK_IMPORT},
    tree_shake::{TURBOPACK_PART_IMPORT_SOURCE, part::module::EcmascriptModulePartAsset},
    utils::module_id_to_lit,
};

#[derive(PartialEq, Eq)]
pub enum ReferencedAsset {
    Some(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>),
    External(RcStr, ExternalType),
    None,
    Unresolvable,
}

#[derive(Debug)]
pub enum ReferencedAssetIdent {
    /// The given export (or namespace) is a local binding in the current scope hoisting group.
    LocalBinding {
        ident: RcStr,
        ctxt: SyntaxContext,
        liveness: Liveness,
    },
    /// The given export (or namespace) should be imported and will be assigned to a new variable.
    Module {
        /// The name of the variable that will hold the imported namespace. Cached from
        /// `import_source.get_namespace_ident(..)` at resolution time so downstream sync
        /// visitors can read it without re-entering the async layer.
        namespace_ident: String,
        ctxt: Option<SyntaxContext>,
        export: Option<RcStr>,
        /// Describes what to import to populate the variable that `namespace_ident` names.
        ///
        /// When the ident was resolved through a re-export chain (e.g. `export * as X from
        /// './inner'`), this is the final module in that chain, not the directly referenced
        /// asset — so the `.i(...)` call that initializes the variable loads the module whose
        /// namespace `namespace_ident` claims to hold.
        import_source: ImportSource,
    },
}

/// The source to import when initializing a `ReferencedAssetIdent::Module` variable.
#[derive(Debug)]
pub enum ImportSource {
    /// Import an in-graph module.
    Module {
        asset: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    },
    /// Import an external dependency. The emitting site decides between
    /// `__turbopack_external_import` and `__turbopack_external_require` based on its own
    /// `import_externals` flag.
    External { request: RcStr, ty: ExternalType },
}

impl ImportSource {
    /// Compute the name of the variable that should hold the imported namespace.
    pub async fn get_namespace_ident(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<String> {
        Ok(match self {
            ImportSource::Module { asset } => {
                ReferencedAsset::get_ident_from_placeable(asset, chunking_context).await?
            }
            ImportSource::External { request, ty } => {
                magic_identifier::mangle(&format!("{ty} external {request}"))
            }
        })
    }
}

impl ReferencedAssetIdent {
    pub fn into_module_namespace_ident(self) -> Option<(String, Option<SyntaxContext>)> {
        match self {
            ReferencedAssetIdent::Module {
                namespace_ident,
                ctxt,
                ..
            } => Some((namespace_ident, ctxt)),
            ReferencedAssetIdent::LocalBinding { .. } => None,
        }
    }

    pub fn as_expr_individual(&self, span: Span) -> Either<Ident, MemberExpr> {
        match self {
            ReferencedAssetIdent::LocalBinding {
                ident,
                ctxt,
                liveness: _,
            } => Either::Left(Ident::new(ident.as_str().into(), span, *ctxt)),
            ReferencedAssetIdent::Module {
                namespace_ident,
                ctxt,
                export,
                import_source: _,
            } => {
                if let Some(export) = export {
                    Either::Right(MemberExpr {
                        span,
                        obj: Box::new(Expr::Ident(Ident::new(
                            namespace_ident.as_str().into(),
                            DUMMY_SP,
                            ctxt.unwrap_or_default(),
                        ))),
                        prop: MemberProp::Computed(ComputedPropName {
                            span: DUMMY_SP,
                            expr: Box::new(Expr::Lit(Lit::Str(Str {
                                span: DUMMY_SP,
                                value: export.as_str().into(),
                                raw: None,
                            }))),
                        }),
                    })
                } else {
                    Either::Left(Ident::new(
                        namespace_ident.as_str().into(),
                        span,
                        ctxt.unwrap_or_default(),
                    ))
                }
            }
        }
    }
    pub fn as_expr(&self, span: Span, is_callee: bool) -> Expr {
        match self.as_expr_individual(span) {
            Either::Left(ident) => ident.into(),
            Either::Right(member) => {
                if is_callee {
                    Expr::Seq(SeqExpr {
                        exprs: vec![
                            Box::new(Expr::Lit(Lit::Num(Number {
                                span: DUMMY_SP,
                                value: 0.0,
                                raw: None,
                            }))),
                            Box::new(member.into()),
                        ],
                        span: DUMMY_SP,
                    })
                } else {
                    member.into()
                }
            }
        }
    }
}

impl ReferencedAsset {
    pub async fn get_ident(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        export: Option<RcStr>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<Option<ReferencedAssetIdent>> {
        self.get_ident_inner(chunking_context, export, scope_hoisting_context, None)
            .await
    }

    async fn get_ident_inner(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        export: Option<RcStr>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        initial: Option<&ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    ) -> Result<Option<ReferencedAssetIdent>> {
        Ok(match self {
            ReferencedAsset::Some(asset) => {
                if let Some(ctxt) = scope_hoisting_context.get_module_syntax_context(*asset)
                    && let Some(export) = &export
                    && let EcmascriptExports::EsmExports(exports) = *asset.get_exports().await?
                {
                    let exports = exports.expand_exports(ModuleExportUsageInfo::all()).await?;
                    let esm_export = exports.exports.get(export);
                    match esm_export {
                        Some(EsmExport::LocalBinding(_name, liveness)) => {
                            // A local binding in a module that is merged in the same group. Use the
                            // export name as identifier, it will be replaced with the actual
                            // variable name during AST merging.
                            return Ok(Some(ReferencedAssetIdent::LocalBinding {
                                ident: export.clone(),
                                ctxt,
                                liveness: *liveness,
                            }));
                        }
                        Some(b @ EsmExport::ImportedBinding(esm_ref, _, _))
                        | Some(b @ EsmExport::ImportedNamespace(esm_ref)) => {
                            let imported = if let EsmExport::ImportedBinding(_, export, _) = b {
                                Some(export.clone())
                            } else {
                                None
                            };

                            let referenced_asset =
                                ReferencedAsset::from_resolve_result(esm_ref.resolve_reference())
                                    .await?;

                            if let Some(&initial) = initial
                                && referenced_asset == ReferencedAsset::Some(initial)
                            {
                                // `initial` reexports from `asset` reexports from
                                // `referenced_asset` (which is `initial`)
                                CircularReExport {
                                    export: export.clone(),
                                    import: imported.clone(),
                                    module: *asset,
                                    module_cycle: initial,
                                }
                                .resolved_cell()
                                .emit();
                                return Ok(None);
                            }

                            // If the target module is still in the same group, we can
                            // refer it locally, otherwise it will be imported
                            return Ok(
                                match Box::pin(referenced_asset.get_ident_inner(
                                    chunking_context,
                                    imported,
                                    scope_hoisting_context,
                                    Some(asset),
                                ))
                                .await?
                                {
                                    Some(ReferencedAssetIdent::Module {
                                        namespace_ident,
                                        // Overwrite the context. This import isn't
                                        // inserted in the module that uses the import,
                                        // but in the module containing the reexport
                                        ctxt: None,
                                        export,
                                        import_source,
                                    }) => Some(ReferencedAssetIdent::Module {
                                        namespace_ident,
                                        ctxt: Some(ctxt),
                                        export,
                                        import_source,
                                    }),
                                    ident => ident,
                                },
                            );
                        }
                        Some(EsmExport::Error) | None => {
                            // Export not found, either there was already an error, or
                            // this is some dynamic (CJS) (re)export situation.
                        }
                    }
                }

                let import_source = ImportSource::Module { asset: *asset };
                Some(ReferencedAssetIdent::Module {
                    namespace_ident: import_source.get_namespace_ident(chunking_context).await?,
                    ctxt: None,
                    export,
                    import_source,
                })
            }
            ReferencedAsset::External(request, ty) => {
                let import_source = ImportSource::External {
                    request: request.clone(),
                    ty: *ty,
                };
                Some(ReferencedAssetIdent::Module {
                    namespace_ident: import_source.get_namespace_ident(chunking_context).await?,
                    ctxt: None,
                    export,
                    import_source,
                })
            }
            ReferencedAsset::None | ReferencedAsset::Unresolvable => None,
        })
    }

    pub(crate) async fn get_ident_from_placeable(
        asset: &Vc<Box<dyn EcmascriptChunkPlaceable>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<String> {
        let id = asset.chunk_item_id(chunking_context).await?;
        // There are a number of places in `next` that match on this prefix.
        // See `packages/next/src/shared/lib/magic-identifier.ts`
        Ok(magic_identifier::mangle(&format!("imported module {id}")))
    }
}

impl ReferencedAsset {
    pub async fn from_resolve_result(resolve_result: Vc<ModuleResolveResult>) -> Result<Self> {
        // TODO handle multiple keyed results
        let result = resolve_result.await?;
        if result.is_unresolvable_ref() {
            return Ok(ReferencedAsset::Unresolvable);
        }
        for (_, result) in result.primary.iter() {
            match result {
                ModuleResolveResultItem::External {
                    name: request, ty, ..
                } => {
                    return Ok(ReferencedAsset::External(request.clone(), *ty));
                }
                ModuleResolveResultItem::Module(module) => {
                    if let Some(placeable) =
                        ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(*module)
                    {
                        return Ok(ReferencedAsset::Some(placeable));
                    }
                }
                // TODO ignore should probably be handled differently
                _ => {}
            }
        }
        Ok(ReferencedAsset::None)
    }
}

#[turbo_tasks::value(transparent)]
pub struct EsmAssetReferences(Vec<ResolvedVc<EsmAssetReference>>);

#[turbo_tasks::value_impl]
impl EsmAssetReferences {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("import {request}")]
pub struct EsmAssetReference {
    pub module: ResolvedVc<EcmascriptModuleAsset>,
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    // Request is a string to avoid eagerly parsing into a `Request` VC
    pub request: RcStr,
    pub annotations: Option<ImportAnnotations>,
    pub issue_source: IssueSource,
    pub export_name: Option<ModulePart>,
    pub import_usage: ImportUsage,
    pub import_externals: bool,
    pub tree_shaking_mode: Option<TreeShakingMode>,
    pub is_pure_import: bool,
    pub resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
}

impl EsmAssetReference {
    fn get_origin(&self) -> Vc<Box<dyn ResolveOrigin>> {
        if let Some(transition) = self.annotations.as_ref().and_then(|a| a.transition()) {
            self.origin.with_transition(transition.into())
        } else {
            *self.origin
        }
    }
}

impl EsmAssetReference {
    pub fn new(
        module: ResolvedVc<EcmascriptModuleAsset>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        issue_source: IssueSource,
        annotations: Option<ImportAnnotations>,
        export_name: Option<ModulePart>,
        import_usage: ImportUsage,
        import_externals: bool,
        tree_shaking_mode: Option<TreeShakingMode>,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    ) -> Self {
        EsmAssetReference {
            module,
            origin,
            request,
            issue_source,
            annotations,
            export_name,
            import_usage,
            import_externals,
            tree_shaking_mode,
            is_pure_import: false,
            resolve_override,
        }
    }

    pub fn new_pure(
        module: ResolvedVc<EcmascriptModuleAsset>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        issue_source: IssueSource,
        annotations: Option<ImportAnnotations>,
        export_name: Option<ModulePart>,
        import_usage: ImportUsage,
        import_externals: bool,
        tree_shaking_mode: Option<TreeShakingMode>,
        resolve_override: Option<ResolvedVc<Box<dyn Module>>>,
    ) -> Self {
        EsmAssetReference {
            module,
            origin,
            request,
            issue_source,
            annotations,
            export_name,
            import_usage,
            import_externals,
            tree_shaking_mode,
            is_pure_import: true,
            resolve_override,
        }
    }
    pub(crate) fn get_referenced_asset(
        self: Vc<Self>,
    ) -> impl Future<Output = Result<ReferencedAsset>> {
        ReferencedAsset::from_resolve_result(self.resolve_reference())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        if let Some(resolved) = &self.resolve_override {
            return Ok(*ModuleResolveResult::module(*resolved));
        }
        let ty = if let Some(loader) = self.annotations.as_ref().and_then(|a| a.turbopack_loader())
        {
            // Resolve the loader path relative to the importing file
            let origin = self.get_origin();
            let origin_path = origin.origin_path().await?;
            let loader_request = Request::parse(loader.loader.clone().into());
            let resolved = resolve(
                origin_path.parent(),
                ReferenceType::Loader,
                loader_request,
                origin.resolve_options(),
            );
            let loader_fs_path = if let Some(source) = *resolved.first_source().await? {
                source.ident().await?.path.clone()
            } else {
                bail!("Unable to resolve turbopackLoader '{}'", loader.loader);
            };

            EcmaScriptModulesReferenceSubType::ImportWithTurbopackUse {
                loader: ResolvedWebpackLoaderItem {
                    loader: loader_fs_path,
                    options: loader.options.clone(),
                },
                rename_as: self
                    .annotations
                    .as_ref()
                    .and_then(|a| a.turbopack_rename_as())
                    .cloned(),
                module_type: self
                    .annotations
                    .as_ref()
                    .and_then(|a| a.turbopack_module_type())
                    .cloned(),
            }
        } else if let Some(module_type) = self.annotations.as_ref().and_then(|a| a.module_type()) {
            EcmaScriptModulesReferenceSubType::ImportWithType(RcStr::from(
                &*module_type.to_string_lossy(),
            ))
        } else if let Some(part) = &self.export_name {
            EcmaScriptModulesReferenceSubType::ImportPart(part.clone())
        } else {
            EcmaScriptModulesReferenceSubType::Import
        };

        let request = Request::parse(self.request.clone().into());

        if let Some(TreeShakingMode::ModuleFragments) = self.tree_shaking_mode {
            if let Some(ModulePart::Evaluation) = &self.export_name
                && *self.module.side_effects().await? == ModuleSideEffects::SideEffectFree
            {
                return Ok(ModuleResolveResult {
                    primary: Box::new([(RequestKey::default(), ModuleResolveResultItem::Ignore)]),
                    affecting_sources: Default::default(),
                }
                .cell());
            }

            if let Request::Module { module, .. } = &*request.await?
                && module.is_match(TURBOPACK_PART_IMPORT_SOURCE)
            {
                if let Some(part) = &self.export_name {
                    return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
                        EcmascriptModulePartAsset::select_part(*self.module, part.clone())
                            .to_resolved()
                            .await?,
                    )));
                }
                bail!("export_name is required for part import")
            }
        }

        let result = esm_resolve(
            self.get_origin(),
            request,
            ty,
            ResolveErrorMode::Error,
            Some(self.issue_source),
        )
        .await?;

        if let Some(ModulePart::Export(export_name)) = &self.export_name {
            for &module in result.primary_modules().await? {
                if let Some(module) = ResolvedVc::try_downcast(module)
                    && *is_export_missing(*module, export_name.clone()).await?
                {
                    InvalidExport {
                        export: export_name.clone(),
                        module,
                        source: self.issue_source,
                    }
                    .resolved_cell()
                    .emit();
                }
            }
        }

        Ok(result)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        self.annotations
            .as_ref()
            .and_then(|a| a.chunking_type())
            .map_or_else(
                || {
                    Some(ChunkingType::Parallel {
                        inherit_async: true,
                        hoisted: true,
                    })
                },
                |c| c.as_chunking_type(true, true),
            )
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: self.import_usage.clone(),
            export: match &self.export_name {
                Some(ModulePart::Export(export_name)) => ExportUsage::Named(export_name.clone()),
                Some(ModulePart::Evaluation) => ExportUsage::Evaluation,
                _ => ExportUsage::All,
            },
        }
    }
}

impl EsmAssetReference {
    pub async fn code_generation(
        self: ResolvedVc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let this = &*self.await?;

        if chunking_context
            .unused_references()
            .contains_key(&ResolvedVc::upcast(self))
            .await?
        {
            return Ok(CodeGeneration::empty());
        }

        // only chunked references can be imported
        if this
            .annotations
            .as_ref()
            .and_then(|a| a.chunking_type())
            .is_none_or(|v| v != SpecifiedChunkingType::None)
        {
            let import_externals = this.import_externals;
            let referenced_asset = self.get_referenced_asset().await?;

            match &referenced_asset {
                ReferencedAsset::Unresolvable => {
                    // Insert code that throws immediately at time of import if a request is
                    // unresolvable
                    let request = &this.request;
                    let stmt = Stmt::Expr(ExprStmt {
                        expr: Box::new(throw_module_not_found_expr(request)),
                        span: DUMMY_SP,
                    });
                    return Ok(CodeGeneration::hoisted_stmt(
                        format!("throw {request}").into(),
                        stmt,
                    ));
                }
                ReferencedAsset::None => {}
                _ => {
                    let mut result = vec![];

                    let merged_index = if let ReferencedAsset::Some(asset) = &referenced_asset {
                        scope_hoisting_context.get_module_index(*asset)
                    } else {
                        None
                    };

                    if let Some(merged_index) = merged_index {
                        // Insert a placeholder to inline the merged module at the right place
                        // relative to the other references (so to keep reference order).
                        result.push(CodeGenerationHoistedStmt::new(
                            format!("hoisted {merged_index}").into(),
                            quote!(
                                "__turbopack_merged_esm__($id);" as Stmt,
                                id: Expr = Lit::Num(merged_index.into()).into(),
                            ),
                        ));
                    }

                    if merged_index.is_some()
                        && matches!(this.export_name, Some(ModulePart::Evaluation))
                    {
                        // No need to import, the module was already executed and is available in
                        // the same scope hoisting group (unless it's a
                        // namespace import)
                    } else {
                        let ident = referenced_asset
                            .get_ident(
                                chunking_context,
                                this.export_name.as_ref().and_then(|e| match e {
                                    ModulePart::Export(export_name) => Some(export_name.clone()),
                                    _ => None,
                                }),
                                scope_hoisting_context,
                            )
                            .await?;
                        // `referenced_asset` must not be used past this point: the ident carries
                        // everything about the import target (see `ImportSource`) — notably,
                        // when the ident was resolved through a re-export chain, the
                        // directly-referenced asset is the outer (rename) module, not the one
                        // the emitted variable actually holds.
                        drop(referenced_asset);
                        match ident {
                            Some(ReferencedAssetIdent::LocalBinding { .. }) => {
                                // no need to import
                            }
                            Some(ReferencedAssetIdent::Module {
                                namespace_ident,
                                ctxt,
                                export: _,
                                import_source,
                            }) => {
                                let span = this
                                    .issue_source
                                    .to_swc_offsets()
                                    .await?
                                    .map_or(DUMMY_SP, |(start, end)| {
                                        Span::new(BytePos(start), BytePos(end))
                                    });
                                let name = Ident::new(
                                    namespace_ident.into(),
                                    DUMMY_SP,
                                    ctxt.unwrap_or_default(),
                                );
                                let (key, mut call_expr) = match import_source {
                                    ImportSource::Module { asset } => {
                                        let id = asset.chunk_item_id(chunking_context).await?;
                                        // Include ctxt in the key to prevent incorrect
                                        // deduplication when multiple merged modules import the
                                        // same target but have different syntax contexts (which
                                        // would cause hygiene to rename one of them).
                                        (
                                            format!("{} {:?}", id, ctxt).into(),
                                            quote!(
                                                "$turbopack_import($id)" as Expr,
                                                turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                                                id: Expr = module_id_to_lit(&id),
                                            ),
                                        )
                                    }
                                    ImportSource::External {
                                        request,
                                        ty: ExternalType::EcmaScriptModule,
                                    } => {
                                        if !*chunking_context
                                            .environment()
                                            .supports_esm_externals()
                                            .await?
                                        {
                                            turbobail!(
                                                "the chunking context ({}) does not support \
                                                 external modules (esm request: {request})",
                                                chunking_context.name()
                                            );
                                        }
                                        let call = if import_externals {
                                            quote!(
                                                "$turbopack_external_import($id)" as Expr,
                                                turbopack_external_import: Expr = TURBOPACK_EXTERNAL_IMPORT.into(),
                                                id: Expr = Expr::Lit(request.to_string().into())
                                            )
                                        } else {
                                            quote!(
                                                "$turbopack_external_require($id, () => require($id), true)" as Expr,
                                                turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                                id: Expr = Expr::Lit(request.to_string().into())
                                            )
                                        };
                                        (name.sym.as_str().into(), call)
                                    }
                                    ImportSource::External {
                                        request,
                                        ty: ExternalType::CommonJs | ExternalType::Url,
                                    } => {
                                        if !*chunking_context
                                            .environment()
                                            .supports_commonjs_externals()
                                            .await?
                                        {
                                            turbobail!(
                                                "the chunking context ({}) does not support \
                                                 external modules (request: {request})",
                                                chunking_context.name()
                                            );
                                        }
                                        let call = quote!(
                                            "$turbopack_external_require($id, () => require($id), true)" as Expr,
                                            turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                            id: Expr = Expr::Lit(request.to_string().into())
                                        );
                                        (name.sym.as_str().into(), call)
                                    }
                                    // fallback in case we introduce a new `ExternalType`
                                    #[allow(unreachable_patterns)]
                                    ImportSource::External { request, ty, .. } => {
                                        bail!(
                                            "Unsupported external type {:?} for ESM reference \
                                             with request: {:?}",
                                            ty,
                                            request
                                        )
                                    }
                                };
                                if this.is_pure_import {
                                    call_expr.set_span(PURE_SP);
                                }
                                result.push(CodeGenerationHoistedStmt::new(
                                    key,
                                    var_decl_with_span(
                                        quote!(
                                            "var $name = $call;" as Stmt,
                                            name = name,
                                            call: Expr = call_expr
                                        ),
                                        span,
                                    ),
                                ));
                            }
                            None => {
                                // Nothing to import.
                            }
                        }
                    }
                    return Ok(CodeGeneration::hoisted_stmts(result));
                }
            }
        };

        Ok(CodeGeneration::empty())
    }
}

fn var_decl_with_span(mut decl: Stmt, span: Span) -> Stmt {
    match &mut decl {
        Stmt::Decl(Decl::Var(decl)) => decl.span = span,
        _ => panic!("Expected Stmt::Decl::Var"),
    };
    decl
}

#[turbo_tasks::value(shared)]
pub struct InvalidExport {
    export: RcStr,
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    source: IssueSource,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for InvalidExport {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" doesn't exist in target module")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Bindings
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let export_names = all_known_export_names(*self.module).await?;
        let did_you_mean = export_names
            .iter()
            .map(|s| (s, jaro(self.export.as_str(), s.as_str())))
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .map(|(s, _)| s);
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(vec![
                StyledString::Text(rcstr!("The export ")),
                StyledString::Code(self.export.clone()),
                StyledString::Text(rcstr!(" was not found in module ")),
                StyledString::Strong(self.module.ident().to_string().owned().await?),
                StyledString::Text(rcstr!(".")),
            ]),
            if let Some(did_you_mean) = did_you_mean {
                StyledString::Line(vec![
                    StyledString::Text(rcstr!("Did you mean to import ")),
                    StyledString::Code(did_you_mean.clone()),
                    StyledString::Text(rcstr!("?")),
                ])
            } else {
                StyledString::Strong(rcstr!("The module has no exports at all."))
            },
            StyledString::Text(
                "All exports of the module are statically known (It doesn't have dynamic \
                 exports). So it's known statically that the requested export doesn't exist."
                    .into(),
            ),
        ])))
    }

    async fn detail(&self) -> Result<Option<StyledString>> {
        let export_names = all_known_export_names(*self.module).await?;
        Ok(Some(StyledString::Line(vec![
            StyledString::Text(rcstr!("These are the exports of the module:\n")),
            StyledString::Code(
                export_names
                    .iter()
                    .map(|s| s.as_str())
                    .intersperse(", ")
                    .collect::<String>()
                    .into(),
            ),
        ])))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[turbo_tasks::value(shared)]
pub struct CircularReExport {
    export: RcStr,
    import: Option<RcStr>,
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    module_cycle: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for CircularReExport {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" is a circular re-export")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Bindings
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.module.ident().await?.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(vec![StyledString::Text(rcstr!("The export"))]),
            StyledString::Line(vec![
                StyledString::Code(self.export.clone()),
                StyledString::Text(rcstr!(" of module ")),
                StyledString::Strong(self.module.ident().to_string().owned().await?),
            ]),
            StyledString::Line(vec![StyledString::Text(rcstr!(
                "is a re-export of the export"
            ))]),
            StyledString::Line(vec![
                StyledString::Code(self.import.clone().unwrap_or_else(|| rcstr!("*"))),
                StyledString::Text(rcstr!(" of module ")),
                StyledString::Strong(self.module_cycle.ident().to_string().owned().await?),
                StyledString::Text(rcstr!(".")),
            ]),
        ])))
    }

    fn source(&self) -> Option<IssueSource> {
        // TODO(PACK-4879): This should point at the buggy export by querying for the source
        // location
        None
    }
}
