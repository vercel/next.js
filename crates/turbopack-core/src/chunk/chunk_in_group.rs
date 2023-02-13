use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;

use super::{Chunk, ChunkVc, ParallelChunkReferenceVc};
use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::ParallelChunkReference,
    introspect::{
        asset::{children_from_asset_references, content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::AssetReferencesVc,
    version::VersionedContentVc,
};

/// A chunk that is part of a [ChunkGroup]. In contrast to the inner chunk it
/// will not have references of parallel chunk since these are already handled
/// on [ChunkGroup] level.
#[turbo_tasks::value]
pub struct ChunkInGroup {
    inner: ChunkVc,
}

#[turbo_tasks::value_impl]
impl ChunkInGroupVc {
    #[turbo_tasks::function]
    pub fn new(inner: ChunkVc) -> Self {
        ChunkInGroup { inner }.cell()
    }

    /// Returns the inner chunk of this chunk in group.
    #[turbo_tasks::function]
    pub async fn inner(self) -> Result<ChunkVc> {
        Ok(self.await?.inner)
    }
}

#[turbo_tasks::value_impl]
impl Chunk for ChunkInGroup {}

#[turbo_tasks::value_impl]
impl Asset for ChunkInGroup {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.inner.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.inner.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let refs = &*self.inner.references().await?;
        let mut references = Vec::new();
        for reference in refs {
            if let Some(parallel_ref) = ParallelChunkReferenceVc::resolve_from(*reference).await? {
                if *parallel_ref.is_loaded_in_parallel().await? {
                    continue;
                }
            }
            references.push(*reference);
        }
        Ok(AssetReferencesVc::cell(references))
    }

    #[turbo_tasks::function]
    fn versioned_content(&self) -> VersionedContentVc {
        self.inner.versioned_content()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ChunkInGroup {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        self.inner.to_string()
    }
}

#[turbo_tasks::function]
fn inner_chunk_key() -> StringVc {
    StringVc::cell("inner chunk".to_string())
}

#[turbo_tasks::function]
fn base_ty() -> StringVc {
    StringVc::cell("chunk in group".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for ChunkInGroup {
    #[turbo_tasks::function]
    async fn ty(&self) -> Result<StringVc> {
        Ok(
            if let Some(chunk) = IntrospectableVc::resolve_from(self.inner).await? {
                let ty = chunk.ty().await?;
                StringVc::cell(format!("{ty} (in group)"))
            } else {
                base_ty()
            },
        )
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(
            if let Some(chunk) = IntrospectableVc::resolve_from(self.inner).await? {
                chunk.title()
            } else {
                self.inner.path().to_string()
            },
        )
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<StringVc> {
        Ok(
            if let Some(chunk) = IntrospectableVc::resolve_from(self.inner).await? {
                chunk.details()
            } else {
                content_to_details(self.inner.content())
            },
        )
    }

    #[turbo_tasks::function]
    async fn children(self_vc: ChunkInGroupVc) -> Result<IntrospectableChildrenVc> {
        let mut children = children_from_asset_references(self_vc.references())
            .await?
            .clone_value();
        children.insert((
            inner_chunk_key(),
            IntrospectableAssetVc::new(self_vc.await?.inner.into()),
        ));
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
