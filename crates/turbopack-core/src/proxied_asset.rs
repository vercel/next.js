use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
    version::VersionedContentVc,
};

/// An [`Asset`] with an overwritten path. This is helpful to expose an asset at
/// a different path than it was originally set up to be, e.g. to expose layout
/// CSS chunks under the server FS instead of the output FS when rendering
/// Next.js apps.
#[turbo_tasks::value]
pub struct ProxiedAsset {
    asset: AssetVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ProxiedAssetVc {
    /// Creates a new [`ProxiedAsset`] from an [`Asset`] and a path.
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc, path: FileSystemPathVc) -> Self {
        ProxiedAsset { asset, path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for ProxiedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        AssetIdentVc::from_path(self.path)
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.asset.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.asset.references()
    }

    #[turbo_tasks::function]
    fn versioned_content(&self) -> VersionedContentVc {
        self.asset.versioned_content()
    }
}
