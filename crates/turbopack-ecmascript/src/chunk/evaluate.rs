use anyhow::Result;
use turbopack_core::{
    asset::Asset,
    chunk::{
        chunk_in_group::ChunkInGroupVc, ChunkGroupVc, ChunkingContext, ChunkingContextVc,
        ModuleIdVc,
    },
};

use super::{
    item::EcmascriptChunkItem,
    placeable::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceablesVc},
    EcmascriptChunkVc,
};

/// Whether the ES chunk should include and evaluate a runtime.
#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkEvaluate {
    /// Entries that will be executed in that order only all chunks are ready.
    /// These entries must be included in `main_entries` so that they are
    /// available.
    pub evaluate_entries: EcmascriptChunkPlaceablesVc,
    /// All chunks of this chunk group need to be ready for execution to start.
    /// When None, it will use a chunk group created from the current chunk.
    pub chunk_group: Option<ChunkGroupVc>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkEvaluateVc {
    #[turbo_tasks::function]
    pub(super) async fn content(
        self,
        context: ChunkingContextVc,
        origin_chunk: EcmascriptChunkVc,
    ) -> Result<EcmascriptChunkContentEvaluateVc> {
        let &EcmascriptChunkEvaluate {
            evaluate_entries,
            chunk_group,
        } = &*self.await?;
        let chunk_group =
            chunk_group.unwrap_or_else(|| ChunkGroupVc::from_chunk(origin_chunk.into()));
        let evaluate_chunks = chunk_group.chunks().await?;
        let mut ecma_chunks_server_paths = Vec::new();
        let mut other_chunks_server_paths = Vec::new();
        let output_root = context.output_root().await?;
        for chunk in evaluate_chunks.iter() {
            if let Some(chunk_in_group) = ChunkInGroupVc::resolve_from(chunk).await? {
                let chunks_server_paths = if let Some(ecma_chunk) =
                    EcmascriptChunkVc::resolve_from(chunk_in_group.inner()).await?
                {
                    if ecma_chunk == origin_chunk {
                        continue;
                    }
                    &mut ecma_chunks_server_paths
                } else {
                    &mut other_chunks_server_paths
                };
                let chunk_path = &*chunk.path().await?;
                if let Some(chunk_server_path) = output_root.get_path_to(chunk_path) {
                    chunks_server_paths.push(chunk_server_path.to_string());
                }
            }
        }
        let entry_modules_ids = evaluate_entries
            .await?
            .iter()
            .map(|entry| entry.as_chunk_item(context).id())
            .collect();
        Ok(EcmascriptChunkContentEvaluate {
            ecma_chunks_server_paths,
            other_chunks_server_paths,
            entry_modules_ids,
        }
        .cell())
    }
}

#[turbo_tasks::value]
pub(super) struct EcmascriptChunkContentEvaluate {
    pub ecma_chunks_server_paths: Vec<String>,
    pub other_chunks_server_paths: Vec<String>,
    pub entry_modules_ids: Vec<ModuleIdVc>,
}
