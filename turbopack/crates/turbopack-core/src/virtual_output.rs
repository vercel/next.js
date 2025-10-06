use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
};

/// An [OutputAsset] that is created from some passed source code and can have a list of references
/// to other assets.
#[turbo_tasks::value]
pub struct VirtualOutputAsset {
    pub path: FileSystemPath,
    pub content: ResolvedVc<AssetContent>,
    pub references: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::value_impl]
impl VirtualOutputAsset {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPath, content: ResolvedVc<AssetContent>) -> Vc<Self> {
        VirtualOutputAsset {
            path,
            content,
            references: OutputAssets::empty_resolved(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_with_references(
        path: FileSystemPath,
        content: ResolvedVc<AssetContent>,
        references: ResolvedVc<OutputAssets>,
    ) -> Vc<Self> {
        VirtualOutputAsset {
            path,
            content,
            references,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for VirtualOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssets> {
        *self.references
    }
}

#[turbo_tasks::value_impl]
impl Asset for VirtualOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        *self.content
    }
}
