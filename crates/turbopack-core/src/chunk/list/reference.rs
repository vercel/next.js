use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;

use super::asset::ChunkListAssetVc;
use crate::{
    chunk::{
        ChunkGroupVc, ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingContextVc,
        ChunkingType, ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// A reference to a [`ChunkListAsset`].
///
/// This is the only way to create a [`ChunkListAsset`]. The asset itself will
/// live under the provided path.
///
/// [`ChunkListAsset`]: super::asset::ChunkListAsset
#[turbo_tasks::value]
pub struct ChunkListReference {
    server_root: FileSystemPathVc,
    chunk_group: ChunkGroupVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ChunkListReferenceVc {
    /// Creates a new [`ChunkListReference`].
    #[turbo_tasks::function]
    pub fn new(
        server_root: FileSystemPathVc,
        chunk_group: ChunkGroupVc,
        path: FileSystemPathVc,
    ) -> Self {
        ChunkListReference {
            server_root,
            chunk_group,
            path,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkListReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "referenced chunk list {}",
            self.path.to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkListReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(
            ChunkListAssetVc::new(self.server_root, self.chunk_group, self.path).into(),
        )
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for ChunkListReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate))
    }
}
