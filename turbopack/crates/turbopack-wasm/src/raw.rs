use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{IntoTraitRef, ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    context::AssetContext,
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

use crate::{output_asset::WebAssemblyAsset, source::WebAssemblySource};

/// Exports the relative path to the WebAssembly file without loading it.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct RawWebAssemblyModuleAsset {
    source: ResolvedVc<WebAssemblySource>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<WebAssemblySource>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(RawWebAssemblyModuleAsset {
            source,
            asset_context,
        })
    }

    #[turbo_tasks::function]
    fn wasm_asset(&self, chunking_context: Vc<Box<dyn ChunkingContext>>) -> Vc<WebAssemblyAsset> {
        WebAssemblyAsset::new(*self.source, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl Module for RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .source
            .ident()
            .with_modifier(rcstr!("wasm raw"))
            .with_layer(self.asset_context.into_trait_ref().await?.layer()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            RawModuleChunkItem {
                module: self,
                chunking_context,
                wasm_asset: self.wasm_asset(*chunking_context).to_resolved().await?,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct RawModuleChunkItem {
    module: ResolvedVc<RawWebAssemblyModuleAsset>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    wasm_asset: ResolvedVc<WebAssemblyAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for RawModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(self.wasm_asset)]))
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
        Vc::upcast(*self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for RawModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let path = self.wasm_asset.path().await?;
        let output_root = self.chunking_context.output_root().await?;

        let Some(path) = output_root.get_path_to(&path) else {
            bail!("WASM asset ident is not relative to output root");
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "{TURBOPACK_EXPORT_VALUE}({path});",
                path = StringifyJs(path)
            )
            .into(),
            ..Default::default()
        }
        .into())
    }
}
