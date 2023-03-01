use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
};

/// An [Asset] that is created from some passed source code.
#[turbo_tasks::value]
pub struct VirtualAsset {
    pub ident: AssetIdentVc,
    pub content: AssetContentVc,
}

#[turbo_tasks::value_impl]
impl VirtualAssetVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc, content: AssetContentVc) -> Self {
        Self::cell(VirtualAsset {
            ident: AssetIdentVc::from_path(path),
            content,
        })
    }

    #[turbo_tasks::function]
    pub fn new_with_ident(ident: AssetIdentVc, content: AssetContentVc) -> Self {
        Self::cell(VirtualAsset { ident, content })
    }
}

#[turbo_tasks::value_impl]
impl Asset for VirtualAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.ident
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.content
    }
}
