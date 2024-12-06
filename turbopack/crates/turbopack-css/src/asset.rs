use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext, MinifyType},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    reference_type::ImportContext,
    resolve::origin::ResolveOrigin,
    source::Source,
};

use crate::{
    chunk::{CssChunkItem, CssChunkItemContent, CssChunkPlaceable, CssChunkType, CssImport},
    code_gen::CodeGenerateable,
    process::{
        finalize_css, parse_css, process_css_with_placeholder, CssWithPlaceholderResult,
        FinalCssResult, ParseCss, ParseCssResult, ProcessCss,
    },
    references::{compose::CssModuleComposeReference, import::ImportAssetReference},
    CssModuleAssetType,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("css".into())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct CssModuleAsset {
    source: ResolvedVc<Box<dyn Source>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    import_context: Option<ResolvedVc<ImportContext>>,
    ty: CssModuleAssetType,
    minify_type: MinifyType,
}

#[turbo_tasks::value_impl]
impl CssModuleAsset {
    /// Creates a new CSS asset.
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        ty: CssModuleAssetType,
        minify_type: MinifyType,
        import_context: Option<ResolvedVc<ImportContext>>,
    ) -> Vc<Self> {
        Self::cell(CssModuleAsset {
            source,
            asset_context,
            import_context,
            ty,
            minify_type,
        })
    }

    /// Retrns the asset ident of the source without the "css" modifier
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
            this.import_context
                .map(|v| *v)
                .unwrap_or_else(|| ImportContext::new(vec![], vec![], vec![])),
            this.ty,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ProcessCss for CssModuleAsset {
    #[turbo_tasks::function]
    fn get_css_with_placeholder(self: Vc<Self>) -> Vc<CssWithPlaceholderResult> {
        let parse_result = self.parse_css();

        process_css_with_placeholder(parse_result)
    }

    #[turbo_tasks::function]
    fn finalize_css(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        minify_type: MinifyType,
    ) -> Vc<FinalCssResult> {
        let process_result = self.get_css_with_placeholder();

        finalize_css(process_result, chunking_context, minify_type)
    }
}

#[turbo_tasks::value_impl]
impl Module for CssModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let mut ident = self
            .source
            .ident()
            .with_modifier(modifier())
            .with_layer(self.asset_context.layer());
        if let Some(import_context) = self.import_context {
            ident = ident.with_modifier(import_context.modifier())
        }
        ident
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let result = self.parse_css().await?;
        // TODO: include CSS source map

        match &*result {
            ParseCssResult::Ok { references, .. } => Ok(**references),
            ParseCssResult::Unparseable => Ok(ModuleReferences::empty()),
            ParseCssResult::NotFound => Ok(ModuleReferences::empty()),
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
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(CssModuleChunkItem::cell(CssModuleChunkItem {
            module: self,
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
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for CssModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(*self.chunking_context)
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(Vc::<CssChunkType>::default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
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
                ResolvedVc::try_downcast_type::<ImportAssetReference>(*reference).await?
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
                        ResolvedVc::try_downcast::<Box<dyn CssChunkPlaceable>>(module).await?
                    {
                        let item = placeable.as_chunk_item(*chunking_context);
                        if let Some(css_item) =
                            Vc::try_resolve_downcast::<Box<dyn CssChunkItem>>(item).await?
                        {
                            imports.push(CssImport::Internal(
                                import_ref.to_resolved().await?,
                                css_item.to_resolved().await?,
                            ));
                        }
                    }
                }
            } else if let Some(compose_ref) =
                ResolvedVc::try_downcast_type::<CssModuleComposeReference>(*reference).await?
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
                        ResolvedVc::try_downcast::<Box<dyn CssChunkPlaceable>>(module).await?
                    {
                        let item = placeable.as_chunk_item(*chunking_context);
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
            if let Some(code_gen) =
                ResolvedVc::try_sidecast::<Box<dyn CodeGenerateable>>(*r).await?
            {
                code_gens.push(code_gen.code_generation(*chunking_context));
            }
        }
        // need to keep that around to allow references into that
        let code_gens = code_gens.into_iter().try_join().await?;
        let code_gens = code_gens.iter().map(|cg| &**cg).collect::<Vec<_>>();
        // TOOD use interval tree with references into "code_gens"
        for code_gen in code_gens {
            for import in &code_gen.imports {
                imports.push(import.clone());
            }
        }

        let result = self
            .module
            .finalize_css(*chunking_context, self.module.await?.minify_type)
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
                source_map: Some(*source_map),
            }
            .into())
        } else {
            Ok(CssChunkItemContent {
                inner_code: format!(
                    "/* unparseable {} */",
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

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}
