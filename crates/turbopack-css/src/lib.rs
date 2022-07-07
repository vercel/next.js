#![feature(min_specialization)]

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
};

pub(crate) mod parse;
pub(crate) mod references;

use references::module_references;

#[turbo_tasks::value(Asset, ValueToString)]
#[derive(Clone)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
        Self::cell(ModuleAsset { source, context })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(module_references(self.source, self.context))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleAsset {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "css {}",
            self.source.path().to_string().await?
        )))
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
