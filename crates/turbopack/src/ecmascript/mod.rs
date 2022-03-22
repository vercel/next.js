mod parse;
mod pattern;
mod references;
mod resolve;
pub mod utils;
pub mod webpack;

use crate::{
    asset::{Asset, AssetRef},
    reference::AssetReferencesSetRef,
};
use anyhow::Result;
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

use self::references::module_references;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct ModuleAsset {
    pub source: AssetRef,
}

#[turbo_tasks::value_impl]
impl ModuleAssetRef {
    pub fn new(source: AssetRef) -> Self {
        Self::slot(ModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    fn path(&self) -> FileSystemPathRef {
        self.source.clone().path()
    }
    fn content(&self) -> FileContentRef {
        self.source.clone().content()
    }
    async fn references(&self) -> AssetReferencesSetRef {
        module_references(self.source.clone())
    }
}
