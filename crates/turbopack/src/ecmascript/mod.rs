mod parse;
mod references;
mod resolve;
pub mod utils;
pub mod webpack;

use crate::{
    asset::{Asset, AssetVc},
    reference::AssetReferencesSetVc,
};
use anyhow::Result;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use self::references::module_references;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct ModuleAsset {
    pub source: AssetVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    pub fn new(source: AssetVc) -> Self {
        Self::slot(ModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    fn path(&self) -> FileSystemPathVc {
        self.source.clone().path()
    }
    fn content(&self) -> FileContentVc {
        self.source.clone().content()
    }
    async fn references(&self) -> AssetReferencesSetVc {
        module_references(self.source.clone())
    }
}
