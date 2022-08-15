use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::AssetReferencesVc,
};

/// An [Asset] that replaces the content of an asset and allows to reference the
/// original one.
///
/// It's path will be [wrapper_name] below the original path.
#[turbo_tasks::value]
pub struct WrapperAsset {
    pub asset: AssetVc,
    pub wrapper_name: String,
    /// content can reference the underlying asset with `.`
    pub content: FileContentVc,
}

#[turbo_tasks::value_impl]
impl WrapperAssetVc {
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc, wrapper_name: &str, content: FileContentVc) -> Self {
        Self::cell(WrapperAsset {
            asset,
            wrapper_name: wrapper_name.to_string(),
            content,
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for WrapperAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.asset.path().join(&self.wrapper_name)
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.content
    }
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}
