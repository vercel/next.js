use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
    version::VersionedContent,
};

/// An [`Asset`] with an overwritten path.
///
/// This is helpful to expose an asset at a different path than it was originally set up to be, e.g.
/// to expose layout CSS chunks under the server FS instead of the output FS when rendering
/// Next.js apps.
#[turbo_tasks::value]
pub struct ProxiedAsset {
    asset: ResolvedVc<Box<dyn OutputAsset>>,
    path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl ProxiedAsset {
    /// Creates a new [`ProxiedAsset`] from an [`Asset`] and a path.
    #[turbo_tasks::function]
    pub fn new(
        asset: ResolvedVc<Box<dyn OutputAsset>>,
        path: ResolvedVc<FileSystemPath>,
    ) -> Vc<Self> {
        ProxiedAsset { asset, path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for ProxiedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<OutputAssets> {
        self.asset.references()
    }
}

#[turbo_tasks::value_impl]
impl Asset for ProxiedAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.asset.content()
    }

    #[turbo_tasks::function]
    fn versioned_content(&self) -> Vc<Box<dyn VersionedContent>> {
        self.asset.versioned_content()
    }
}
