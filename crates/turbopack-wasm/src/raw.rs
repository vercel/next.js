use anyhow::{bail, Result};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::{ModuleReferences, SingleOutputAssetReference},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkingContext, EcmascriptExports,
    },
    utils::StringifyJs,
};

use crate::{output_asset::WebAssemblyAsset, source::WebAssemblySource};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("wasm raw".to_string())
}

/// Exports the relative path to the WebAssembly file without loading it.
#[turbo_tasks::value]
#[derive(Clone)]
pub struct RawWebAssemblyModuleAsset {
    source: Vc<WebAssemblySource>,
    asset_context: Vc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<WebAssemblySource>,
        asset_context: Vc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(RawWebAssemblyModuleAsset {
            source,
            asset_context,
        })
    }

    #[turbo_tasks::function]
    fn wasm_asset(&self, chunking_context: Vc<Box<dyn ChunkingContext>>) -> Vc<WebAssemblyAsset> {
        WebAssemblyAsset::new(self.source, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl Module for RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
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
    fn as_chunk(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            chunking_context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for RawWebAssemblyModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(
            RawModuleChunkItem {
                module: self,
                chunking_context,
                wasm_asset: self.wasm_asset(Vc::upcast(chunking_context)),
            }
            .cell(),
        )
    }

    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct RawModuleChunkItem {
    module: Vc<RawWebAssemblyModuleAsset>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    wasm_asset: Vc<WebAssemblyAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for RawModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![Vc::upcast(SingleOutputAssetReference::new(
            Vc::upcast(self.wasm_asset),
            Vc::cell(format!(
                "wasm(url) {}",
                self.wasm_asset.ident().to_string().await?
            )),
        ))]))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for RawModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let path = self.wasm_asset.ident().path().await?;
        let output_root = self.chunking_context.output_root().await?;

        let Some(path) = output_root.get_path_to(&path) else {
            bail!("WASM asset ident is not relative to output root");
        };

        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_export_value__({path});",
                path = StringifyJs(path)
            )
            .into(),
            ..Default::default()
        }
        .into())
    }
}
