use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::{FileSystemPath, rebase};
use turbopack_core::{
    asset::Asset,
    output::{ExpandedOutputAssets, OutputAsset, OutputAssets},
    reference::all_assets_from_entries,
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
    emit_assets(
        all_assets_from_entries(assets),
        node_root,
        client_relative_path,
        client_output_path,
    )
    .as_side_effect()
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
    assets: Vc<ExpandedOutputAssets>,
    node_root: FileSystemPath,
    client_relative_path: FileSystemPath,
    client_output_path: FileSystemPath,
) -> Result<()> {
    let _: Vec<()> = assets
        .await?
        .iter()
        .copied()
        .map(|asset| {
            let node_root = node_root.clone();
            let client_relative_path = client_relative_path.clone();
            let client_output_path = client_output_path.clone();

            async move {
                let path = asset.path().owned().await?;
                let span = tracing::info_span!("emit asset", name = %path.value_to_string().await?);
                async move {
                    Ok(if path.is_inside_ref(&node_root) {
                        Some(emit(*asset).as_side_effect().await?)
                    } else if path.is_inside_ref(&client_relative_path) {
                        // Client assets are emitted to the client output path, which is prefixed
                        // with _next. We need to rebase them to remove that
                        // prefix.
                        Some(
                            emit_rebase(*asset, client_relative_path, client_output_path)
                                .as_side_effect()
                                .await?,
                        )
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
    asset
        .content()
        .resolve()
        .await?
        .write(asset.path().owned().await?)
        .as_side_effect()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: FileSystemPath,
    to: FileSystemPath,
) -> Result<()> {
    let path = rebase(asset.path().owned().await?, from, to)
        .owned()
        .await?;
    let content = asset.content();
    content
        .resolve()
        .await?
        .write(path)
        .as_side_effect()
        .await?;
    Ok(())
}
