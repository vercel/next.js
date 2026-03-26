use anyhow::{Ok, Result, bail};
use futures::try_join;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToStringRef, Vc,
};
use turbo_tasks_fs::{FileContent, FileSystemPath, rebase};
use turbopack_core::{
    asset::{Asset, AssetContent},
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
    enum Location {
        Node,
        Client,
    }
    let assets = assets
        .await?
        .iter()
        .copied()
        .map(async |asset| {
            let path = asset.path().owned().await?;
            let location = if path.is_inside_ref(&node_root) {
                Location::Node
            } else if path.is_inside_ref(&client_relative_path) {
                Location::Client
            } else {
                return Ok(None);
            };
            Ok(Some((location, path, asset)))
        })
        .try_flat_join()
        .await?;

    let mut node_assets_by_path = FxIndexMap::default();
    let mut client_assets_by_path = FxIndexMap::default();
    for (location, path, asset) in assets {
        match location {
            Location::Node => {
                node_assets_by_path
                    .entry(path)
                    .or_insert_with(Vec::new)
                    .push(asset);
            }
            Location::Client => {
                client_assets_by_path
                    .entry(path)
                    .or_insert_with(Vec::new)
                    .push(asset);
            }
        }
    }

    async fn check_duplicates(
        path: &FileSystemPath,
        assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
    ) -> Result<ResolvedVc<Box<dyn OutputAsset>>> {
        let mut iter = assets.into_iter();
        let first = iter.next().unwrap();
        for next in iter {
            if let Some(diff) = assets_diff(*next, *first).owned().await? {
                bail!(
                    "Duplicate asset with different content: {}\n{}",
                    path.to_string_ref().await?,
                    diff
                );
            }
        }
        Ok(first)
    }

    try_join!(
        node_assets_by_path
            .into_iter()
            .map(async |(path, assets)| {
                let asset = check_duplicates(&path, assets).await?;
                emit(*asset).as_side_effect().await
            })
            .try_join(),
        client_assets_by_path
            .into_iter()
            .map(async |(path, assets)| {
                let asset = check_duplicates(&path, assets).await?;
                // Client assets are emitted to the client output path, which is prefixed
                // with _next. We need to rebase them to remove that
                // prefix.
                emit_rebase(
                    *asset,
                    client_relative_path.clone(),
                    client_output_path.clone(),
                )
                .as_side_effect()
                .await
            })
            .try_join(),
    )?;
    Ok(())
}

#[turbo_tasks::function]
async fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Result<()> {
    asset
        .content()
        .to_resolved()
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
        .to_resolved()
        .await?
        .write(path)
        .as_side_effect()
        .await?;
    Ok(())
}

#[turbo_tasks::function]
async fn assets_diff(
    assets1: Vc<Box<dyn OutputAsset>>,
    assets2: Vc<Box<dyn OutputAsset>>,
) -> Result<Vc<Option<RcStr>>> {
    let content1 = assets1.content().await?;
    let content2 = assets2.content().await?;

    match (&*content1, &*content2) {
        (AssetContent::File(content1), AssetContent::File(content2)) => {
            let content1 = content1.await?;
            let content2 = content2.await?;

            match (&*content1, &*content2) {
                (FileContent::NotFound, FileContent::NotFound) => Ok(Vc::cell(None)),
                (FileContent::Content(content1), FileContent::Content(content2)) => {
                    if content1 == content2 {
                        Ok(Vc::cell(None))
                    } else {
                        // TODO: Produce an actual diff, e.g. write both versions to
                        // scratch space under `.next/` and run a text diff on them.
                        Ok(Vc::cell(Some(rcstr!("file content differs"))))
                    }
                }
                _ => Ok(Vc::cell(Some(rcstr!("file content type differs")))),
            }
        }
        (
            AssetContent::Redirect {
                target: target1,
                link_type: link_type1,
            },
            AssetContent::Redirect {
                target: target2,
                link_type: link_type2,
            },
        ) => {
            if target1 == target2 && link_type1 == link_type2 {
                Ok(Vc::cell(None))
            } else {
                Ok(Vc::cell(Some(
                    format!("redirect differs: {} vs {}", target1, target2).into(),
                )))
            }
        }
        _ => Ok(Vc::cell(Some(rcstr!("asset content type differs")))),
    }
}
