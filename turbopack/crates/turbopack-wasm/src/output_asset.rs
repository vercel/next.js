use anyhow::Result;
use turbo_tasks::{RcStr, ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    ident::AssetIdent,
    output::OutputAsset,
    source::Source,
};

use crate::source::WebAssemblySource;

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("wasm".into())
}

/// Emits the [WebAssemblySource] at a chunk path determined by the
/// [ChunkingContext].
#[turbo_tasks::value]
pub(crate) struct WebAssemblyAsset {
    source: ResolvedVc<WebAssemblySource>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl WebAssemblyAsset {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        source: Vc<WebAssemblySource>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Self>> {
        let resolved_source = source.to_resolved().await?;
        let resolved_chunking_context = chunking_context.to_resolved().await?;
        Ok(Self::cell(WebAssemblyAsset {
            source: resolved_source,
            chunking_context: resolved_chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for WebAssemblyAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let ident = self.source.ident().with_modifier(modifier());

        let asset_path = self.chunking_context.chunk_path(ident, ".wasm".into());

        Ok(AssetIdent::from_path(asset_path))
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebAssemblyAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
