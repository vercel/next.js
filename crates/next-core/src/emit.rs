use anyhow::Result;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_tasks::{
    ResolvedVc, TryFlatJoinIterExt, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};
use turbo_tasks_fs::{FileSystemPath, rebase};
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
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
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
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
) -> Result<()> {
    let _: Vec<Vc<()>> = assets
        .await?
        .iter()
        .copied()
        .map(|asset| {
            let node_root = node_root.clone();
            let client_relative_path = client_relative_path.clone();
            let client_output_path = client_output_path.clone();

            async move {
                let path = asset.path().await?;
                let span = tracing::info_span!("emit asset", name = %path.value_to_string().await?);
                async move {
                    Ok(if path.is_inside_ref(&node_root) {
                        Some(emit(*asset))
                    } else if path.is_inside_ref(&client_relative_path) {
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
            }
        })
        .try_flat_join()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Result<()> {
    let _ = asset
        .content()
        .write((*asset.path().await?).clone())
        .resolve()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: FileSystemPath,
    to: FileSystemPath,
) -> Result<()> {
    let path = rebase(&*asset.path().await?, from, to).await?;
    let content = asset.content();
    let _ = content.resolve().await?.write(path).resolve().await?;
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
            .into_postorder_topological()
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
