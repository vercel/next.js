use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    ident::AssetIdent,
    output::OutputAsset,
    source::Source,
};

use crate::source::WebAssemblySource;

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("wasm".to_string())
}

/// Emits the [WebAssemblySource] at a chunk path determined by the
/// [ChunkingContext].
#[turbo_tasks::value]
pub(crate) struct WebAssemblyAsset {
    source: Vc<WebAssemblySource>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl WebAssemblyAsset {
    #[turbo_tasks::function]
    pub(crate) fn new(
        source: Vc<WebAssemblySource>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Self> {
        Self::cell(WebAssemblyAsset {
            source,
            chunking_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for WebAssemblyAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let ident = self.source.ident().with_modifier(modifier());

        let asset_path = self.chunking_context.chunk_path(ident, ".wasm".to_string());

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
