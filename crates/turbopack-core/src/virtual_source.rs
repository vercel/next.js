use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
    source::{Source, SourceVc},
};

/// An [Asset] that is created from some passed source code.
#[turbo_tasks::value]
pub struct VirtualSource {
    pub ident: AssetIdentVc,
    pub content: AssetContentVc,
}

#[turbo_tasks::value_impl]
impl VirtualSourceVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc, content: AssetContentVc) -> Self {
        Self::cell(VirtualSource {
            ident: AssetIdentVc::from_path(path),
            content,
        })
    }

    #[turbo_tasks::function]
    pub fn new_with_ident(ident: AssetIdentVc, content: AssetContentVc) -> Self {
        Self::cell(VirtualSource { ident, content })
    }
}

#[turbo_tasks::value_impl]
impl Source for VirtualSource {}

#[turbo_tasks::value_impl]
impl Asset for VirtualSource {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.ident
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.content
    }
}
