use anyhow::Result;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::AssetContent,
    version::{Update, Version, VersionedContent},
};

use super::{
    chunk::EcmascriptBuildNodeEntryChunk, update::update_ecmascript_node_entry_chunk,
    version::EcmascriptBuildNodeEntryChunkVersion,
};
use crate::{
    NodeJsChunkingContext,
    ecmascript::node::{chunk::EcmascriptBuildNodeChunk, content::EcmascriptBuildNodeChunkContent},
};

/// Content wrapper for entry chunks that enables HMR updates.
/// Tracks the versions of all child chunks to compute incremental updates.
#[turbo_tasks::value]
pub(crate) struct EcmascriptBuildNodeEntryChunkContent {
    pub(crate) entry_chunk: ResolvedVc<EcmascriptBuildNodeEntryChunk>,
    pub(crate) chunking_context: ResolvedVc<NodeJsChunkingContext>,
    /// The child chunk contents that contain the actual module code
    pub(crate) chunk_contents: Vec<ResolvedVc<EcmascriptBuildNodeChunkContent>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeEntryChunkContent {
    #[turbo_tasks::function]
    pub(crate) async fn new(
        entry_chunk: Vc<EcmascriptBuildNodeEntryChunk>,
        chunking_context: Vc<NodeJsChunkingContext>,
    ) -> Result<Vc<Self>> {
        // Get the other_chunks via the getter method
        let other_chunks = entry_chunk.other_chunks().await?;
        let chunk_contents: Vec<ResolvedVc<EcmascriptBuildNodeChunkContent>> = other_chunks
            .iter()
            .filter_map(|chunk| ResolvedVc::try_downcast_type::<EcmascriptBuildNodeChunk>(*chunk))
            .map(|chunk: ResolvedVc<EcmascriptBuildNodeChunk>| async move {
                // Use own_content() to get the content
                let content = chunk.own_content().to_resolved().await?;
                Ok(content)
            })
            .try_join()
            .await?;

        Ok(EcmascriptBuildNodeEntryChunkContent {
            entry_chunk: entry_chunk.to_resolved().await?,
            chunking_context: chunking_context.to_resolved().await?,
            chunk_contents,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub(crate) async fn own_version(&self) -> Result<Vc<EcmascriptBuildNodeEntryChunkVersion>> {
        Ok(EcmascriptBuildNodeEntryChunkVersion {
            chunk_versions: self
                .chunk_contents
                .iter()
                .map(|content| async move { content.own_version().await })
                .try_join()
                .await?,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for EcmascriptBuildNodeEntryChunkContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        // The entry chunk's actual content comes from the entry chunk itself
        Ok(AssetContent::file(
            FileContent::Content(File::from(
                this.entry_chunk.code().await?.source_code().clone(),
            ))
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.own_version())
    }

    #[turbo_tasks::function]
    fn update(self: Vc<Self>, from_version: Vc<Box<dyn Version>>) -> Vc<Update> {
        update_ecmascript_node_entry_chunk(self, from_version)
    }
}
