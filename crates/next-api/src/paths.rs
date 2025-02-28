use anyhow::Result;
use next_core::{all_assets_from_entries, next_manifests::AssetBinding};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets},
};

/// A reference to a server file with content hash for change detection
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
pub struct ServerPath {
    /// Relative to the root_path
    pub path: String,
    pub content_hash: u64,
}

/// A list of server paths
#[turbo_tasks::value(transparent)]
pub struct ServerPaths(Vec<ServerPath>);

/// Return a list of all server paths with filename and hash for all output
/// assets references from the `assets` list. Server paths are identified by
/// being inside `node_root`.
#[turbo_tasks::function]
pub async fn all_server_paths(
    assets: Vc<OutputAssets>,
    node_root: Vc<FileSystemPath>,
) -> Result<Vc<ServerPaths>> {
    let span = tracing::info_span!("all_server_paths");
    async move {
        let all_assets = all_assets_from_entries(assets).await?;
        let node_root = &node_root.await?;
        Ok(Vc::cell(
            all_assets
                .iter()
                .map(|&asset| async move {
                    Ok(
                        if let Some(path) = node_root.get_path_to(&*asset.path().await?) {
                            let content_hash = match *asset.content().await? {
                                AssetContent::File(file) => *file.hash().await?,
                                AssetContent::Redirect { .. } => 0,
                            };
                            Some(ServerPath {
                                path: path.to_string(),
                                content_hash,
                            })
                        } else {
                            None
                        },
                    )
                })
                .try_flat_join()
                .await?,
        ))
    }
    .instrument(span)
    .await
}

/// Return a list of relative paths to `root` for all output assets references
/// from the `assets` list which are located inside the root path.
#[turbo_tasks::function]
pub async fn all_paths_in_root(
    assets: Vc<OutputAssets>,
    root: Vc<FileSystemPath>,
) -> Result<Vc<Vec<RcStr>>> {
    let all_assets = &*all_assets_from_entries(assets).await?;
    let root = &*root.await?;

    Ok(Vc::cell(
        get_paths_from_root(root, all_assets, |_| true).await?,
    ))
}

pub(crate) async fn get_paths_from_root(
    root: &FileSystemPath,
    output_assets: &[ResolvedVc<Box<dyn OutputAsset>>],
    filter: impl FnOnce(&str) -> bool + Copy,
) -> Result<Vec<RcStr>> {
    output_assets
        .iter()
        .map(move |&file| async move {
            let path = &*file.path().await?;
            let Some(relative) = root.get_path_to(path) else {
                return Ok(None);
            };

            Ok(if filter(relative) {
                Some(relative.into())
            } else {
                None
            })
        })
        .try_flat_join()
        .await
}

pub(crate) async fn get_js_paths_from_root(
    root: &FileSystemPath,
    output_assets: &[ResolvedVc<Box<dyn OutputAsset>>],
) -> Result<Vec<RcStr>> {
    get_paths_from_root(root, output_assets, |path| path.ends_with(".js")).await
}

pub(crate) async fn get_wasm_paths_from_root(
    root: &FileSystemPath,
    output_assets: &[ResolvedVc<Box<dyn OutputAsset>>],
) -> Result<Vec<RcStr>> {
    get_paths_from_root(root, output_assets, |path| path.ends_with(".wasm")).await
}

pub(crate) async fn get_asset_paths_from_root(
    root: &FileSystemPath,
    output_assets: &[ResolvedVc<Box<dyn OutputAsset>>],
) -> Result<Vec<RcStr>> {
    get_paths_from_root(root, output_assets, |path| {
        !path.ends_with(".js") && !path.ends_with(".map") && !path.ends_with(".wasm")
    })
    .await
}

pub(crate) async fn get_font_paths_from_root(
    root: &FileSystemPath,
    output_assets: &[ResolvedVc<Box<dyn OutputAsset>>],
) -> Result<Vec<RcStr>> {
    get_paths_from_root(root, output_assets, |path| {
        path.ends_with(".woff")
            || path.ends_with(".woff2")
            || path.ends_with(".eot")
            || path.ends_with(".ttf")
            || path.ends_with(".otf")
    })
    .await
}

fn get_file_stem(path: &str) -> &str {
    let file_name = if let Some((_, file_name)) = path.rsplit_once('/') {
        file_name
    } else {
        path
    };

    if let Some((stem, _)) = file_name.split_once('.') {
        if stem.is_empty() {
            file_name
        } else {
            stem
        }
    } else {
        file_name
    }
}

pub(crate) fn wasm_paths_to_bindings(paths: Vec<RcStr>) -> Vec<AssetBinding> {
    paths
        .into_iter()
        .map(|path| {
            let stem = get_file_stem(&path);

            // very simple escaping just replacing unsupported characters with `_`
            let escaped = stem.replace(
                |c: char| !c.is_ascii_alphanumeric() && c != '$' && c != '_',
                "_",
            );

            AssetBinding {
                name: format!("wasm_{}", escaped).into(),
                file_path: path,
            }
        })
        .collect()
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
