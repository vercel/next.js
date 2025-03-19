use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
    source::Source,
};
use turbopack_css::{
    chunk::{CssChunkItem, CssChunkItemContent, CssChunkType},
    embed::CssEmbed,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    utils::StringifyJs,
};

use crate::output_asset::StaticOutputAsset;

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("static in css".into())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticUrlCssModule {
    pub source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl StaticUrlCssModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(StaticUrlCssModule { source })
    }

    #[turbo_tasks::function]
    async fn static_output_asset(
        &self,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<StaticOutputAsset> {
        StaticOutputAsset::new(*chunking_context, *self.source)
    }
}

#[turbo_tasks::value_impl]
impl Module for StaticUrlCssModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticUrlCssModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for StaticUrlCssModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(StaticUrlCssChunkItem::cell(
            StaticUrlCssChunkItem {
                module: self,
                chunking_context,
                static_asset: self
                    .static_output_asset(*ResolvedVc::upcast(chunking_context))
                    .to_resolved()
                    .await?,
            },
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for StaticUrlCssModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.into()
    }
}

#[turbo_tasks::value]
struct StaticUrlCssChunkItem {
    module: ResolvedVc<StaticUrlCssModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    static_asset: ResolvedVc<StaticOutputAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for StaticUrlCssChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssets> {
        Vc::cell(vec![ResolvedVc::upcast(self.static_asset)])
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(Vc::<CssChunkType>::default().resolve().await?))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}

#[turbo_tasks::value_impl]
impl CssChunkItem for StaticUrlCssChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<CssChunkItemContent>> {
        Ok(CssChunkItemContent {
            import_context: None,
            imports: Vec::new(),
            source_map: None,
            inner_code: format!(
                "/* embedded static asset {path} */",
                path = StringifyJs(
                    &self
                        .chunking_context
                        .asset_url(self.static_asset.path())
                        .await?
                )
            )
            .into(),
        }
        .into())
    }
}

#[turbo_tasks::value_impl]
impl CssEmbed for StaticUrlCssChunkItem {
    #[turbo_tasks::function]
    fn embedded_asset(&self) -> Vc<Box<dyn OutputAsset>> {
        *ResolvedVc::upcast(self.static_asset)
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
