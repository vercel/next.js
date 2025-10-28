use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{IntoTraitRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext, MinifyType},
    context::AssetContext,
    environment::Environment,
    ident::AssetIdent,
    module::{Module, StyleModule, StyleType},
    module_graph::ModuleGraph,
    output::OutputAssets,
    reference::{ModuleReference, ModuleReferences},
    reference_type::ImportContext,
    resolve::origin::ResolveOrigin,
    source::Source,
    source_map::GenerateSourceMap,
};

use crate::{
    CssModuleAssetType,
    chunk::{CssChunkItem, CssChunkItemContent, CssChunkPlaceable, CssChunkType, CssImport},
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
                None => Vc::cell(None),
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
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let result = self.parse_css().await?;
        // TODO: include CSS source map

        match &*result {
            ParseCssResult::Ok { references, .. } => Ok(**references),
            ParseCssResult::Unparsable => Ok(ModuleReferences::empty()),
            ParseCssResult::NotFound => Ok(ModuleReferences::empty()),
        }
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
impl Asset for CssModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for CssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(CssModuleChunkItem::cell(CssModuleChunkItem {
            module: self,
            module_graph,
            chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for CssModuleAsset {}

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

#[turbo_tasks::value]
struct CssModuleChunkItem {
    module: ResolvedVc<CssModuleAsset>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<CssChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let mut references = Vec::new();
        if let ParseCssResult::Ok { url_references, .. } = &*self.module.parse_css().await? {
            for (_, reference) in url_references.await? {
                if let ReferencedAsset::Some(asset) = *reference
                    .get_referenced_asset(*self.chunking_context)
                    .await?
                {
                    references.push(asset);
                }
            }
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl CssChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<CssChunkItemContent>> {
        let references = &*self.module.references().await?;
        let mut imports = vec![];
        let chunking_context = self.chunking_context;

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
                        let item = placeable.as_chunk_item(*self.module_graph, *chunking_context);
                        if let Some(css_item) =
                            Vc::try_resolve_downcast::<Box<dyn CssChunkItem>>(item).await?
                        {
                            imports.push(CssImport::Internal(
                                import_ref,
                                css_item.to_resolved().await?,
                            ));
                        }
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
                        let item = placeable.as_chunk_item(*self.module_graph, *chunking_context);
                        if let Some(css_item) =
                            Vc::try_resolve_downcast::<Box<dyn CssChunkItem>>(item).await?
                        {
                            imports.push(CssImport::Composes(css_item.to_resolved().await?));
                        }
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
            .module
            .finalize_css(*chunking_context, *chunking_context.minify_type().await?)
            .await?;

        if let FinalCssResult::Ok {
            output_code,
            source_map,
            ..
        } = &*result
        {
            Ok(CssChunkItemContent {
                inner_code: output_code.to_owned().into(),
                imports,
                import_context: self.module.await?.import_context,
                source_map: source_map.owned().await?,
            }
            .into())
        } else {
            Ok(CssChunkItemContent {
                inner_code: format!(
                    "/* unparsable {} */",
                    self.module.ident().to_string().await?
                )
                .into(),
                imports: vec![],
                import_context: None,
                source_map: None,
            }
            .into())
        }
    }
}
