use anyhow::Result;
use turbo_tasks::{
    Completion, Completions, ResolvedVc, TryJoinIterExt, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};

use crate::{asset::Asset, module::Module, reference::primary_referenced_modules};

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
pub async fn any_source_content_changed_of_module(
    root: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<Completion>> {
    let completions = AdjacencyMap::new()
        .visit([root], get_referenced_modules)
        .await
        .completed()?
        .into_postorder_topological()
        .map(|m| source_changed(*m))
        .map(|v| v.to_resolved())
        .try_join()
        .await?;

    Ok(Vc::<Completions>::cell(completions).completed())
}

/// Returns a completion that changes when the content of the given asset
/// changes.
#[turbo_tasks::function]
pub async fn content_changed(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Completion>> {
    // Reading the file content is enough to add as dependency
    asset.content().file_content().await?;
    Ok(Completion::new())
}

/// Returns a completion that changes when the content of the given asset
/// changes.
#[turbo_tasks::function]
pub async fn source_changed(asset: Vc<Box<dyn Module>>) -> Result<Vc<Completion>> {
    if let Some(source) = *asset.source().await? {
        // Reading the file content is enough to add as dependency
        source.content().file_content().await?;
    }
    Ok(Completion::new())
}
