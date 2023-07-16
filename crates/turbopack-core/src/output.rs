use anyhow::{Context, Result};
use turbo_tasks::Vc;

use crate::asset::Asset;

/// An asset that should be outputted, e. g. written to disk or served from a
/// server.
#[turbo_tasks::value_trait]
pub trait OutputAsset: Asset {}

#[turbo_tasks::value(transparent)]
pub struct OutputAssets(Vec<Vc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_impl]
impl OutputAssets {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(vec![])
    }
}

/// This is a temporary function that should be removed once the [OutputAsset]
/// trait completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn asset_to_output_asset(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Box<dyn OutputAsset>>> {
    Vc::try_resolve_sidecast::<Box<dyn OutputAsset>>(asset)
        .await?
        .context("Asset must be a OutputAsset")
}
