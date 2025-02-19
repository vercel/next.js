use anyhow::Result;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    ResolvedVc, TryFlatJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_fs::{rebase, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    output::{OutputAsset, OutputAssets},
};

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
///
/// Assets inside the given client root are rebased to the given client output
/// path.
#[turbo_tasks::function]
pub async fn emit_all_assets(
    assets: Vc<OutputAssets>,
    node_root: Vc<FileSystemPath>,
    client_relative_path: Vc<FileSystemPath>,
    client_output_path: Vc<FileSystemPath>,
) -> Result<()> {
    let _ = emit_assets(
        all_assets_from_entries(assets),
        node_root,
        client_relative_path,
        client_output_path,
    )
    .resolve()
    .await?;
    Ok(())
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
) -> Result<()> {
    let _: Vec<Vc<()>> = assets
        .await?
        .iter()
        .copied()
        .map(|asset| async move {
            let path = asset.path();
            let span = tracing::info_span!("emit asset", name = %path.to_string().await?);
            async move {
                let path = path.await?;
                Ok(if path.is_inside_ref(&*node_root.await?) {
                    Some(emit(*asset))
                } else if path.is_inside_ref(&*client_relative_path.await?) {
                    // Client assets are emitted to the client output path, which is prefixed
                    // with _next. We need to rebase them to remove that
                    // prefix.
                    Some(emit_rebase(
                        *asset,
                        client_relative_path,
                        client_output_path,
                    ))
                } else {
                    None
                })
            }
            .instrument(span)
            .await
        })
        .try_flat_join()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Result<()> {
    let _ = asset.content().write(asset.path()).resolve().await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: Vc<FileSystemPath>,
    to: Vc<FileSystemPath>,
) -> Result<()> {
    let path = rebase(asset.path(), from, to);
    let content = asset.content();
    let _ = content
        .resolve()
        .await?
        .write(path.resolve().await?)
        .resolve()
        .await?;
    Ok(())
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
            .collect::<FxHashSet<_>>()
            .into_iter()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk.
async fn get_referenced_assets(
    asset: ResolvedVc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = ResolvedVc<Box<dyn OutputAsset>>> + Send> {
    Ok(asset
        .references()
        .await?
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .into_iter())
}
