use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{IntoTraitRef, TryJoinIterExt};
use turbo_tasks_fs::{FileContent, FileSystemPathReadRef, FileSystemPathVc};

use super::{
    update::update_chunk_list,
    version::{ChunkListVersion, ChunkListVersionVc},
};
use crate::{
    asset::{Asset, AssetContent, AssetContentVc},
    chunk::ChunksVc,
    version::{
        MergeableVersionedContent, MergeableVersionedContentVc, UpdateVc, VersionVc,
        VersionedContent, VersionedContentMerger, VersionedContentVc, VersionedContentsVc,
    },
};

/// Contents of a [`super::asset::ChunkListAsset`].
#[turbo_tasks::value]
pub(super) struct ChunkListContent {
    pub server_root: FileSystemPathReadRef,
    pub chunks_contents: IndexMap<String, VersionedContentVc>,
}

#[turbo_tasks::value_impl]
impl ChunkListContentVc {
    /// Creates a new [`ChunkListContent`].
    #[turbo_tasks::function]
    pub async fn new(server_root: FileSystemPathVc, chunks: ChunksVc) -> Result<Self> {
        let server_root = server_root.await?;
        Ok(ChunkListContent {
            server_root: server_root.clone(),
            chunks_contents: chunks
                .await?
                .iter()
                .map(|chunk| {
                    let server_root = server_root.clone();
                    async move {
                        Ok((
                            server_root
                                .get_path_to(&*chunk.ident().path().await?)
                                .map(|path| path.to_string()),
                            chunk.versioned_content(),
                        ))
                    }
                })
                .try_join()
                .await?
                .into_iter()
                .filter_map(|(path, content)| path.map(|path| (path, content)))
                .collect(),
        }
        .cell())
    }

    /// Computes the version of this content.
    #[turbo_tasks::function]
    pub async fn version(self) -> Result<ChunkListVersionVc> {
        let this = self.await?;

        let mut by_merger = IndexMap::<_, Vec<_>>::new();
        let mut by_path = IndexMap::<_, _>::new();

        for (chunk_path, chunk_content) in &this.chunks_contents {
            if let Some(mergeable) =
                MergeableVersionedContentVc::resolve_from(chunk_content).await?
            {
                let merger = mergeable.get_merger().resolve().await?;
                by_merger.entry(merger).or_default().push(*chunk_content);
            } else {
                by_path.insert(
                    chunk_path.clone(),
                    chunk_content.version().into_trait_ref().await?,
                );
            }
        }

        let by_merger = by_merger
            .into_iter()
            .map(|(merger, contents)| {
                let merger = merger;
                async move {
                    Ok((
                        merger,
                        merger
                            .merge(VersionedContentsVc::cell(contents))
                            .version()
                            .into_trait_ref()
                            .await?,
                    ))
                }
            })
            .try_join()
            .await?
            .into_iter()
            .collect();

        Ok(ChunkListVersion { by_path, by_merger }.cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for ChunkListContent {
    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        AssetContentVc::cell(AssetContent::File(FileContent::NotFound.into()))
    }

    #[turbo_tasks::function]
    fn version(self_vc: ChunkListContentVc) -> VersionVc {
        self_vc.version().into()
    }

    #[turbo_tasks::function]
    fn update(self_vc: ChunkListContentVc, from_version: VersionVc) -> UpdateVc {
        update_chunk_list(self_vc, from_version)
    }
}
