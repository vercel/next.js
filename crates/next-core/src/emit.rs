use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    Completion, Completions, TryFlatJoinIterExt, Vc,
};
use turbo_tasks_fs::{rebase, FileSystemPath};
use turbopack_binding::turbopack::core::{
    asset::Asset,
    output::{OutputAsset, OutputAssets},
};

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub fn emit_all_assets(
    assets: Vc<OutputAssets>,
    node_root: Vc<FileSystemPath>,
    client_relative_path: Vc<FileSystemPath>,
    client_output_path: Vc<FileSystemPath>,
) -> Vc<Completion> {
    emit_assets(
        all_assets_from_entries(assets),
        node_root,
        client_relative_path,
        client_output_path,
    )
}

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub async fn emit_assets(
    assets: Vc<OutputAssets>,
    node_root: Vc<FileSystemPath>,
    client_relative_path: Vc<FileSystemPath>,
    client_output_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    Ok(Vc::<Completions>::cell(
        assets
            .await?
            .iter()
            .copied()
            .map(|asset| async move {
                if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside_ref(&*node_root.await?)
                {
                    return Ok(Some(emit(asset)));
                } else if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside_ref(&*client_relative_path.await?)
                {
                    // Client assets are emitted to the client output path, which is prefixed with
                    // _next. We need to rebase them to remove that prefix.
                    return Ok(Some(emit_rebase(
                        asset,
                        client_relative_path,
                        client_output_path,
                    )));
                }

                Ok(None)
            })
            .try_flat_join()
            .await?,
    )
    .completed())
}

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub async fn emit_client_assets(
    assets: Vc<OutputAssets>,
    client_relative_path: Vc<FileSystemPath>,
    client_output_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    Ok(Vc::<Completions>::cell(
        assets
            .await?
            .iter()
            .copied()
            .map(|asset| async move {
                if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside_ref(&*client_relative_path.await?)
                {
                    // Client assets are emitted to the client output path, which is prefixed with
                    // _next. We need to rebase them to remove that prefix.
                    return Ok(Some(emit_rebase(
                        asset,
                        client_relative_path,
                        client_output_path,
                    )));
                }

                Ok(None)
            })
            .try_flat_join()
            .await?,
    )
    .completed())
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
pub async fn all_assets_from_entries(entries: Vc<OutputAssets>) -> Result<Vc<OutputAssets>> {
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
    Ok(asset
        .references()
        .await?
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .into_iter())
}
