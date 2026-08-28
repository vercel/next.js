use anyhow::{Result, bail};
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    output::{
        ExpandOutputAssetsInput, OutputAsset, OutputAssets, OutputAssetsReferences,
        expand_output_assets,
    },
    version::{Update, Version, VersionedContent},
};
use turbopack_ecmascript::chunk_list::{
    update::update_chunk_list,
    version::{ChunkListVersion, compute_chunk_list_version},
};

use crate::NodeJsChunkingContext;

/// Maps each chunk to its `output_root`-relative path and versioned content.
async fn collect_chunks_contents(
    output_root: &FileSystemPath,
    chunks: impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>> {
    chunks
        .map(async |chunk| {
            let chunk_path = chunk.path().await?;
            let Some(path) = output_root.get_path_to(&chunk_path) else {
                bail!("chunk {chunk_path} is not inside the output root {output_root}");
            };
            Ok((
                path.to_string(),
                chunk.versioned_content().to_resolved().await?,
            ))
        })
        .try_join()
        .await
        .map(FxIndexMap::from_iter)
}

/// Never emitted as an asset — the entry chunk already inlines the `R.c(...)`
/// calls for its shared chunks. This exists purely to give the entry a
/// *stable* [`VersionedContent`] identity keyed off a chunk-list ident, so
/// adding/removing/renaming a shared chunk doesn't force a `TotalUpdate`.
///
/// Tracks both synchronous chunks and chunks reachable via async-loader
/// references (dynamic `import()`), so an edit inside a lazy-loaded module
/// still rides the merged `ChunkListUpdate` instead of being missed.
#[turbo_tasks::value]
pub struct EcmascriptBuildNodeChunkListContent {
    #[bincode(with = "turbo_bincode::indexmap")]
    pub(super) chunks_contents: FxIndexMap<String, ResolvedVc<Box<dyn VersionedContent>>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeChunkListContent {
    #[turbo_tasks::function]
    pub async fn new(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunks: ResolvedVc<OutputAssets>,
        referenced_assets: ResolvedVc<OutputAssets>,
        references: ResolvedVc<OutputAssetsReferences>,
    ) -> Result<Vc<Self>> {
        let output_root = chunking_context.output_root().owned().await?;

        // Expand async-loader references transitively to reach dynamically
        // imported chunks. `inner=false`: only follow Reference edges (async
        // loaders), not Asset-adjacent files like source maps that aren't part
        // of the module graph and can't be hot-reloaded.
        //
        // `referenced_assets` covers async chunks that were already expanded by
        // the caller (e.g. chunks reachable from concatenated chunk groups).
        // They must be tracked here too, otherwise an edit inside one of them
        // produces no chunk list update at all.
        let async_chunks = expand_output_assets(
            referenced_assets
                .await?
                .iter()
                .copied()
                .map(ExpandOutputAssetsInput::Asset)
                .chain(
                    references
                        .await?
                        .iter()
                        .copied()
                        .map(ExpandOutputAssetsInput::Reference),
                ),
            false,
        )
        .await?;

        let chunks_contents = collect_chunks_contents(
            &output_root,
            chunks.await?.iter().copied().chain(async_chunks),
        )
        .await?;

        Ok(EcmascriptBuildNodeChunkListContent { chunks_contents }.cell())
    }

    /// Builds a chunk list content directly from a fixed set of `chunks`,
    /// without expanding async-loader references. Used by
    /// `super::chunk_list::EcmascriptBuildNodeChunkList` to track chunks
    /// (e.g. client-component SSR chunks) that are already fully enumerated by
    /// the caller.
    #[turbo_tasks::function]
    pub async fn new_from_chunks(
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
        chunks: Vc<OutputAssets>,
    ) -> Result<Vc<Self>> {
        let output_root = chunking_context.output_root().owned().await?;
        let chunks_contents =
            collect_chunks_contents(&output_root, chunks.await?.iter().copied()).await?;

        Ok(EcmascriptBuildNodeChunkListContent { chunks_contents }.cell())
    }

    #[turbo_tasks::function]
    pub async fn version(&self) -> Result<Vc<ChunkListVersion>> {
        compute_chunk_list_version(&self.chunks_contents).await
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
        update_chunk_list(&this.chunks_contents, to_version, from_version).await
    }
}
