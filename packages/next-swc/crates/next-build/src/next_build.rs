use std::{
    collections::{HashMap, HashSet},
    env::current_dir,
    path::{PathBuf, MAIN_SEPARATOR},
};

use anyhow::{anyhow, Context, Result};
use dunce::canonicalize;
use next_core::{
    self, next_config::load_next_config, pages_structure::find_pages_structure,
    turbopack::ecmascript::utils::StringifyJs, url_node::get_sorted_routes,
};
use serde::Serialize;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    CollectiblesSource, CompletionVc, RawVc, TransientInstance, TransientValue, TryJoinIterExt,
    ValueToString,
};
use turbopack_binding::{
    turbo::tasks_fs::{DiskFileSystemVc, FileContent, FileSystem, FileSystemPathVc, FileSystemVc},
    turbopack::{
        cli_utils::issue::{ConsoleUiVc, LogOptions},
        core::{
            asset::{Asset, AssetVc, AssetsVc},
            environment::ServerAddrVc,
            issue::{IssueReporter, IssueReporterVc, IssueSeverity, IssueVc},
            reference::AssetReference,
            virtual_fs::VirtualFileSystemVc,
        },
        dev::DevChunkingContextVc,
        env::dotenv::load_env,
        node::execution_context::ExecutionContextVc,
        turbopack::evaluate_context::node_build_environment,
    },
};

use crate::{
    build_options::{BuildContext, BuildOptions},
    manifests::{
        AppBuildManifest, AppPathsManifest, BuildManifest, ClientBuildManifest,
        ClientCssReferenceManifest, ClientReferenceManifest, FontManifest, MiddlewaresManifest,
        NextFontManifest, PagesManifest, ReactLoadableManifest, ServerReferenceManifest,
    },
    next_pages::page_chunks::get_page_chunks,
};

