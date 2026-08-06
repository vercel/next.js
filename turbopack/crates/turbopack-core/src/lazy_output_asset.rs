use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};

use crate::{
    asset::{Asset, AssetContent},
    chunk::{OutputChunk, OutputChunkRuntimeInfo},
    module_graph::AsyncGraphMaterialization,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::GenerateSourceMap,
    version::VersionedContent,
};

/// An [`OutputAsset`] whose references are not traversed until it is materialized.
#[turbo_tasks::value]
pub struct LazyOutputAsset {
    inner: ResolvedVc<Box<dyn OutputAsset>>,
    materialization: ResolvedVc<AsyncGraphMaterialization>,
}

#[turbo_tasks::value_impl]
impl LazyOutputAsset {
    #[turbo_tasks::function]
    pub fn new(
        inner: ResolvedVc<Box<dyn OutputAsset>>,
        materialization: ResolvedVc<AsyncGraphMaterialization>,
    ) -> Vc<Self> {
        LazyOutputAsset {
            inner,
            materialization,
        }
        .cell()
    }
}

impl LazyOutputAsset {
    pub fn is_lazy(asset: ResolvedVc<Box<dyn OutputAsset>>) -> bool {
        ResolvedVc::try_downcast_type::<LazyOutputAsset>(asset).is_some()
    }

    pub async fn materialize(asset: ResolvedVc<LazyOutputAsset>) -> Result<()> {
        asset.await?.materialization.await?.materialize();
        Ok(())
    }
}

#[turbo_tasks::value_impl]
impl Asset for LazyOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.inner.content()
    }

    #[turbo_tasks::function]
    fn versioned_content(&self) -> Vc<Box<dyn VersionedContent>> {
        self.inner.versioned_content()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for LazyOutputAsset {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssetsWithReferenced> {
        self.inner.references().concatenate_asset(*self.inner)
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for LazyOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.inner.path()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for LazyOutputAsset {
    #[turbo_tasks::function]
    fn generate_source_map(&self) -> Vc<FileContent> {
        match ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.inner) {
            Some(inner) => inner.generate_source_map(),
            None => FileContent::NotFound.cell(),
        }
    }

    #[turbo_tasks::function]
    fn by_section(&self, section: RcStr) -> Vc<FileContent> {
        match ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(self.inner) {
            Some(inner) => inner.by_section(section),
            None => FileContent::NotFound.cell(),
        }
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for LazyOutputAsset {
    #[turbo_tasks::function]
    fn runtime_info(&self) -> Vc<OutputChunkRuntimeInfo> {
        match ResolvedVc::try_sidecast::<Box<dyn OutputChunk>>(self.inner) {
            Some(inner) => inner.runtime_info(),
            None => OutputChunkRuntimeInfo::empty(),
        }
    }
}
