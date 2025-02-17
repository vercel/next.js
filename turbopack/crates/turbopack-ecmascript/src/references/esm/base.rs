use anyhow::{anyhow, bail, Result};
use strsim::jaro;
use swc_core::{
    common::{BytePos, Span, DUMMY_SP},
    ecma::ast::{Decl, Expr, ExprStmt, Ident, Stmt},
    quote,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{
        ChunkItemExt, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    module::Module,
    module_graph::ModuleGraph,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ImportWithType},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        ExternalType, ModulePart, ModuleResolveResult, ModuleResolveResultItem,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use super::export::{all_known_export_names, is_export_missing};
use crate::{
    analyzer::imports::ImportAnnotations,
    chunk::EcmascriptChunkPlaceable,
    code_gen::{CodeGenerateable, CodeGeneration},
    magic_identifier,
    references::util::{request_to_string, throw_module_not_found_expr},
    runtime_functions::{TURBOPACK_EXTERNAL_IMPORT, TURBOPACK_EXTERNAL_REQUIRE, TURBOPACK_IMPORT},
    tree_shake::{asset::EcmascriptModulePartAsset, TURBOPACK_PART_IMPORT_SOURCE},
    utils::module_id_to_lit,
};

#[turbo_tasks::value]
pub enum ReferencedAsset {
    Some(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>),
    External(RcStr, ExternalType),
    None,
    Unresolvable,
}

impl ReferencedAsset {
    pub async fn get_ident(
        &self,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Option<String>> {
        Ok(match self {
            ReferencedAsset::Some(asset) => {
                Some(Self::get_ident_from_placeable(asset, module_graph, chunking_context).await?)
            }
            ReferencedAsset::External(request, ty) => Some(magic_identifier::mangle(&format!(
                "{ty} external {request}"
            ))),
            ReferencedAsset::None | ReferencedAsset::Unresolvable => None,
        })
    }

    pub(crate) async fn get_ident_from_placeable(
        asset: &Vc<Box<dyn EcmascriptChunkPlaceable>>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<String> {
        let id = asset
            .as_chunk_item(module_graph, Vc::upcast(chunking_context))
            .id()
            .await?;
        Ok(magic_identifier::mangle(&format!("imported module {}", id)))
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

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct EsmAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub annotations: ImportAnnotations,
    pub issue_source: IssueSource,
    pub export_name: Option<ModulePart>,
    pub import_externals: bool,
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
        request: ResolvedVc<Request>,
        issue_source: IssueSource,
        annotations: Value<ImportAnnotations>,
        export_name: Option<ModulePart>,
        import_externals: bool,
    ) -> Self {
        EsmAssetReference {
            origin,
            request,
            issue_source,
            annotations: annotations.into_value(),
            export_name,
            import_externals,
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
        } else if let Some(part) = &self.export_name {
            EcmaScriptModulesReferenceSubType::ImportPart(part.clone())
        } else {
            EcmaScriptModulesReferenceSubType::Import
        };

        if let Request::Module { module, .. } = &*self.request.await? {
            if module == TURBOPACK_PART_IMPORT_SOURCE {
                if let Some(part) = &self.export_name {
                    let module: ResolvedVc<crate::EcmascriptModuleAsset> =
                        ResolvedVc::try_downcast_type(self.origin)
                            .expect("EsmAssetReference origin should be a EcmascriptModuleAsset");

                    return Ok(ModuleResolveResult::module(
                        EcmascriptModulePartAsset::select_part(*module, part.clone())
                            .to_resolved()
                            .await?,
                    )
                    .cell());
                }

                bail!("export_name is required for part import")
            }
        }

        let result = esm_resolve(
            self.get_origin().resolve().await?,
            *self.request,
            Value::new(ty),
            false,
            Some(self.issue_source.clone()),
        )
        .await?;

        if let Some(ModulePart::Export(export_name)) = &self.export_name {
            for &module in result.primary_modules().await? {
                if let Some(module) = ResolvedVc::try_downcast(module) {
                    if *is_export_missing(*module, export_name.clone()).await? {
                        InvalidExport {
                            export: export_name.clone(),
                            module,
                            source: self.issue_source.clone(),
                        }
                        .resolved_cell()
                        .emit();
                    }
                }
            }
        }

        Ok(result)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EsmAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "import {} with {}",
                self.request.to_string().await?,
                self.annotations
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EsmAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Result<Vc<ChunkingTypeOption>> {
        Ok(Vc::cell(
            if let Some(chunking_type) = self.annotations.chunking_type() {
                match chunking_type {
                    "parallel" => Some(ChunkingType::ParallelInheritAsync),
                    "none" => None,
                    _ => return Err(anyhow!("unknown chunking_type: {}", chunking_type)),
                }
            } else {
                Some(ChunkingType::ParallelInheritAsync)
            },
        ))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for EsmAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let this = &*self.await?;

        // only chunked references can be imported
        let result = if this.annotations.chunking_type() != Some("none") {
            let import_externals = this.import_externals;
            let referenced_asset = self.get_referenced_asset().await?;
            if let ReferencedAsset::Unresolvable = &*referenced_asset {
                // Insert code that throws immediately at time of import if a request is
                // unresolvable
                let request = request_to_string(*this.request).await?.to_string();
                let stmt = Stmt::Expr(ExprStmt {
                    expr: Box::new(throw_module_not_found_expr(&request)),
                    span: DUMMY_SP,
                });
                Some((format!("throw {request}").into(), stmt))
            } else if let Some(ident) = referenced_asset
                .get_ident(module_graph, chunking_context)
                .await?
            {
                let span = this
                    .issue_source
                    .to_swc_offsets()
                    .await?
                    .map_or(DUMMY_SP, |(start, end)| {
                        Span::new(BytePos(start), BytePos(end))
                    });
                match &*referenced_asset {
                    ReferencedAsset::Unresolvable => {
                        unreachable!()
                    }
                    ReferencedAsset::Some(asset) => {
                        let id = asset
                            .as_chunk_item(module_graph, Vc::upcast(chunking_context))
                            .id()
                            .await?;
                        let name = ident;
                        Some((
                            id.to_string().into(),
                            var_decl_with_span(
                                quote!(
                                    "var $name = $turbopack_import($id);" as Stmt,
                                    name = Ident::new(name.clone().into(), DUMMY_SP, Default::default()),
                                    turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                                    id: Expr = module_id_to_lit(&id),
                                ),
                                span,
                            ),
                        ))
                    }
                    ReferencedAsset::External(request, ExternalType::EcmaScriptModule) => {
                        if !*chunking_context
                            .environment()
                            .supports_esm_externals()
                            .await?
                        {
                            bail!(
                                "the chunking context ({}) does not support external modules (esm \
                                 request: {})",
                                chunking_context.name().await?,
                                request
                            );
                        }
                        Some((
                            ident.clone().into(),
                            var_decl_with_span(
                                if import_externals {
                                    quote!(
                                        "var $name = $turbopack_external_import($id);" as Stmt,
                                        name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                        turbopack_external_import: Expr = TURBOPACK_EXTERNAL_IMPORT.into(),
                                        id: Expr = Expr::Lit(request.clone().to_string().into())
                                    )
                                } else {
                                    quote!(
                                        "var $name = $turbopack_external_require($id, () => require($id), true);" as Stmt,
                                        name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                        turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                        id: Expr = Expr::Lit(request.clone().to_string().into())
                                    )
                                },
                                span,
                            ),
                        ))
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
                                "the chunking context ({}) does not support external modules \
                                 (request: {})",
                                chunking_context.name().await?,
                                request
                            );
                        }
                        Some((
                            ident.clone().into(),
                            var_decl_with_span(
                                quote!(
                                    "var $name = $turbopack_external_require($id, () => require($id), true);" as Stmt,
                                    name = Ident::new(ident.clone().into(), DUMMY_SP, Default::default()),
                                    turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                    id: Expr = Expr::Lit(request.clone().to_string().into())
                                ),
                                span,
                            ),
                        ))
                    }
                    // fallback in case we introduce a new `ExternalType`
                    #[allow(unreachable_patterns)]
                    ReferencedAsset::External(request, ty) => {
                        bail!(
                            "Unsupported external type {:?} for ESM reference with request: {:?}",
                            ty,
                            request
                        )
                    }
                    ReferencedAsset::None => None,
                }
            } else {
                None
            }
        } else {
            None
        };

        if let Some((key, stmt)) = result {
            Ok(CodeGeneration::hoisted_stmt(key, stmt).cell())
        } else {
            Ok(CodeGeneration::empty().cell())
        }
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
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Line(vec![
            StyledString::Text("Export ".into()),
            StyledString::Code(self.export.clone()),
            StyledString::Text(" doesn't exist in target module".into()),
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
                    StyledString::Text("The export ".into()),
                    StyledString::Code(self.export.clone()),
                    StyledString::Text(" was not found in module ".into()),
                    StyledString::Strong(self.module.ident().to_string().owned().await?),
                    StyledString::Text(".".into()),
                ]),
                if let Some(did_you_mean) = did_you_mean {
                    StyledString::Line(vec![
                        StyledString::Text("Did you mean to import ".into()),
                        StyledString::Code(did_you_mean.clone()),
                        StyledString::Text("?".into()),
                    ])
                } else {
                    StyledString::Strong("The module has no exports at all.".into())
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
                StyledString::Text("These are the exports of the module:\n".into()),
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
        Vc::cell(Some(self.source.clone()))
    }
}
