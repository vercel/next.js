use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
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
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
    utils::StringifyJs,
};

use crate::output_asset::StaticOutputAsset;

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticUrlJsModule {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub tag: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl StaticUrlJsModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>, tag: Option<RcStr>) -> Vc<Self> {
        Self::cell(StaticUrlJsModule { source, tag })
    }

    #[turbo_tasks::function]
    fn static_output_asset(
        &self,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<StaticOutputAsset> {
        StaticOutputAsset::new(*chunking_context, *self.source, self.tag.clone())
    }
}

#[turbo_tasks::value_impl]
impl Module for StaticUrlJsModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        let mut ident = self
            .source
            .ident()
            .with_modifier(rcstr!("static in ecmascript"));
        if let Some(tag) = &self.tag {
            ident = ident.with_modifier(format!("tag {}", tag).into());
        }
        ident
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticUrlJsModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for StaticUrlJsModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(StaticUrlJsChunkItem::cell(
            StaticUrlJsChunkItem {
                module: self,
                chunking_context,
                static_asset: self
                    .static_output_asset(*chunking_context)
                    .to_resolved()
                    .await?,
                tag: self.await?.tag.clone(),
            },
        )))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for StaticUrlJsModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.into()
    }
}

#[turbo_tasks::value]
struct StaticUrlJsChunkItem {
    module: ResolvedVc<StaticUrlJsModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    static_asset: ResolvedVc<StaticOutputAsset>,
    tag: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for StaticUrlJsChunkItem {
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
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for StaticUrlJsChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "{TURBOPACK_EXPORT_VALUE}({path});",
                path = StringifyJs(
                    &self
                        .chunking_context
                        .asset_url(self.static_asset.path().owned().await?, self.tag.clone())
                        .await?
                )
            )
            .into(),
            ..Default::default()
        }
        .into())
    }
}
