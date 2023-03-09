use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use super::content::ChunkListContentVc;
use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc, ChunksVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
    version::{VersionedContent, VersionedContentVc},
};

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
    server_root: FileSystemPathVc,
    chunk_group: ChunkGroupVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ChunkListAssetVc {
    /// Creates a new [`ChunkListAsset`].
    #[turbo_tasks::function]
    pub fn new(
        server_root: FileSystemPathVc,
        chunk_group: ChunkGroupVc,
        path: FileSystemPathVc,
    ) -> Self {
        ChunkListAsset {
            server_root,
            chunk_group,
            path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn get_chunks(self) -> Result<ChunksVc> {
        Ok(self.await?.chunk_group.chunks())
    }

    #[turbo_tasks::function]
    async fn content(self) -> Result<ChunkListContentVc> {
        let this = &*self.await?;
        Ok(ChunkListContentVc::new(
            this.server_root,
            this.chunk_group.chunks(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ChunkListAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        AssetIdentVc::from_path(self.path)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.chunk_group.chunks().await?;

        let mut references = Vec::with_capacity(chunks.len());
        for chunk in chunks.iter() {
            references.push(ChunkReferenceVc::new(*chunk).into());
        }

        Ok(AssetReferencesVc::cell(references))
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
