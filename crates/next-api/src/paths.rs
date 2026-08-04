use anyhow::{Context, Result};
use next_core::next_manifests::AssetBinding;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbo_tasks_hash::HashAlgorithm;
use turbopack_core::{
    asset::{Asset, no_hash_salt},
    output::{OutputAsset, OutputAssets},
    reference::all_assets_from_entries,
};
use turbopack_wasm::wasm_edge_var_name;

/// A reference to an output asset with content hash for change detection
#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct AssetPath {
    /// Relative to the root_path
    pub path: RcStr,
    pub content_hash: RcStr,
}

/// A list of asset paths
#[turbo_tasks::value(transparent)]
pub struct AssetPaths(Vec<AssetPath>);

#[turbo_tasks::value(transparent)]
pub struct OptionAssetPath(Option<AssetPath>);

#[turbo_tasks::function]
async fn asset_path(
    asset: Vc<Box<dyn OutputAsset>>,
    node_root: FileSystemPath,
    should_content_hash: Option<HashAlgorithm>,
) -> Result<Vc<OptionAssetPath>> {
    Ok(Vc::cell(
        if let Some(path) = node_root.get_path_to(&*turbo_tasks::read!(asset.path())?) {
            let hash = if let Some(algorithm) = should_content_hash {
                turbo_tasks::read!(
                    asset
                        .content()
                        .content_hash(no_hash_salt(), algorithm)
                        .owned()
                )?
                .context("asset content not found")?
            } else {
                turbo_tasks::read!(asset.content().hash(HashAlgorithm::Xxh3Hash128Hex).owned())?
            };
            Some(AssetPath {
                path: RcStr::from(path),
                content_hash: hash,
            })
        } else {
            None
        },
    ))
}

/// Return a list of all asset paths with filename and hash for all output
/// assets references from the `assets` list. Only paths inside `node_root` are included.
#[turbo_tasks::function]
pub async fn all_asset_paths(
    assets: Vc<OutputAssets>,
    node_root: FileSystemPath,
    should_content_hash: Option<HashAlgorithm>,
) -> Result<Vc<AssetPaths>> {
    let span = tracing::info_span!(
        "collect all asset paths",
        assets_count = tracing::field::Empty,
        asset_paths_count = tracing::field::Empty
    );
    #[cfg(not(feature = "sync"))]
    {
        let span_clone = span.clone();
        turbo_tasks::read!(
            async move {
                let all_assets = turbo_tasks::read!(all_assets_from_entries(assets))?;
                span.record("assets_count", all_assets.len());
                let asset_paths = turbo_tasks::read!(
                    all_assets
                        .iter()
                        .map(
                            |&asset| asset_path(*asset, node_root.clone(), should_content_hash)
                                .owned()
                        )
                        .try_flat_join()
                )?;
                span.record("asset_paths_count", asset_paths.len());
                Ok(Vc::cell(asset_paths))
            }
            .instrument(span_clone)
        )
    }
    #[cfg(feature = "sync")]
    {
        let _g = span.enter();
        let all_assets = turbo_tasks::read!(all_assets_from_entries(assets))?;
        span.record("assets_count", all_assets.len());
        let asset_paths = {
            let mut asset_paths = Vec::new();
            for &asset in all_assets.iter() {
                asset_paths.extend(turbo_tasks::read!(
                    asset_path(*asset, node_root.clone(), should_content_hash).owned()
                )?);
            }
            asset_paths
        };
        span.record("asset_paths_count", asset_paths.len());
        Ok(Vc::cell(asset_paths))
    }
}

/// Return a list of relative paths to `root` for all output assets references
/// from the `assets` list which are located inside the root path.
#[turbo_tasks::function]
pub async fn all_paths_in_root(
    assets: Vc<OutputAssets>,
    root: FileSystemPath,
) -> Result<Vc<Vec<RcStr>>> {
    let all_assets = turbo_tasks::read!(all_assets_from_entries(assets))?;

    Ok(Vc::cell(turbo_tasks::read!(get_paths_from_root(
        &root,
        all_assets,
        |_| true
    ))?))
}

