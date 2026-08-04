use anyhow::Result;
use turbo_tasks::{
    Completion, Completions, ResolvedVc, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};

use crate::{asset::Asset, module::Module, reference::primary_referenced_modules};

turbo_tasks::dual_fn! {
pub fn get_referenced_modules(
    parent: ResolvedVc<Box<dyn Module>>,
) -> Result<impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Send> {
    Ok(turbo_tasks::read!(primary_referenced_modules(*parent)
        .owned())?
        .into_iter())
}
}

/// Returns a completion that changes when any content of any asset in the whole
/// asset graph changes.
#[turbo_tasks::function]
pub async fn any_source_content_changed_of_module(
    root: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<Completion>> {
    let modules = turbo_tasks::read!(AdjacencyMap::new().visit([root], get_referenced_modules))
        .completed()?
        .into_postorder_topological();
    // `.to_resolved()` futures cannot fan out through `parallel!` under sync; keep the
    // concurrent `try_join` in the async build and resolve sequentially under sync.
    #[cfg(not(feature = "sync"))]
    let completions = {
        use turbo_tasks::TryJoinIterExt;
        modules
            .map(|m| source_changed(*m).to_resolved())
            .try_join()
            .await?
    };
    #[cfg(feature = "sync")]
    let completions = {
        let mut completions = Vec::new();
        for m in modules {
            completions.push(turbo_tasks::read!(source_changed(*m).to_resolved())?);
        }
        completions
    };

    Ok(Vc::<Completions>::cell(completions).completed())
}

/// Returns a completion that changes when the content of the given asset
/// changes.
#[turbo_tasks::function]
pub async fn content_changed(asset: Vc<Box<dyn Asset>>) -> Result<Vc<Completion>> {
    // Reading the file content is enough to add as dependency
    turbo_tasks::read!(asset.content().file_content())?;
    Ok(Completion::new())
}

/// Returns a completion that changes when the content of the given asset
/// changes.
#[turbo_tasks::function]
pub async fn source_changed(asset: Vc<Box<dyn Module>>) -> Result<Vc<Completion>> {
    if let Some(source) = *turbo_tasks::read!(asset.source())? {
        // Reading the file content is enough to add as dependency
        turbo_tasks::read!(source.content().file_content())?;
    }
    Ok(Completion::new())
}
