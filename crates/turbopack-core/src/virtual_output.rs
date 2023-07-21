use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    output::OutputAsset,
};

/// An [OutputAsset] that is created from some passed source code.
#[turbo_tasks::value]
pub struct VirtualOutputAsset {
    pub path: Vc<FileSystemPath>,
    pub content: Vc<AssetContent>,
}

#[turbo_tasks::value_impl]
impl VirtualOutputAsset {
    #[turbo_tasks::function]
    pub fn new(path: Vc<FileSystemPath>, content: Vc<AssetContent>) -> Vc<Self> {
        VirtualOutputAsset { path, content }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for VirtualOutputAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(self.path)
    }
}

#[turbo_tasks::value_impl]
impl Asset for VirtualOutputAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.content
    }
}
