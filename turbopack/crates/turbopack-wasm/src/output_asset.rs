use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
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
    pub(crate) fn new(
        source: ResolvedVc<WebAssemblySource>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
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
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = this.source.ident().with_modifier(modifier());
        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, ".wasm".into()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebAssemblyAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}
