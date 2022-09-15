use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    reference::AssetReferencesVc,
};

#[turbo_tasks::value]
pub struct JsonModuleAsset {
    pub source: AssetVc,
}

#[turbo_tasks::value_impl]
impl JsonModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc) -> Self {
        Self::cell(JsonModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for JsonModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}
