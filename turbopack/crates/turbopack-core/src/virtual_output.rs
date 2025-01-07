use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets},
};

/// An [OutputAsset] that is created from some passed source code and can have a list of references
/// to other assets.
#[turbo_tasks::value]
pub struct VirtualOutputAsset {
    pub path: ResolvedVc<FileSystemPath>,
    pub content: ResolvedVc<AssetContent>,
    pub references: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::value_impl]
impl VirtualOutputAsset {
    #[turbo_tasks::function]
    pub fn new(path: ResolvedVc<FileSystemPath>, content: ResolvedVc<AssetContent>) -> Vc<Self> {
        VirtualOutputAsset {
            path,
            content,
            references: OutputAssets::empty_resolved(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_with_references(
        path: ResolvedVc<FileSystemPath>,
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
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(*self.path)
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
