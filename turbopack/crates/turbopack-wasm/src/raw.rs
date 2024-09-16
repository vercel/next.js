use anyhow::{bail, Result};
use turbo_tasks::{RcStr, ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::{ModuleReferences, SingleOutputAssetReference},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    utils::StringifyJs,
};

use crate::{output_asset::WebAssemblyAsset, source::WebAssemblySource};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("wasm raw".into())
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
        self.source
            .ident()
            .with_modifier(modifier())
            .with_layer(self.asset_context.layer())
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
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let resolved_self = self.to_resolved().await?;
        let resolved_chunking_context = chunking_context.to_resolved().await?;

        let wasm_asset = resolved_self
            .wasm_asset(Vc::upcast(*resolved_chunking_context))
            .to_resolved()
            .await?;

        Ok(Vc::upcast(
            RawModuleChunkItem {
                module: resolved_self,
                chunking_context: *resolved_chunking_context,
                wasm_asset,
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
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    wasm_asset: ResolvedVc<WebAssemblyAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for RawModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let resolved_wasm_asset = self.wasm_asset.to_resolved().await?;
        let wasm_asset_vc: Vc<WebAssemblyAsset> = *resolved_wasm_asset;
        Ok(Vc::cell(vec![Vc::upcast(SingleOutputAssetReference::new(
            Vc::upcast(wasm_asset_vc),
            Vc::cell(format!("wasm(url) {}", wasm_asset_vc.ident().to_string().await?).into()),
        ))]))
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    async fn module(&self) -> Result<Vc<Box<dyn Module>>> {
        let resolved_module = self.module.to_resolved().await?;
        Ok(Vc::upcast(*resolved_module))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for RawModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
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
