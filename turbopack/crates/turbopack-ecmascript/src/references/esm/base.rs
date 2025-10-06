use anyhow::{Result, anyhow, bail};
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
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        ChunkableModuleReference, ChunkingContext, ChunkingType, ChunkingTypeOption,
        ModuleChunkItemIdExt,
    },
    context::AssetContext,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    module::Module,
    module_graph::export_usage::ModuleExportUsageInfo,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ImportWithType},
    resolve::{
        ExportUsage, ExternalType, ModulePart, ModuleResolveResult, ModuleResolveResultItem,
        RequestKey,
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use super::export::{all_known_export_names, is_export_missing};
use crate::{
    ScopeHoistingContext, TreeShakingMode,
    analyzer::imports::ImportAnnotations,
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    code_gen::{CodeGeneration, CodeGenerationHoistedStmt},
    export::Liveness,
    magic_identifier,
    references::{esm::EsmExport, util::throw_module_not_found_expr},
    runtime_functions::{TURBOPACK_EXTERNAL_IMPORT, TURBOPACK_EXTERNAL_REQUIRE, TURBOPACK_IMPORT},
    tree_shake::{TURBOPACK_PART_IMPORT_SOURCE, asset::EcmascriptModulePartAsset},
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
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
        namespace_ident: String,
        ctxt: Option<SyntaxContext>,
        export: Option<RcStr>,
    },
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
                                && *referenced_asset == ReferencedAsset::Some(initial)
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
                                    }) => Some(ReferencedAssetIdent::Module {
                                        namespace_ident,
                                        ctxt: Some(ctxt),
                                        export,
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

                Some(ReferencedAssetIdent::Module {
                    namespace_ident: Self::get_ident_from_placeable(asset, chunking_context)
                        .await?,
                    ctxt: None,
                    export,
                })
            }
            ReferencedAsset::External(request, ty) => Some(ReferencedAssetIdent::Module {
                namespace_ident: magic_identifier::mangle(&format!("{ty} external {request}")),
                ctxt: None,
                export,
            }),
            ReferencedAsset::None | ReferencedAsset::Unresolvable => None,
        })
    }

    pub(crate) async fn get_ident_from_placeable(
        asset: &Vc<Box<dyn EcmascriptChunkPlaceable>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<String> {
        let id = asset.chunk_item_id(chunking_context).await?;
        Ok(magic_identifier::mangle(&format!("imported module {id}")))
    }
}

#[turbo_tasks::value_impl]
impl ReferencedAsset {
    #[turbo_tasks::function]
    pub async fn from_resolve_result(resolve_result: Vc<ModuleResolveResult>) -> Result<Vc<Self>> {
        // TODO handle multiple keyed results
        let result = resolve_result.await?;
        if result.is_unresolvable_ref() {
            return Ok(ReferencedAsset::Unresolvable.cell());
        }
        for (_, result) in result.primary.iter() {
            match result {
                ModuleResolveResultItem::External {
                    name: request, ty, ..
                } => {
                    return Ok(ReferencedAsset::External(request.clone(), *ty).cell());
                }
                &ModuleResolveResultItem::Module(module) => {
                    if let Some(placeable) =
                        ResolvedVc::try_downcast::<Box<dyn EcmascriptChunkPlaceable>>(module)
                    {
                        return Ok(ReferencedAsset::Some(placeable).cell());
                    }
                }
                // TODO ignore should probably be handled differently
                _ => {}
            }
        }
        Ok(ReferencedAsset::None.cell())
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
#[derive(Hash, Debug)]
pub struct EsmAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    // Request is a string to avoid eagerly parsing into a `Request` VC
    pub request: RcStr,
    pub annotations: ImportAnnotations,
    pub issue_source: IssueSource,
    pub export_name: Option<ModulePart>,
    pub import_externals: bool,
    pub is_pure_import: bool,
}

impl EsmAssetReference {
    fn get_origin(&self) -> Vc<Box<dyn ResolveOrigin>> {
        if let Some(transition) = self.annotations.transition() {
            self.origin.with_transition(transition.into())
        } else {
            *self.origin
        }
    }
}

impl EsmAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        export_name: Option<ModulePart>,
        import_externals: bool,
    ) -> Self {
        EsmAssetReference {
            origin,
            request,
            issue_source,
            annotations,
            export_name,
            import_externals,
            is_pure_import: false,
        }
    }

    pub fn new_pure(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: RcStr,
        issue_source: IssueSource,
        annotations: ImportAnnotations,
        export_name: Option<ModulePart>,
        import_externals: bool,
    ) -> Self {
        EsmAssetReference {
            origin,
            request,
            issue_source,
            annotations,
            export_name,
            import_externals,
            is_pure_import: true,
        }
    }
}

