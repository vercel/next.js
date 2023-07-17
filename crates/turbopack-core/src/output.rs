use anyhow::{Context, Result};
use indexmap::IndexSet;
use turbo_tasks::Vc;

use crate::{asset::Asset, ident::AssetIdent};

/// An asset that should be outputted, e. g. written to disk or served from a
/// server.
#[turbo_tasks::value_trait]
pub trait OutputAsset: Asset {
    // TODO change this to path() -> Vc<FileSystemPath>
    /// The identifier of the [OutputAsset]. It's expected to be unique and
    /// capture all properties of the [OutputAsset]. Only path must be used.
    fn ident(&self) -> Vc<AssetIdent>;
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssets(Vec<Vc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_impl]
impl OutputAssets {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(vec![])
    }
}

/// A set of [OutputAsset]s
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsSet(IndexSet<Vc<Box<dyn OutputAsset>>>);

/// This is a temporary function that should be removed once the [OutputAsset]
/// trait completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn asset_to_output_asset(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Box<dyn OutputAsset>>> {
    Vc::try_resolve_downcast::<Box<dyn OutputAsset>>(asset)
        .await?
        .context("Asset must be a OutputAsset")
}

// TODO All Vc::try_resolve_downcast::<Box<dyn OutputAsset>> calls should be
// removed
