//! Route bundle stats of production builds (`diagnostics/route-bundle-stats.json`).
//!
//! For every page route of both routers, lists the client JS chunks loaded on first load and
//! their total uncompressed size, sorted by size (largest first), then by route.

use anyhow::{Context, Result};
use bincode::{Decode, Encode};
use next_core::next_manifests::route_bundle_stats::app_page_first_load_js_chunks;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileContent, FileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets, OutputAssetsReference},
};

use crate::{
    project::Project,
    route::{Endpoint, FirstLoadJs, Route},
};

/// The first load JS chunks of an endpoint (`.js` files only, each once, in load order), with
/// their paths relative to `client_relative_path`, or `None` if the endpoint doesn't render a
/// page.
async fn endpoint_first_load_js_chunks(
    endpoint: Vc<Box<dyn Endpoint>>,
    client_relative_path: &FileSystemPath,
    generate_component_chunks: bool,
) -> Result<Option<Vec<(RcStr, ResolvedVc<Box<dyn OutputAsset>>)>>> {
    let output = endpoint.output().await?;
    Ok(match &output.first_load_js {
        None => None,
        Some(FirstLoadJs::AppPage {
            client_references,
            client_references_chunks,
            client_shared_chunks,
        }) => Some(
            app_page_first_load_js_chunks(
                *client_references,
                *client_references_chunks,
                *client_shared_chunks,
                client_relative_path,
                generate_component_chunks,
            )
            .await?,
        ),
        Some(FirstLoadJs::PagesPage(chunks)) => {
            let chunks = chunks.await?;
            let paths = chunks.iter().map(|chunk| chunk.path()).try_join().await?;
            Some(
                chunks
                    .iter()
                    .zip(paths.iter())
                    .filter_map(|(&chunk, path)| {
                        let path = client_relative_path.get_path_to(path)?;
                        path.ends_with(".js").then(|| (RcStr::from(path), chunk))
                    })
                    .collect(),
            )
        }
    })
}

/// A route of the stats and the endpoints whose first load JS chunks it loads (for Pages Router
/// routes, this includes the `/_app` endpoint).
#[turbo_tasks::task_input]
#[derive(Clone, Debug, PartialEq, Eq, Hash, Encode, Decode)]
struct StatsRoute {
    route: RcStr,
    endpoints: Vec<ResolvedVc<Box<dyn Endpoint>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[turbo_tasks::value(shared)]
struct RouteBundleStat {
    route: RcStr,
    first_load_uncompressed_js_bytes: u64,
    /// Relative to the project directory, with forward slashes.
    first_load_chunk_paths: Vec<RcStr>,
}

#[turbo_tasks::value(transparent)]
struct OptionRouteBundleStat(Option<RouteBundleStat>);

/// Computes the stats row of a route from the first load JS chunks of all its endpoints, or
/// `None` if none of them renders a page.
#[turbo_tasks::function]
async fn route_bundle_stat(
    route: StatsRoute,
    client_relative_path: FileSystemPath,
    generate_component_chunks: bool,
    dist_dir: RcStr,
) -> Result<Vc<OptionRouteBundleStat>> {
    let endpoint_chunks = route
        .endpoints
        .iter()
        .map(|&endpoint| {
            endpoint_first_load_js_chunks(
                *endpoint,
                &client_relative_path,
                generate_component_chunks,
            )
        })
        .try_join()
        .await?;
    if endpoint_chunks.iter().all(Option::is_none) {
        return Ok(Vc::cell(None));
    }

    // Chunks are identified by their path in the stats, so dedupe by path.
    let mut chunks: FxIndexMap<RcStr, ResolvedVc<Box<dyn OutputAsset>>> = FxIndexMap::default();
    for (path, chunk) in endpoint_chunks.into_iter().flatten().flatten() {
        chunks.entry(path).or_insert(chunk);
    }
    let sizes = chunks.values().map(|chunk| chunk.size()).try_join().await?;

    Ok(Vc::cell(Some(RouteBundleStat {
        route: route.route,
        // Missing files are not counted.
        first_load_uncompressed_js_bytes: sizes.iter().filter_map(|size| **size).sum(),
        first_load_chunk_paths: chunks
            .into_keys()
            .map(|path| project_relative_chunk_path(&dist_dir, &path))
            .collect(),
    })))
}

/// The route bundle stats file of a production build.
#[turbo_tasks::value]
pub struct RouteBundleStatsAsset {
    path: FileSystemPath,
    project: ResolvedVc<Project>,
    app_dir_only: bool,
}

#[turbo_tasks::value_impl]
impl Asset for RouteBundleStatsAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let project = self.project;
        let entrypoints = project.entrypoints().await?;
        let client_relative_path = project.client_relative_path().owned().await?;
        let generate_component_chunks = *project
            .next_config()
            .turbopack_generate_component_chunks()
            .await?;
        let node_root = project.node_root().owned().await?;
        let project_dir = project
            .output_fs()
            .root()
            .await?
            .join(&project.project_path().await?.path)?;
        let dist_dir = project_dir
            .get_relative_path_to(&node_root)
            .context("the dist dir must be on the output file system")?;