#[turbo_tasks::function]
pub(crate) async fn next_build(options: TransientInstance<BuildOptions>) -> Result<CompletionVc> {
    let project_root = options
        .dir
        .as_ref()
        .map(canonicalize)
        .unwrap_or_else(current_dir)
        .context("project directory can't be found")?
        .to_str()
        .context("project directory contains invalid characters")?
        .to_string();

    let workspace_root = if let Some(root) = options.root.as_ref() {
        canonicalize(root)
            .context("root directory can't be found")?
            .to_str()
            .context("root directory contains invalid characters")?
            .to_string()
    } else {
        project_root.clone()
    };

    let browserslist_query = "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                              versions, last 1 Edge versions";

    let log_options = LogOptions {
        project_dir: PathBuf::from(project_root.clone()),
        current_dir: current_dir().unwrap(),
        show_all: options.show_all,
        log_detail: options.log_detail,
        log_level: options.log_level.unwrap_or(IssueSeverity::Warning),
    };

    let issue_reporter: IssueReporterVc =
        ConsoleUiVc::new(TransientInstance::new(log_options)).into();
    let node_fs = node_fs(&project_root, issue_reporter);
    let node_root = node_fs.root().join(".next");
    let client_fs = client_fs(&project_root, issue_reporter);
    let client_root = client_fs.root().join(".next");
    // TODO(alexkirsz) This should accept a URL for assetPrefix.
    // let client_public_fs = VirtualFileSystemVc::new();
    // let client_public_root = client_public_fs.root();
    let workspace_fs = workspace_fs(&workspace_root, issue_reporter);
    let project_relative = project_root.strip_prefix(&workspace_root).unwrap();
    let project_relative = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/");
    let project_root = workspace_fs.root().join(&project_relative);

    let next_router_fs = VirtualFileSystemVc::new().as_file_system();
    let next_router_root = next_router_fs.root();

    let build_chunking_context = DevChunkingContextVc::builder(
        project_root,
        node_root,
        node_root.join("chunks"),
        node_root.join("assets"),
        node_build_environment(),
    )
    .build();

    let env = load_env(project_root);
    // TODO(alexkirsz) Should this accept `node_root` at all?
    let execution_context = ExecutionContextVc::new(project_root, build_chunking_context, env);
    let next_config = load_next_config(execution_context.with_layer("next_config"));

    let pages_structure = find_pages_structure(project_root, next_router_root, next_config);

    let page_chunks = get_page_chunks(
        pages_structure,
        next_router_root,
        project_root,
        execution_context,
        node_root,
        client_root,
        env,
        browserslist_query,
        next_config,
        ServerAddrVc::empty(),
    );

    handle_issues(page_chunks, issue_reporter).await?;

    let filter_pages = std::env::var("NEXT_TURBO_FILTER_PAGES");
    let filter_pages = filter_pages
        .as_ref()
        .ok()
        .map(|filter| filter.split(',').collect::<HashSet<_>>());
    let filter_pages = filter_pages.as_ref();

    {
        // Client manifest.
        let mut build_manifest: BuildManifest = Default::default();
        // Server manifest.
        let mut pages_manifest: PagesManifest = Default::default();

        let build_manifest_path = client_root.join("build-manifest.json");
        let pages_manifest_path = node_root.join("server/pages-manifest.json");

        let page_chunks_and_url = page_chunks
            .await?
            .iter()
            .map(|page_chunk| async move {
                let page_chunk = page_chunk.await?;
                let pathname = page_chunk.pathname.await?;

                if let Some(filter_pages) = &filter_pages {
                    if !filter_pages.contains(pathname.as_str()) {
                        return Ok(None);
                    }
                }

                // We can't use partitioning for client assets as client assets might be created
                // by non-client assets referred from client assets.
                // Although this should perhaps be enforced by Turbopack semantics.
                let all_node_assets: Vec<_> = all_assets_from_entry(page_chunk.node_chunk)
                    .await?
                    .iter()
                    .map(|asset| async move {
                        Ok((
                            asset.ident().path().await?.is_inside(&*node_root.await?),
                            asset,
                        ))
                    })
                    .try_join()
                    .await?
                    .into_iter()
                    .filter_map(|(is_inside, asset)| if is_inside { Some(*asset) } else { None })
                    .collect();

                let client_chunks = page_chunk.client_chunks;

                // We can't use partitioning for client assets as client assets might be created
                // by non-client assets referred from client assets.
                // Although this should perhaps be enforced by Turbopack semantics.
                let all_client_assets: Vec<_> = all_assets_from_entries(client_chunks)
                    .await?
                    .iter()
                    .map(|asset| async move {
                        Ok((
                            asset.ident().path().await?.is_inside(&*client_root.await?),
                            asset,
                        ))
                    })
                    .try_join()
                    .await?
                    .into_iter()
                    .filter_map(|(is_inside, asset)| if is_inside { Some(*asset) } else { None })
                    .collect();

                Ok(Some((
                    pathname,
                    page_chunk.node_chunk,
                    all_node_assets,
                    client_chunks,
                    all_client_assets,
                )))
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();

        {
            let build_manifest_dir_path = build_manifest_path.parent().await?;
            let pages_manifest_dir_path = pages_manifest_path.parent().await?;

            let mut deduplicated_node_assets = HashMap::new();
            let mut deduplicated_client_assets = HashMap::new();

            // TODO(alexkirsz) We want all assets to emit them to the output directory, but
            // we only want runtime assets in the manifest. Furthermore, the pages
            // manifest (server) only wants a single runtime asset, so we need to
            // bundle node assets somewhat.
            for (pathname, node_chunk, all_node_assets, client_chunks, all_client_assets) in
                page_chunks_and_url
            {
                tracing::debug!("pathname: {}", pathname.to_string(),);
                tracing::debug!(
                    "node chunk: {}",
                    node_chunk.ident().path().to_string().await?
                );
                tracing::debug!(
                    "client_chunks:\n{}",
                    client_chunks
                        .await?
                        .iter()
                        .map(|chunk| async move {
                            Ok(format!("  - {}", chunk.ident().path().to_string().await?))
                        })
                        .try_join()
                        .await?
                        .join("\n")
                );

                // TODO(alexkirsz) Deduplication should not happen at this level, but
                // right now we have chunks with the same path being generated
                // from different entrypoints, and writing them multiple times causes
                // an infinite invalidation loop.
                deduplicated_node_assets.extend(
                    all_node_assets
                        .into_iter()
                        .map(|asset| async move { Ok((asset.ident().path().to_string().await?, asset)) })
                        .try_join()
                        .await?,
                );
                deduplicated_client_assets.extend(
                    all_client_assets
                        .into_iter()
                        .map(|asset| async move { Ok((asset.ident().path().to_string().await?, asset)) })
                        .try_join()
                        .await?
                );

                let build_manifest_pages_entry = build_manifest
                    .pages
                    .entry(pathname.clone_value())
                    .or_default();
                for chunk in client_chunks.await?.iter() {
                    let chunk_path = chunk.ident().path().await?;
                    if let Some(asset_path) = build_manifest_dir_path.get_path_to(&chunk_path) {
                        build_manifest_pages_entry.push(asset_path.to_string());
                    }
                }

                let chunk_path = node_chunk.ident().path().await?;
                if let Some(asset_path) = pages_manifest_dir_path.get_path_to(&chunk_path) {
                    pages_manifest
                        .pages
                        .insert(pathname.clone_value(), asset_path.to_string());
                }
            }

            tracing::debug!(
                "all node assets: {}",
                deduplicated_node_assets
                    .values()
                    .map(|asset| async move {
                        Ok(format!("  - {}", asset.ident().path().to_string().await?))
                    })
                    .try_join()
                    .await?
                    .join("\n")
            );
            deduplicated_node_assets
                .into_values()
                .map(|asset| async move {
                    emit(asset).await?;
                    Ok(())
                })
                .try_join()
                .await?;

            tracing::debug!(
                "all client assets: {}",
                deduplicated_client_assets
                    .values()
                    .map(|asset| async move {
                        Ok(format!("  - {}", asset.ident().path().to_string().await?))
                    })
                    .try_join()
                    .await?
                    .join("\n")
            );
            deduplicated_client_assets
                .into_values()
                .map(|asset| async move {
                    emit(asset).await?;
                    Ok(())
                })
                .try_join()
                .await?;
        }

        write_placeholder_manifest(
            &MiddlewaresManifest::default(),
            node_root,
            "server/middleware-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &NextFontManifest::default(),
            node_root,
            "server/next-font-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &FontManifest::default(),
            node_root,
            "server/font-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &AppPathsManifest::default(),
            node_root,
            "server/app-paths-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &ServerReferenceManifest::default(),
            node_root,
            "server/server-reference-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &ClientReferenceManifest::default(),
            node_root,
            "server/client-reference-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &ClientCssReferenceManifest::default(),
            node_root,
            "server/flight-server-css-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &ReactLoadableManifest::default(),
            node_root,
            "react-loadable-manifest.json",
        )
        .await?;
        write_placeholder_manifest(
            &AppBuildManifest::default(),
            node_root,
            "app-build-manifest.json",
        )
        .await?;

        if let Some(build_context) = &options.build_context {
            let BuildContext { build_id, rewrites } = build_context;

            tracing::debug!("writing _ssgManifest.js for build id: {}", build_id);

            let ssg_manifest_path = format!("static/{build_id}/_ssgManifest.js");

            let ssg_manifest_fs_path = node_root.join(&ssg_manifest_path);
            ssg_manifest_fs_path
                .write(
                    FileContent::Content(
                        "self.__SSG_MANIFEST=new \
                         Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()"
                            .into(),
                    )
                    .cell(),
                )
                .await?;

            build_manifest.low_priority_files.push(ssg_manifest_path);

            let sorted_pages =
                get_sorted_routes(&pages_manifest.pages.keys().cloned().collect::<Vec<_>>())?;

            let app_dependencies: HashSet<&str> = pages_manifest
                .pages
                .get("/_app")
                .iter()
                .map(|s| s.as_str())
                .collect();
            let mut pages = HashMap::new();

            for page in &sorted_pages {
                if page == "_app" {
                    continue;
                }

                let dependencies = pages_manifest
                    .pages
                    .get(page)
                    .iter()
                    .map(|dep| dep.as_str())
                    .filter(|dep| !app_dependencies.contains(*dep))
                    .collect::<Vec<_>>();

                if !dependencies.is_empty() {
                    pages.insert(page.to_string(), dependencies);
                }
            }

            let client_manifest = ClientBuildManifest {
                rewrites,
                sorted_pages: &sorted_pages,
                pages,
            };

            let client_manifest_path = format!("static/{build_id}/_buildManifest.js");

            let client_manifest_fs_path = node_root.join(&client_manifest_path);
            client_manifest_fs_path
                .write(
                    FileContent::Content(
                        format!(
                            "self.__BUILD_MANIFEST={};self.__BUILD_MANIFEST_CB && \
                             self.__BUILD_MANIFEST_CB()",
                            StringifyJs(&client_manifest)
                        )
                        .into(),
                    )
                    .cell(),
                )
                .await?;

            build_manifest.low_priority_files.push(client_manifest_path);
        }

        // TODO(alexkirsz) These manifests should be assets.
        let build_manifest_contents = serde_json::to_string_pretty(&build_manifest)?;
        let pages_manifest_contents = serde_json::to_string_pretty(&pages_manifest)?;

        build_manifest_path
            .write(FileContent::Content(build_manifest_contents.into()).cell())
            .await?;
        pages_manifest_path
            .write(FileContent::Content(pages_manifest_contents.into()).cell())
            .await?;
    }

    Ok(CompletionVc::immutable())
}

#[turbo_tasks::function]
fn emit(asset: AssetVc) -> CompletionVc {
    asset.content().write(asset.ident().path())
}

#[turbo_tasks::function]
async fn workspace_fs(
    workspace_root: &str,
    issue_reporter: IssueReporterVc,
) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("workspace".to_string(), workspace_root.to_string());
    handle_issues(disk_fs, issue_reporter).await?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn node_fs(node_root: &str, issue_reporter: IssueReporterVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("node".to_string(), node_root.to_string());
    handle_issues(disk_fs, issue_reporter).await?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn client_fs(client_root: &str, issue_reporter: IssueReporterVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("client".to_string(), client_root.to_string());
    handle_issues(disk_fs, issue_reporter).await?;
    Ok(disk_fs.into())
}

async fn handle_issues<T: Into<RawVc> + CollectiblesSource + Copy>(
    source: T,
    issue_reporter: IssueReporterVc,
) -> Result<()> {
    let issues = IssueVc::peek_issues_with_path(source)
        .await?
        .strongly_consistent()
        .await?;

    let has_fatal = issue_reporter.report_issues(
        TransientInstance::new(issues.clone()),
        TransientValue::new(source.into()),
    );

    if *has_fatal.await? {
        Err(anyhow!("Fatal issue(s) occurred"))
    } else {
        Ok(())
    }
}

/// Walks the asset graph from a single asset and collect all referenced assets.
#[turbo_tasks::function]
async fn all_assets_from_entry(entry: AssetVc) -> Result<AssetsVc> {
    Ok(AssetsVc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit([entry], get_referenced_assets)
            .await
            .completed()?
            .into_inner()
            .into_reverse_topological()
            .collect(),
    ))
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
async fn all_assets_from_entries(entries: AssetsVc) -> Result<AssetsVc> {
    Ok(AssetsVc::cell(
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
async fn get_referenced_assets(asset: AssetVc) -> Result<impl Iterator<Item = AssetVc> + Send> {
    Ok(asset
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
        .flatten())
}

async fn write_placeholder_manifest<T>(
    manifest: &T,
    node_root: FileSystemPathVc,
    path: &str,
) -> Result<()>
where
    T: Serialize,
{
    let json = serde_json::to_string_pretty(manifest)?;
    let node_path = node_root.join(path);
    node_path
        .write(FileContent::Content(json.into()).cell())
        .await?;
    Ok(())
}
