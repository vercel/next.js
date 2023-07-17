use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    Completion, Completions, TryJoinIterExt, Vc,
};
use turbo_tasks_fs::{rebase, FileSystemPath};
use turbopack_binding::turbopack::core::{
    asset::Asset,
    output::{OutputAsset, OutputAssets},
    reference::AssetReference,
};

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
#[turbo_tasks::function]
pub async fn emit_all_assets(
    assets: Vc<OutputAssets>,
    node_root: Vc<FileSystemPath>,
    client_relative_path: Vc<FileSystemPath>,
    client_output_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let all_assets = all_assets_from_entries(assets).await?;
    Ok(Completions::all(
        all_assets
            .iter()
            .copied()
            .map(|asset| async move {
                if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside_ref(&*node_root.await?)
                {
                    return Ok(emit(asset));
                } else if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside_ref(&*client_relative_path.await?)
                {
                    // Client assets are emitted to the client output path, which is prefixed with
                    // _next. We need to rebase them to remove that prefix.
                    return Ok(emit_rebase(asset, client_relative_path, client_output_path));
                }

                Ok(Completion::immutable())
            })
            .try_join()
            .await?,
    ))
}

#[turbo_tasks::function]
fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Vc<Completion> {
    asset.content().write(asset.ident().path())
}

#[turbo_tasks::function]
fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: Vc<FileSystemPath>,
    to: Vc<FileSystemPath>,
) -> Vc<Completion> {
    asset
        .content()
        .write(rebase(asset.ident().path(), from, to))
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
async fn all_assets_from_entries(entries: Vc<OutputAssets>) -> Result<Vc<OutputAssets>> {
    Ok(Vc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit(entries.await?.iter().copied(), get_referenced_assets)
            .await
            .completed()?
            .into_inner()
            .into_reverse_topological()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk.
async fn get_referenced_assets(
    asset: Vc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn OutputAsset>>> + Send> {
    Ok(
        asset
            .references()
            .await?
            .iter()
            .map(|reference| async move {
                let primary_assets = reference.resolve_reference().primary_assets().await?;
                Ok(primary_assets.clone_value())
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .map(|asset| async move {
                Ok(Vc::try_resolve_sidecast::<Box<dyn OutputAsset>>(asset).await?)
            })
            .try_join()
            .await?
            .into_iter()
            .flatten(),
    )
}
