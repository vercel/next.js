use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    ident::AssetIdentVc,
    output::{OutputAsset, OutputAssetVc},
    source::SourceVc,
};

/// A static asset that is served at a fixed output path. It won't use
/// content hashing to generate a long term cacheable URL.
#[turbo_tasks::value]
pub struct FixedStaticAsset {
    output_path: FileSystemPathVc,
    source: SourceVc,
}

#[turbo_tasks::value_impl]
impl FixedStaticAssetVc {
    #[turbo_tasks::function]
    pub fn new(output_path: FileSystemPathVc, source: SourceVc) -> Self {
        FixedStaticAsset {
            output_path,
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for FixedStaticAsset {}

#[turbo_tasks::value_impl]
impl Asset for FixedStaticAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        Ok(AssetIdentVc::from_path(self.output_path))
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }
}
