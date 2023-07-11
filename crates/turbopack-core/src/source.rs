use anyhow::{Context, Result};

use crate::asset::{Asset, AssetOptionVc, AssetVc};

/// (Unparsed) Source Code. Source Code is processed into [Module]s by the
/// [AssetContext]. All [Source]s have content and an identifier.
#[turbo_tasks::value_trait]
pub trait Source: Asset {}

#[turbo_tasks::value(transparent)]
pub struct OptionSource(Option<SourceVc>);

#[turbo_tasks::value(transparent)]
pub struct Sources(Vec<SourceVc>);

/// This is a temporary function that should be removed once the [Source] trait
/// completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn asset_to_source(asset: AssetVc) -> Result<SourceVc> {
    SourceVc::resolve_from(asset)
        .await?
        .context("Asset must be a Source")
}

/// This is a temporary function that should be removed once the [Source] trait
/// completely replaces the [Asset] trait.
/// TODO make this function unnecessary
#[turbo_tasks::function]
pub async fn option_asset_to_source(asset: AssetOptionVc) -> Result<OptionSourceVc> {
    if let Some(asset) = *asset.await? {
        Ok(OptionSourceVc::cell(Some(
            SourceVc::resolve_from(asset)
                .await?
                .context("Asset must be a Source")?,
        )))
    } else {
        Ok(OptionSourceVc::cell(None))
    }
}
