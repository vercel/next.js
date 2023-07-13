use anyhow::{Context, Result};

use crate::asset::{Asset, AssetVc};

/// An asset that should be outputted, e. g. written to disk or served from a
/// server.
#[turbo_tasks::value_trait]
pub trait OutputAsset: Asset {}

#[turbo_tasks::value(transparent)]
pub struct OutputAssets(Vec<OutputAssetVc>);

#[turbo_tasks::value_impl]
impl OutputAssetsVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Self::cell(Vec::new())
    }
}

/// This is a temporary function that should be removed once the [OutputAsset]
/// trait completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn asset_to_output_asset(asset: AssetVc) -> Result<OutputAssetVc> {
    OutputAssetVc::resolve_from(asset)
        .await?
        .context("Asset must be a OutputAsset")
}