turbo_tasks::dual_fn! {
pub(crate) fn get_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
    filter: impl FnOnce(&str) -> bool + Copy,
) -> Result<Vec<RcStr>> {
    #[cfg(not(feature = "sync"))]
    {
        turbo_tasks::read!(output_assets
            .into_iter()
            .map(move |file| async move {
                let path = &*turbo_tasks::read!(file.path())?;
                let Some(relative) = root.get_path_to(path) else {
                    return Ok(None);
                };

                Ok(if filter(relative) {
                    Some(relative.into())
                } else {
                    None
                })
            })
            .try_flat_join())
    }
    #[cfg(feature = "sync")]
    {
        let mut result = Vec::new();
        for file in output_assets.into_iter() {
            let path = &*turbo_tasks::read!(file.path())?;
            let Some(relative) = root.get_path_to(path) else {
                continue;
            };
            if filter(relative) {
                result.push(relative.into());
            }
        }
        Ok(result)
    }
}
}

turbo_tasks::dual_fn! {
pub(crate) fn get_js_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<RcStr>> {
    turbo_tasks::read!(get_paths_from_root(root, output_assets, |path| path.ends_with(".js")))
}
}

turbo_tasks::dual_fn! {
pub(crate) fn get_wasm_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<(RcStr, ResolvedVc<Box<dyn OutputAsset>>)>> {
    #[cfg(not(feature = "sync"))]
    {
        turbo_tasks::read!(output_assets
            .into_iter()
            .map(move |file| async move {
                let path = &*turbo_tasks::read!(file.path())?;
                let Some(relative) = root.get_path_to(path) else {
                    return Ok(None);
                };

                Ok(if relative.ends_with(".wasm") {
                    Some((relative.into(), file))
                } else {
                    None
                })
            })
            .try_flat_join())
    }
    #[cfg(feature = "sync")]
    {
        let mut result = Vec::new();
        for file in output_assets.into_iter() {
            let path = &*turbo_tasks::read!(file.path())?;
            let Some(relative) = root.get_path_to(path) else {
                continue;
            };
            if relative.ends_with(".wasm") {
                result.push((relative.into(), file));
            }
        }
        Ok(result)
    }
}
}

turbo_tasks::dual_fn! {
pub(crate) fn get_asset_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<RcStr>> {
    turbo_tasks::read!(get_paths_from_root(root, output_assets, |path| {
        !path.ends_with(".js") && !path.ends_with(".map") && !path.ends_with(".wasm")
    }))

}
}

turbo_tasks::dual_fn! {
pub(crate) fn get_font_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<RcStr>> {
    turbo_tasks::read!(get_paths_from_root(root, output_assets, |path| {
        path.ends_with(".woff")
            || path.ends_with(".woff2")
            || path.ends_with(".eot")
            || path.ends_with(".ttf")
            || path.ends_with(".otf")
    }))

}
}

turbo_tasks::dual_fn! {
pub(crate) fn wasm_paths_to_bindings(
    paths: impl IntoIterator<Item = (RcStr, ResolvedVc<Box<dyn OutputAsset>>)>,
) -> Result<Vec<AssetBinding>> {
    #[cfg(not(feature = "sync"))]
    {
        turbo_tasks::read!(paths
            .into_iter()
            .map(async |(path, asset)| {
                Ok(AssetBinding {
                    name: turbo_tasks::read!(wasm_edge_var_name(Vc::upcast(*asset)).owned())?,
                    file_path: path,
                })
            })
            .try_join())
    }
    #[cfg(feature = "sync")]
    {
        let mut result = Vec::new();
        for (path, asset) in paths.into_iter() {
            result.push(AssetBinding {
                name: turbo_tasks::read!(wasm_edge_var_name(Vc::upcast(*asset)).owned())?,
                file_path: path,
            });
        }
        Ok(result)
    }
}
}

pub(crate) fn paths_to_bindings(paths: Vec<RcStr>) -> Vec<AssetBinding> {
    paths
        .into_iter()
        .map(|path| AssetBinding {
            name: path.clone(),
            file_path: path,
        })
        .collect()
}