#[turbo_tasks::value_impl]
impl EsmAssetReference {
    #[turbo_tasks::function]
    pub(crate) fn get_referenced_asset(self: Vc<Self>) -> Vc<ReferencedAsset> {
        ReferencedAsset::from_resolve_result(self.resolve_reference())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let ty = if matches!(self.annotations.module_type(), Some("json")) {
            EcmaScriptModulesReferenceSubType::ImportWithType(ImportWithType::Json)
        } else if matches!(self.annotations.module_type(), Some("bytes")) {
            EcmaScriptModulesReferenceSubType::ImportWithType(ImportWithType::Bytes)
        } else if let Some(part) = &self.export_name {
            EcmaScriptModulesReferenceSubType::ImportPart(part.clone())
        } else {
            EcmaScriptModulesReferenceSubType::Import
        };

        if let Some(ModulePart::Evaluation) = &self.export_name {
            let module: ResolvedVc<crate::EcmascriptModuleAsset> =
                ResolvedVc::try_downcast_type(self.origin)
                    .expect("EsmAssetReference origin should be a EcmascriptModuleAsset");

            let tree_shaking_mode = module.options().await?.tree_shaking_mode;

            if let Some(TreeShakingMode::ModuleFragments) = tree_shaking_mode {
                let side_effect_free_packages = module.asset_context().side_effect_free_packages();

                if *module
                    .is_marked_as_side_effect_free(side_effect_free_packages)
                    .await?
                {
                    return Ok(ModuleResolveResult {
                        primary: Box::new([(
                            RequestKey::default(),
                            ModuleResolveResultItem::Ignore,
                        )]),
                        affecting_sources: Default::default(),
                    }
                    .cell());
                }
            }
        }
        let request = Request::parse(self.request.clone().into());

        if let Request::Module { module, .. } = &*request.await?
            && module.is_match(TURBOPACK_PART_IMPORT_SOURCE)
        {
            if let Some(part) = &self.export_name {
                let module: ResolvedVc<crate::EcmascriptModuleAsset> =
                    ResolvedVc::try_downcast_type(self.origin)
                        .expect("EsmAssetReference origin should be a EcmascriptModuleAsset");

                return Ok(*ModuleResolveResult::module(ResolvedVc::upcast(
                    EcmascriptModulePartAsset::select_part(*module, part.clone())
                        .to_resolved()
                        .await?,
                )));
            }

            bail!("export_name is required for part import")
        }

        let result = esm_resolve(
            self.get_origin().resolve().await?,
            request,
            ty,
            false,
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
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("import {} with {}", self.request, self.annotations).into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Result<Vc<ChunkingTypeOption>> {
        Ok(Vc::cell(
            if let Some(chunking_type) = self.annotations.chunking_type() {
                match chunking_type {
                    "parallel" => Some(ChunkingType::Parallel {
                        inherit_async: true,
                        hoisted: true,
                    }),
                    "none" => None,
                    _ => return Err(anyhow!("unknown chunking_type: {}", chunking_type)),
                }
            } else {
                Some(ChunkingType::Parallel {
                    inherit_async: true,
                    hoisted: true,
                })
            },
        ))
    }

    #[turbo_tasks::function]
    fn export_usage(&self) -> Vc<ExportUsage> {
        match &self.export_name {
            Some(ModulePart::Export(export_name)) => ExportUsage::named(export_name.clone()),
            Some(ModulePart::Evaluation) => ExportUsage::evaluation(),
            _ => ExportUsage::all(),
        }
    }
}

impl EsmAssetReference {
    pub async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        scope_hoisting_context: ScopeHoistingContext<'_>,
    ) -> Result<CodeGeneration> {
        let this = &*self.await?;

        // only chunked references can be imported
        if this.annotations.chunking_type() != Some("none") {
            let import_externals = this.import_externals;
            let referenced_asset = self.get_referenced_asset().await?;

            match &*referenced_asset {
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

                    let merged_index = if let ReferencedAsset::Some(asset) = &*referenced_asset {
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
                        && matches!(*self.export_usage().await?, ExportUsage::Evaluation)
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
                        match ident {
                            Some(ReferencedAssetIdent::LocalBinding { .. }) => {
                                // no need to import
                            }
                            Some(ident @ ReferencedAssetIdent::Module { .. }) => {
                                let span = this
                                    .issue_source
                                    .to_swc_offsets()
                                    .await?
                                    .map_or(DUMMY_SP, |(start, end)| {
                                        Span::new(BytePos(start), BytePos(end))
                                    });
                                match &*referenced_asset {
                                    ReferencedAsset::Unresolvable => {
                                        unreachable!();
                                    }
                                    ReferencedAsset::Some(asset) => {
                                        let id = asset.chunk_item_id(chunking_context).await?;
                                        let (sym, ctxt) =
                                            ident.into_module_namespace_ident().unwrap();
                                        let name = Ident::new(
                                            sym.into(),
                                            DUMMY_SP,
                                            ctxt.unwrap_or_default(),
                                        );
                                        let mut call_expr = quote!(
                                            "$turbopack_import($id)" as Expr,
                                            turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                                            id: Expr = module_id_to_lit(&id),
                                        );
                                        if this.is_pure_import {
                                            call_expr.set_span(PURE_SP);
                                        }
                                        result.push(CodeGenerationHoistedStmt::new(
                                            id.to_string().into(),
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
                                    ReferencedAsset::External(
                                        request,
                                        ExternalType::EcmaScriptModule,
                                    ) => {
                                        if !*chunking_context
                                            .environment()
                                            .supports_esm_externals()
                                            .await?
                                        {
                                            bail!(
                                                "the chunking context ({}) does not support \
                                                 external modules (esm request: {})",
                                                chunking_context.name().await?,
                                                request
                                            );
                                        }
                                        let (sym, ctxt) =
                                            ident.into_module_namespace_ident().unwrap();
                                        let name = Ident::new(
                                            sym.into(),
                                            DUMMY_SP,
                                            ctxt.unwrap_or_default(),
                                        );
                                        let mut call_expr = if import_externals {
                                            quote!(
                                                "$turbopack_external_import($id)" as Expr,
                                                turbopack_external_import: Expr = TURBOPACK_EXTERNAL_IMPORT.into(),
                                                id: Expr = Expr::Lit(request.clone().to_string().into())
                                            )
                                        } else {
                                            quote!(
                                                "$turbopack_external_require($id, () => require($id), true)" as Expr,
                                                turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                                id: Expr = Expr::Lit(request.clone().to_string().into())
                                            )
                                        };
                                        if this.is_pure_import {
                                            call_expr.set_span(PURE_SP);
                                        }
                                        result.push(CodeGenerationHoistedStmt::new(
                                            name.sym.as_str().into(),
                                            var_decl_with_span(
                                                quote!(
                                                    "var $name = $call;" as Stmt,
                                                    name = name,
                                                    call: Expr = call_expr,
                                                ),
                                                span,
                                            ),
                                        ));
                                    }
                                    ReferencedAsset::External(
                                        request,
                                        ExternalType::CommonJs | ExternalType::Url,
                                    ) => {
                                        if !*chunking_context
                                            .environment()
                                            .supports_commonjs_externals()
                                            .await?
                                        {
                                            bail!(
                                                "the chunking context ({}) does not support \
                                                 external modules (request: {})",
                                                chunking_context.name().await?,
                                                request
                                            );
                                        }
                                        let (sym, ctxt) =
                                            ident.into_module_namespace_ident().unwrap();
                                        let name = Ident::new(
                                            sym.into(),
                                            DUMMY_SP,
                                            ctxt.unwrap_or_default(),
                                        );
                                        let mut call_expr = quote!(
                                            "$turbopack_external_require($id, () => require($id), true)" as Expr,
                                            turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                            id: Expr = Expr::Lit(request.clone().to_string().into())
                                        );
                                        if this.is_pure_import {
                                            call_expr.set_span(PURE_SP);
                                        }
                                        result.push(CodeGenerationHoistedStmt::new(
                                            name.sym.as_str().into(),
                                            var_decl_with_span(
                                                quote!(
                                                    "var $name = $call;" as Stmt,
                                                    name = name,
                                                    call: Expr = call_expr,
                                                ),
                                                span,
                                            ),
                                        ));
                                    }
                                    // fallback in case we introduce a new `ExternalType`
                                    #[allow(unreachable_patterns)]
                                    ReferencedAsset::External(request, ty) => {
                                        bail!(
                                            "Unsupported external type {:?} for ESM reference \
                                             with request: {:?}",
                                            ty,
                                            request
                                        )
                                    }
                                    ReferencedAsset::None => {}
                                };
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

#[turbo_tasks::value_impl]
impl Issue for InvalidExport {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" doesn't exist in target module")),
        ])
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Bindings.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        let export_names = all_known_export_names(*self.module).await?;
        let did_you_mean = export_names
            .iter()
            .map(|s| (s, jaro(self.export.as_str(), s.as_str())))
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
            .map(|(s, _)| s);
        Ok(Vc::cell(Some(
            StyledString::Stack(vec![
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
            ])
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<Vc<OptionStyledString>> {
        let export_names = all_known_export_names(*self.module).await?;
        Ok(Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text(rcstr!("These are the exports of the module:\n")),
                StyledString::Code(
                    export_names
                        .iter()
                        .map(|s| s.as_str())
                        .intersperse(", ")
                        .collect::<String>()
                        .into(),
                ),
            ])
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}

#[turbo_tasks::value(shared)]
pub struct CircularReExport {
    export: RcStr,
    import: Option<RcStr>,
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    module_cycle: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl Issue for CircularReExport {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Error
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Export ")),
            StyledString::Code(self.export.clone()),
            StyledString::Text(rcstr!(" is a circular re-export")),
        ])
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Bindings.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.module.ident().path()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Stack(vec![
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
            ])
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        // TODO(PACK-4879): This should point at the buggy export by querying for the source
        // location
        Vc::cell(None)
    }
}
