use anyhow::{Context, Result};
use turbo_tasks::Vc;

use crate::asset::{Asset, AssetOption};

/// (Unparsed) Source Code. Source Code is processed into [Module]s by the
/// [AssetContext]. All [Source]s have content and an identifier.
#[turbo_tasks::value_trait]
pub trait Source: Asset {}

#[turbo_tasks::value(transparent)]
pub struct OptionSource(Option<Vc<Box<dyn Source>>>);

#[turbo_tasks::value(transparent)]
pub struct Sources(Vec<Vc<Box<dyn Source>>>);

/// This is a temporary function that should be removed once the [Source] trait
/// completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn asset_to_source(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Box<dyn Source>>> {
    Vc::try_resolve_sidecast::<Box<dyn Source>>(asset)
        .await?
        .context("Asset must be a Source")
}

/// This is a temporary function that should be removed once the [Source] trait
/// completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn option_asset_to_source(asset: Vc<AssetOption>) -> Result<Vc<OptionSource>> {
    if let Some(asset) = *asset.await? {
        Ok(Vc::cell(Some(
            Vc::try_resolve_sidecast::<Box<dyn Source>>(asset)
                .await?
                .context("Asset must be a Source")?,
        )))
    } else {
        Ok(Vc::cell(None))
    }
}
