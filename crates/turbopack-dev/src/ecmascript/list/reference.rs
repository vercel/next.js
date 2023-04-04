use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::{Asset, AssetsVc},
    chunk::{
        ChunkVc, ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingType,
        ChunkingTypeOptionVc,
    },
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

use super::asset::ChunkListAssetVc;
use crate::DevChunkingContextVc;

/// A reference to a [`ChunkListAsset`].
///
/// This is the only way to create a [`ChunkListAsset`]. The asset itself will
/// live under the provided path.
///
/// [`ChunkListAsset`]: super::asset::ChunkListAsset
#[turbo_tasks::value]
pub struct ChunkListReference {
    chunking_context: DevChunkingContextVc,
    entry_chunk: ChunkVc,
    other_chunks: AssetsVc,
}

#[turbo_tasks::value_impl]
impl ChunkListReferenceVc {
    /// Creates a new [`ChunkListReference`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: DevChunkingContextVc,
        entry_chunk: ChunkVc,
        other_chunks: AssetsVc,
    ) -> Self {
        ChunkListReference {
            chunking_context,
            entry_chunk,
            other_chunks,
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
            self.chunking_context
                .chunk_list_path(self.entry_chunk.ident())
                .to_string()
                .await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ChunkListReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(
            ChunkListAssetVc::new(self.chunking_context, self.entry_chunk, self.other_chunks)
                .into(),
        )
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for ChunkListReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Separate))
    }
}
