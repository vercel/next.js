use anyhow::Result;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    reference::AssetReferencesVc,
    version::{VersionedContentVc, VersionedFileContentVc},
};

/// A list of [Asset]s
#[turbo_tasks::value(shared, transparent)]
#[derive(Hash)]
pub struct Assets(Vec<AssetVc>);

#[turbo_tasks::value_impl]
impl AssetsVc {
    /// Creates an empty list of [Asset]s
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Assets(Vec::new()).into()
    }
}

/// An asset. It also forms a graph when following [Asset::references].
#[turbo_tasks::value_trait]
pub trait Asset {
    /// The path of the [Asset]. It can potentially be a virtual path.
    /// It's not expected to be something you can read to or write from in
    /// general, only some [Asset] types have these property. It's more like
    /// a name/identifier of the [Asset].
    fn path(&self) -> FileSystemPathVc;

    /// The content of the [Asset].
    fn content(&self) -> FileContentVc;

    /// Other things (most likely [Asset]s) referenced from this [Asset].
    fn references(&self) -> AssetReferencesVc;

    /// The content of the [Asset] alongside its version.
    async fn versioned_content(&self) -> Result<VersionedContentVc> {
        Ok(VersionedFileContentVc::new(self.content()).await?.into())
    }
}

/// An optional [Asset]
#[turbo_tasks::value(shared, transparent)]
pub struct AssetOption(Option<AssetVc>);
