use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
    chunk::{ChunkVc, ChunkingContext},
    ident::AssetIdentVc,
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
    version::{VersionedContent, VersionedContentVc},
};

use super::content::ChunkListContentVc;
use crate::DevChunkingContextVc;

/// An asset that represents a list of chunks that exist together in a chunk
/// group, and should be *updated* together.
///
/// A chunk list has no actual content: all it does is merge updates from its
/// chunks into a single update when possible. This is useful for keeping track
/// of changes that affect more than one chunk, or affect the chunk group, e.g.:
/// * moving a module from one chunk to another;
/// * changing a chunk's path.
#[turbo_tasks::value(shared)]
pub(super) struct ChunkListAsset {
    chunking_context: DevChunkingContextVc,
    entry_chunk: ChunkVc,
    other_chunks: AssetsVc,
}

#[turbo_tasks::value_impl]
impl ChunkListAssetVc {
    /// Creates a new [`ChunkListAsset`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        other_chunks: AssetsVc,
    ) -> Self {
        ChunkListAsset {
            chunking_context,
            entry_chunk,
            other_chunks,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn content(self) -> Result<ChunkListContentVc> {
        let this = &*self.await?;
        Ok(ChunkListContentVc::new(
            this.chunking_context.output_root(),
            this.other_chunks,
        ))
    }
}

#[turbo_tasks::function]
fn chunk_list_chunk_reference_description() -> StringVc {
    StringVc::cell("chunk list chunk".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for ChunkListAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        Ok(AssetIdentVc::from_path(
            self.chunking_context
                .chunk_list_path(self.entry_chunk.ident()),
        ))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(
            self.other_chunks
                .await?
                .iter()
                .map(|chunk| {
                    SingleAssetReferenceVc::new(*chunk, chunk_list_chunk_reference_description())
                        .into()
                })
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    fn content(self_vc: ChunkListAssetVc) -> AssetContentVc {
        self_vc.content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self_vc: ChunkListAssetVc) -> VersionedContentVc {
        self_vc.content().into()
    }
}
