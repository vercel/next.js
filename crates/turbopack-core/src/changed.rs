use anyhow::Result;
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic},
    CompletionVc, CompletionsVc,
};

use crate::{
    asset::{Asset, AssetVc},
    reference::all_referenced_assets,
};

async fn get_referenced_assets(parent: AssetVc) -> Result<impl Iterator<Item = AssetVc> + Send> {
    Ok(all_referenced_assets(parent)
        .await?
        .clone_value()
        .into_iter())
}

/// Returns a completion that changes when any content of any asset in the whole
/// asset graph changes.
#[turbo_tasks::function]
pub async fn any_content_changed(root: AssetVc) -> Result<CompletionVc> {
    let completions = NonDeterministic::new()
        .skip_duplicates()
        .visit([root], get_referenced_assets)
        .await
        .completed()?
        .into_inner()
        .into_iter()
        .map(content_changed)
        .collect();

    Ok(CompletionsVc::cell(completions).completed())
}

/// Returns a completion that changes when the content of the given asset
/// changes.
#[turbo_tasks::function]
pub async fn content_changed(asset: AssetVc) -> Result<CompletionVc> {
    // Reading the file content is enough to add as dependency
    asset.content().file_content().await?;
    Ok(CompletionVc::new())
}
