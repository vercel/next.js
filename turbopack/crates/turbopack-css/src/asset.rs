use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{IntoTraitRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    chunk::{ChunkItem, ChunkingContext, MinifyType},
    context::AssetContext,
    environment::Environment,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects, StyleModule, StyleType},
    module_graph::ModuleGraph,
    output::OutputAssetsWithReferenced,
    reference::{ModuleReference, ModuleReferences},
    reference_type::ImportContext,
    resolve::origin::ResolveOrigin,
    source::{OptionSource, Source},
    source_map::GenerateSourceMap,
};

use crate::{
    CssModuleAssetType,
    chunk::{CssChunkItemContent, CssChunkPlaceable, CssImport},
    code_gen::CodeGenerateable,
    process::{
        CssWithPlaceholderResult, FinalCssResult, ParseCss, ParseCssResult, ProcessCss,
        finalize_css, parse_css, process_css_with_placeholder,
    },
    references::{
        compose::CssModuleComposeReference, import::ImportAssetReference, url::ReferencedAsset,
    },
};

#[turbo_tasks::value]
#[derive(Clone)]
/// A global CSS asset. Notably not a `.module.css` module, which is [`ModuleCssAsset`] instead.
pub struct CssModuleAsset {
    source: ResolvedVc<Box<dyn Source>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    import_context: Option<ResolvedVc<ImportContext>>,
    ty: CssModuleAssetType,
    environment: Option<ResolvedVc<Environment>>,
}

#[turbo_tasks::value_impl]
impl CssModuleAsset {
    /// Creates a new CSS asset.
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        ty: CssModuleAssetType,
        import_context: Option<ResolvedVc<ImportContext>>,
        environment: Option<ResolvedVc<Environment>>,
    ) -> Vc<Self> {
        Self::cell(CssModuleAsset {
            source,
            asset_context,
            import_context,
            ty,
            environment,
        })
    }

    /// Returns the asset ident of the source without the "css" modifier
    #[turbo_tasks::function]
    pub fn source_ident(&self) -> Vc<AssetIdent> {
        self.source.ident()
    }
}

