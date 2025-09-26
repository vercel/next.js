use anyhow::Result;
use next_core::{all_assets_from_entries, next_manifests::AssetBinding};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::Asset,
    output::{OutputAsset, OutputAssets},
};
use turbopack_wasm::wasm_edge_var_name;

/// A reference to a server file with content hash for change detection
#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub struct ServerPath {
    /// Relative to the root_path
    pub path: RcStr,
    pub content_hash: u64,
}

/// A list of server paths
#[turbo_tasks::value(transparent)]
pub struct ServerPaths(Vec<ServerPath>);

#[turbo_tasks::value(transparent)]
pub struct OptionServerPath(Option<ServerPath>);

#[turbo_tasks::function]
async fn server_path(
    asset: Vc<Box<dyn OutputAsset>>,
    node_root: FileSystemPath,
) -> Result<Vc<OptionServerPath>> {
    Ok(Vc::cell(
        if let Some(path) = node_root.get_path_to(&*asset.path().await?) {
            let content_hash = *asset.content().file_content().hash().await?;
            Some(ServerPath {
                path: RcStr::from(path),
                content_hash,
            })
        } else {
            None
        },
    ))
}

/// Return a list of all server paths with filename and hash for all output
/// assets references from the `assets` list. Server paths are identified by
/// being inside `node_root`.
#[turbo_tasks::function]
pub async fn all_server_paths(
    assets: Vc<OutputAssets>,
    node_root: FileSystemPath,
) -> Result<Vc<ServerPaths>> {
    let span = tracing::info_span!(
        "collect all server paths",
        assets_count = tracing::field::Empty,
        server_assets_count = tracing::field::Empty
    );
    let span_clone = span.clone();
    async move {
        let all_assets = all_assets_from_entries(assets).await?;
        span.record("assets_count", all_assets.len());
        let server_paths = all_assets
            .iter()
            .map(|&asset| server_path(*asset, node_root.clone()).owned())
            .try_flat_join()
            .await?;
        span.record("server_assets_count", server_paths.len());
        Ok(Vc::cell(server_paths))
    }
    .instrument(span_clone)
    .await
}

/// Return a list of relative paths to `root` for all output assets references
/// from the `assets` list which are located inside the root path.
#[turbo_tasks::function]
pub async fn all_paths_in_root(
    assets: Vc<OutputAssets>,
    root: FileSystemPath,
) -> Result<Vc<Vec<RcStr>>> {
    let all_assets = &*all_assets_from_entries(assets).await?;

    Ok(Vc::cell(
        get_paths_from_root(&root, all_assets, |_| true).await?,
    ))
}

pub(crate) async fn get_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = &ResolvedVc<Box<dyn OutputAsset>>>,
    filter: impl FnOnce(&str) -> bool + Copy,
) -> Result<Vec<RcStr>> {
    output_assets
        .into_iter()
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
    output_assets: impl IntoIterator<Item = &ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<RcStr>> {
    get_paths_from_root(root, output_assets, |path| path.ends_with(".js")).await
}

pub(crate) async fn get_wasm_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = &ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<(RcStr, ResolvedVc<Box<dyn OutputAsset>>)>> {
    output_assets
        .into_iter()
        .map(move |&file| async move {
            let path = &*file.path().await?;
            let Some(relative) = root.get_path_to(path) else {
                return Ok(None);
            };

            Ok(if relative.ends_with(".wasm") {
                Some((relative.into(), file))
            } else {
                None
            })
        })
        .try_flat_join()
        .await
}

pub(crate) async fn get_asset_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = &ResolvedVc<Box<dyn OutputAsset>>>,
) -> Result<Vec<RcStr>> {
    get_paths_from_root(root, output_assets, |path| {
        !path.ends_with(".js") && !path.ends_with(".map") && !path.ends_with(".wasm")
    })
    .await
}

pub(crate) async fn get_font_paths_from_root(
    root: &FileSystemPath,
    output_assets: impl IntoIterator<Item = &ResolvedVc<Box<dyn OutputAsset>>>,
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

pub(crate) async fn wasm_paths_to_bindings(
    paths: impl IntoIterator<Item = (RcStr, ResolvedVc<Box<dyn OutputAsset>>)>,
) -> Result<Vec<AssetBinding>> {
    paths
        .into_iter()
        .map(async |(path, asset)| {
            Ok(AssetBinding {
                name: wasm_edge_var_name(Vc::upcast(*asset)).owned().await?,
                file_path: path,
            })
        })
        .try_join()
        .await
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
