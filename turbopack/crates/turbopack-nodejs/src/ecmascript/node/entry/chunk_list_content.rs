use anyhow::{Result, bail};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReferences,
        expand_output_assets,
    },
    version::{Update, Version, VersionedContent},
};
use turbopack_ecmascript::{chunk_list, chunk_list::version::ChunkListVersion};

use crate::NodeJsChunkingContext;

/// Never emitted as an asset — the entry chunk already inlines the `R.c(...)`
/// calls for its shared chunks. This exists purely to give the entry a
/// *stable* [`VersionedContent`] identity keyed off a chunk-list ident, so
/// adding/removing/renaming a shared chunk doesn't force a `TotalUpdate`.
///
/// Tracks both synchronous chunks and chunks reachable via async-loader
/// references (dynamic `import()`), so an edit inside a lazy-loaded module
/// still rides the merged `ChunkListUpdate` instead of being missed.
#[turbo_tasks::value]
pub(crate) struct EcmascriptBuildNodeChunkListContent {
    #[bincode(with = "turbo_bincode::indexmap")]
    pub(super) chunks_contents: FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkListContent {
    #[turbo_tasks::function]
    pub async fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunks: ResolvedVc<OutputAssets>,
        references: ResolvedVc<OutputAssetsReferences>,
    ) -> Result<Vc<Self>> {
        let output_root = chunking_context.output_root().owned().await?;

        // Expand async-loader references transitively to reach dynamically
        // imported chunks. `inner=false`: only follow Reference edges (async
        // loaders), not Asset-adjacent files like source maps that aren't part
        // of the module graph and can't be hot-reloaded.
        let async_chunks = expand_output_assets(
            references
                .await?
                .iter()
                .copied()
                .map(ExpandOutputAssetsInput::Reference),
            false,
        )
        .await?;

        let chunks_contents = chunks
            .await?
            .iter()
            .copied()
            .chain(async_chunks)
            .map(async |chunk| {
                Ok((
                    output_root
                        .get_path_to(&*chunk.path().await?)
                        .map(|path| path.to_string()),
                    chunk.versioned_content().to_resolved().await?,
                ))
            })
            .try_join()
            .await?
            .into_iter()
            .filter_map(|(path, content)| path.map(|path| (path, content)))
            .collect();

        Ok(EcmascriptBuildNodeChunkListContent { chunks_contents }.cell())
    }

    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<ChunkListVersion>> {
        chunk_list::version::compute_chunk_list_version(&self.chunks_contents).await
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeChunkListContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        bail!("EcmascriptBuildNodeChunkListContent does not have content")
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.version())
    }

    #[turbo_tasks::function]
    async fn update(
        self: ResolvedVc<Self>,
        from_version: ResolvedVc<Box<dyn Version>>,
    ) -> Result<Vc<Update>> {
        let this = self.await?;
        let to_version = self.version();
        chunk_list::update::update_chunk_list(&this.chunks_contents, to_version, from_version).await
    }
}