#[turbo_tasks::value_impl]
impl ParseCss for CssModuleAsset {
    #[turbo_tasks::function]
    async fn parse_css(self: Vc<Self>) -> Result<Vc<ParseCssResult>> {
        let this = self.await?;

        Ok(parse_css(
            *this.source,
            Vc::upcast(self),
            this.import_context.map(|v| *v),
            this.ty,
            this.environment.as_deref().copied(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ProcessCss for CssModuleAsset {
    #[turbo_tasks::function]
    async fn get_css_with_placeholder(self: Vc<Self>) -> Result<Vc<CssWithPlaceholderResult>> {
        let this = self.await?;
        let parse_result = self.parse_css();

        Ok(process_css_with_placeholder(
            parse_result,
            this.environment.as_deref().copied(),
        ))
    }

    #[turbo_tasks::function]
    async fn finalize_css(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        minify_type: MinifyType,
    ) -> Result<Vc<FinalCssResult>> {
        let process_result = self.get_css_with_placeholder();

        let this = self.await?;
        let origin_source_map =
            match ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(this.source) {
                Some(gsm) => gsm.generate_source_map(),
                None => FileContent::NotFound.cell(),
            };
        Ok(finalize_css(
            process_result,
            chunking_context,
            minify_type,
            origin_source_map,
            this.environment.as_deref().copied(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for CssModuleAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self
            .source
            .ident()
            .with_modifier(rcstr!("css"))
            .with_layer(self.asset_context.into_trait_ref().await?.layer());
        if let Some(import_context) = self.import_context {
            ident = ident.with_modifier(import_context.modifier().owned().await?)
        }
        Ok(ident)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let result = self.parse_css().await?;
        // TODO: include CSS source map

        match &*result {
            ParseCssResult::Ok { references, .. } => Ok(**references),
            ParseCssResult::Unparsable => Ok(ModuleReferences::empty()),
            ParseCssResult::NotFound => Ok(ModuleReferences::empty()),
        }
    }
    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        // global css is always a side effect
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl StyleModule for CssModuleAsset {
    #[turbo_tasks::function]
    fn style_type(&self) -> Vc<StyleType> {
        match self.ty {
            CssModuleAssetType::Default => StyleType::GlobalStyle.cell(),
            CssModuleAssetType::Module => StyleType::IsolatedStyle.cell(),
        }
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for CssModuleAsset {
    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<CssChunkItemContent>> {
        let this = self.await?;
        let references = &*self.references().await?;
        let mut imports = vec![];
        let chunking_context = chunking_context.to_resolved().await?;
        let module_graph = module_graph.to_resolved().await?;

        for reference in references.iter() {
            if let Some(import_ref) =
                ResolvedVc::try_downcast_type::<ImportAssetReference>(*reference)
            {
                for &module in import_ref
                    .resolve_reference()
                    .resolve()
                    .await?
                    .primary_modules()
                    .await?
                    .iter()
                {
                    if let Some(placeable) =
                        ResolvedVc::try_downcast::<Box<dyn CssChunkPlaceable>>(module)
                    {
                        let item = ChunkItem::new(
                            Vc::upcast(*placeable),
                            *module_graph,
                            *chunking_context,
                        )
                        .to_resolved()
                        .await?;
                        imports.push(CssImport::Internal(import_ref, item));
                    }
                }
            } else if let Some(compose_ref) =
                ResolvedVc::try_downcast_type::<CssModuleComposeReference>(*reference)
            {
                for &module in compose_ref
                    .resolve_reference()
                    .resolve()
                    .await?
                    .primary_modules()
                    .await?
                    .iter()
                {
                    if let Some(placeable) =
                        ResolvedVc::try_downcast::<Box<dyn CssChunkPlaceable>>(module)
                    {
                        let item = ChunkItem::new(
                            Vc::upcast(*placeable),
                            *module_graph,
                            *chunking_context,
                        )
                        .to_resolved()
                        .await?;
                        imports.push(CssImport::Composes(item));
                    }
                }
            }
        }

        let mut code_gens = Vec::new();
        for r in references.iter() {
            if let Some(code_gen) = ResolvedVc::try_sidecast::<Box<dyn CodeGenerateable>>(*r) {
                code_gens.push(code_gen.code_generation(*chunking_context));
            }
        }
        // need to keep that around to allow references into that
        let code_gens = code_gens.into_iter().try_join().await?;
        let code_gens = code_gens.iter().map(|cg| &**cg).collect::<Vec<_>>();
        // TODO use interval tree with references into "code_gens"
        for code_gen in code_gens {
            for import in &code_gen.imports {
                imports.push(import.clone());
            }
        }

        let result = self
            .finalize_css(*chunking_context, *chunking_context.minify_type().await?)
            .await?;

        if let FinalCssResult::Ok {
            output_code,
            source_map,
        } = &*result
        {
            Ok(CssChunkItemContent {
                inner_code: output_code.to_owned().into(),
                imports,
                import_context: this.import_context,
                source_map: *source_map,
            }
            .cell())
        } else {
            Ok(CssChunkItemContent {
                inner_code: format!("/* unparsable {} */", self.ident().to_string().await?).into(),
                imports: vec![],
                import_context: None,
                source_map: FileContent::NotFound.resolved_cell(),
            }
            .cell())
        }
    }

    #[turbo_tasks::function]
    async fn chunk_item_output_assets(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        let mut references = Vec::new();
        if let ParseCssResult::Ok { url_references, .. } = &*self.parse_css().await? {
            for (_, reference) in url_references.await? {
                if let ReferencedAsset::Some(asset) =
                    *reference.get_referenced_asset(chunking_context).await?
                {
                    references.push(asset);
                }
            }
        }
        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for CssModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        *self.asset_context
    }
}