        let pages_app_endpoint = entrypoints.pages_app_endpoint;
        let mut routes = Vec::new();
        for (pathname, route) in entrypoints.routes.iter() {
            let endpoints = match route {
                Route::Page { .. } | Route::PageApi { .. }
                    if self.app_dir_only
                        || matches!(pathname.as_str(), "/_app" | "/_document" | "/_error") =>
                {
                    continue;
                }
                Route::Page { html_endpoint, .. } => vec![*html_endpoint, pages_app_endpoint],
                // API routes only load the `/_app` chunks.
                Route::PageApi { .. } => vec![pages_app_endpoint],
                Route::AppPage(_)
                    if matches!(pathname.as_str(), "/favicon.ico" | "/_global-error") =>
                {
                    continue;
                }
                Route::AppPage(pages) => pages.iter().map(|page| page.html_endpoint).collect(),
                Route::AppRoute { .. } | Route::AppGoRoute { .. } | Route::Conflict => continue,
            };
            routes.push(StatsRoute {
                route: pathname.clone(),
                endpoints,
            });
        }

        let rows = routes
            .into_iter()
            .map(|route| {
                route_bundle_stat(
                    route,
                    client_relative_path.clone(),
                    generate_component_chunks,
                    dist_dir.clone(),
                )
            })
            .try_join()
            .await?;
        let mut rows = rows
            .iter()
            .filter_map(|row| row.as_ref())
            .collect::<Vec<_>>();
        rows.sort_by(|a, b| {
            b.first_load_uncompressed_js_bytes
                .cmp(&a.first_load_uncompressed_js_bytes)
                .then_with(|| a.route.cmp(&b.route))
        });

        let content = serde_json::to_string_pretty(&rows)?;
        Ok(AssetContent::File(FileContent::Content(content.into()).resolved_cell()).cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for RouteBundleStatsAsset {}

#[turbo_tasks::value_impl]
impl OutputAsset for RouteBundleStatsAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

/// Returns the route bundle stats asset in production builds, nothing otherwise.
#[turbo_tasks::function]
pub async fn route_bundle_stats_asset_if_enabled(
    project: ResolvedVc<Project>,
    app_dir_only: bool,
) -> Result<Vc<OutputAssets>> {
    if !project.next_mode().await?.is_production() {
        return Ok(Vc::cell(vec![]));
    }
    let path = project
        .node_root()
        .await?
        .join("diagnostics/route-bundle-stats.json")?;
    let asset = RouteBundleStatsAsset {
        path,
        project,
        app_dir_only,
    }
    .resolved_cell();
    Ok(Vc::cell(vec![ResolvedVc::upcast(asset)]))
}

/// The path of a chunk relative to the project directory, with forward slashes.
fn project_relative_chunk_path(dist_dir: &str, client_relative_path: &str) -> RcStr {
    if dist_dir.is_empty() || dist_dir == "." {
        client_relative_path.into()
    } else {
        format!("{dist_dir}/{client_relative_path}").into()
    }
}
