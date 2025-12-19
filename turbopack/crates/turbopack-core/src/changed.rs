use anyhow::Result;
use turbo_tasks::{
    Completion, Completions, ResolvedVc, TryJoinIterExt, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};

use crate::{
    asset::Asset,
    module::Module,
    output::{ExpandOutputAssetsInput, OutputAsset, OutputAssets, expand_output_assets},
    reference::primary_referenced_modules,
};

pub async fn get_referenced_modules(
    parent: ResolvedVc<Box<dyn Module>>,
) -> Result<impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Send> {
    Ok(primary_referenced_modules(*parent)
        .owned()
        .await?
        .into_iter())
}

/// Returns a completion that changes when any content of any asset in the whole
/// asset graph changes.
#[turbo_tasks::function]
pub async fn any_content_changed_of_module(
    root: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<Completion>> {
    let completions = AdjacencyMap::new()
        .visit([root], get_referenced_modules)
        .await
        .completed()?
        .into_postorder_topological()
        .map(|m| content_changed(*ResolvedVc::upcast(m)))
        .map(|v| v.to_resolved())
        .try_join()
        .await?;

    Ok(Vc::<Completions>::cell(completions).completed())
}

/// Returns a completion that changes when any content of any asset in the whole
/// asset graph changes.
#[turbo_tasks::function]
pub async fn any_content_changed_of_output_asset(
    root: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<Vc<Completion>> {
    let completions =
        expand_output_assets(std::iter::once(ExpandOutputAssetsInput::Asset(root)), true)
            .await?
            .into_iter()
            .map(|m| content_changed(*ResolvedVc::upcast(m)))
            .map(|v| v.to_resolved())
            .try_join()
            .await?;

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
            .map(|&a| any_content_changed_of_output_asset(*a))
            .map(|v| v.to_resolved())
            .try_join()
            .await?,
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
