use anyhow::Result;
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic},
    Completion, Completions, Vc,
};

use crate::{
    asset::Asset,
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference::primary_referenced_modules,
};

async fn get_referenced_output_assets(
    parent: Vc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn OutputAsset>>> + Send> {
    Ok(parent.references().await?.clone_value().into_iter())
}

async fn get_referenced_modules(
    parent: Vc<Box<dyn Module>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn Module>>> + Send> {
    Ok(primary_referenced_modules(parent)
        .await?
        .clone_value()
        .into_iter())
}

/// Returns a completion that changes when any content of any asset in the whole
/// asset graph changes.
#[turbo_tasks::function]
pub async fn any_content_changed_of_module(root: Vc<Box<dyn Module>>) -> Result<Vc<Completion>> {
    let completions = NonDeterministic::new()
        .skip_duplicates()
        .visit([root], get_referenced_modules)
        .await
        .completed()?
        .into_inner()
        .into_iter()
        .map(|m| content_changed(Vc::upcast(m)))
        .collect();

    Ok(Vc::<Completions>::cell(completions).completed())
}

/// Returns a completion that changes when any content of any asset in the whole
/// asset graph changes.
#[turbo_tasks::function]
pub async fn any_content_changed_of_output_asset(
    root: Vc<Box<dyn OutputAsset>>,
) -> Result<Vc<Completion>> {
    let completions = NonDeterministic::new()
        .skip_duplicates()
        .visit([root], get_referenced_output_assets)
        .await
        .completed()?
        .into_inner()
        .into_iter()
        .map(|m| content_changed(Vc::upcast(m)))
        .collect();

    Ok(Vc::<Completions>::cell(completions).completed())
}

/// Returns a completion that changes when any content of any asset in the given
/// output asset graphs changes.
#[turbo_tasks::function]
pub async fn any_content_changed_of_output_assets(
    roots: Vc<OutputAssets>,
) -> Result<Vc<Completion>> {
    Ok(Vc::<Completions>::cell(
        roots
            .await?
            .iter()
            .map(|&a| any_content_changed_of_output_asset(a))
            .collect(),
    )
    .completed())
}

/// Returns a completion that changes when the content of the given asset
/// changes.
#[turbo_tasks::function]
pub async fn content_changed(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Completion>> {
    // Reading the file content is enough to add as dependency
    asset.content().file_content().await?;
    Ok(Completion::new())
}
