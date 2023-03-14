use std::{
    collections::HashMap,
    env::current_dir,
    path::{PathBuf, MAIN_SEPARATOR},
};

use anyhow::{anyhow, Context, Result};
use dunce::canonicalize;
use next_core::{
    env::load_env,
    mode::NextMode,
    next_config::{load_next_config, NextConfigVc},
    pages_structure::find_pages_structure,
    turbopack::core::chunk::{ChunkingContext, EvaluatableAssetsVc},
};
use serde::Serialize;
use turbo_binding::{
    turbo::tasks_fs::{DiskFileSystemVc, FileContent, FileSystem, FileSystemVc},
    turbopack::{
        cli_utils::issue::{ConsoleUiVc, LogOptions},
        core::{
            asset::{Asset, AssetVc, AssetsVc},
            environment::ServerAddrVc,
            issue::{IssueReporter, IssueReporterVc, IssueSeverity, IssueVc},
            virtual_fs::VirtualFileSystemVc,
        },
        dev::DevChunkingContextVc,
        node::{
            all_assets_from_entries, all_assets_from_entry, execution_context::ExecutionContextVc,
        },
        turbopack::evaluate_context::node_build_environment,
    },
};
use turbo_tasks::{
    CollectiblesSource, CompletionVc, RawVc, TransientInstance, TransientValue, TryJoinIterExt,
    Value, ValueToString,
};

use crate::{build_options::BuildOptions, next_pages::page_chunks::get_page_chunks};

#[turbo_tasks::function]
pub(crate) async fn next_build(options: TransientInstance<BuildOptions>) -> Result<CompletionVc> {
    let debug = std::env::var("TURBOPACK_DEBUG").is_ok();

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
        log_level: options
            .log_level
            .map(|l| l.0)
            .unwrap_or(IssueSeverity::Warning),
    };

    let issue_reporter: IssueReporterVc =
        ConsoleUiVc::new(TransientInstance::new(log_options)).into();
    let node_fs = node_fs(&project_root, issue_reporter);
    let node_root = node_fs.root().join(".next");
    let client_fs = client_fs(&project_root, issue_reporter);
    let client_root = client_fs.root().join(".next");
    // TODO(alexkirsz) This should accept a URL for assetPrefix.
    let client_public_fs = VirtualFileSystemVc::new();
    let client_public_root = client_public_fs.root();
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
    let next_config = load_next_config(
        execution_context.with_layer("next_config"),
        Value::new(NextMode::Build),
    );

    let pages_structure = find_pages_structure(project_root, next_router_root, next_config);

    let page_chunks = get_page_chunks(
        pages_structure,
        project_root,
        execution_context,
        node_root,
        client_root,
        env,
        &browserslist_query,
        next_config,
        ServerAddrVc::empty(),
    );

    handle_issues(page_chunks, issue_reporter).await?;

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
                let next_router_path = page_chunk.next_router_path.await?;

                // TODO(alexkirsz) Filter out pages.
                match next_router_path.to_string().as_str() {
                    "_app" | "_error" | "_document" | "" | "enterprise" | "404" | "other" => {}
                    _ => {
                        return Ok(None);
                    }
                }

                if debug {
                    eprintln!("next_router_path: {:?}", next_router_path.to_string());
                }

                // We can't use partitioning for client assets as client assets might be created
                // by non-client assets referred from client assets.
                // Although this should perhaps be enforced by Turbopack semantics.
                let all_node_assets: Vec<_> = all_assets_from_entry(page_chunk.node_chunk)
                    .await?
                    .iter()
                    .map(|asset| {
                        let node_root = node_root.clone();
                        async move {
                            Ok((
                                asset.ident().path().await?.is_inside(&*node_root.await?),
                                asset,
                            ))
                        }
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
                    .map(|asset| {
                        let client_root = client_root.clone();
                        async move {
                            Ok((
                                asset.ident().path().await?.is_inside(&*client_root.await?),
                                asset,
                            ))
                        }
                    })
                    .try_join()
                    .await?
                    .into_iter()
                    .filter_map(|(is_inside, asset)| if is_inside { Some(*asset) } else { None })
                    .collect();

                Ok(Some((
                    next_router_path,
                    page_chunk.node_chunk,
                    all_node_assets,
                    client_chunks,
                    all_client_assets,
                )))
            })
            .try_join()
            .await?
            .into_iter()
            .filter_map(|x| x)
            .collect::<Vec<_>>();

        {
            let next_router_root = next_router_root.await?;
            let build_manifest_dir_path = build_manifest_path.parent().await?;
            let pages_manifest_dir_path = pages_manifest_path.parent().await?;

            // TODO(alexkirsz) We want all assets to emit them to the output directory, but
            // we only want runtime assets in the manifest. Furthermore, the pages
            // manifest (server) only wants a single runtime asset, so we need to
            // bundle node assets somewhat.
            for (next_router_path, node_chunk, all_node_assets, client_chunks, all_client_assets) in
                &page_chunks_and_url
            {
                let Some(relative_page_path) = next_router_root.get_path_to(&*next_router_path) else {
                    // TODO(alexkirsz) Not possible.
                    continue;
                };

                if debug {
                    eprintln!("page: {}", next_router_path.to_string(),);
                    eprintln!(
                        "node chunk: {}",
                        node_chunk.ident().path().to_string().await?
                    );
                    eprintln!("client_chunks:",);
                    for chunk in client_chunks.await?.iter() {
                        eprintln!("  - {}", chunk.ident().path().to_string().await?);
                    }
                }

                if debug {
                    eprintln!("all node assets:");
                }
                all_node_assets
                    .into_iter()
                    .map(|asset| async move {
                        if debug {
                            eprintln!("  - {}", asset.ident().path().to_string().await?,);
                        }
                        emit(*asset).await?;
                        Ok(())
                    })
                    .try_join()
                    .await?;

                if debug {
                    eprintln!("all client assets:");
                }

                all_client_assets
                    .into_iter()
                    .map(|asset| async move {
                        if debug {
                            eprintln!(
                                "  - {} ({:?})",
                                asset.ident().path().to_string().await?,
                                asset
                            );
                        }
                        emit(*asset).await?;
                        Ok(())
                    })
                    .try_join()
                    .await?;

                let absolute_page_path = format!("/{relative_page_path}");

                let build_manifest_pages_entry = build_manifest
                    .pages
                    .entry(absolute_page_path.clone())
                    .or_default();
                for chunk in client_chunks.await?.iter() {
                    let chunk_path = chunk.ident().path().await?;
                    if let Some(asset_path) = build_manifest_dir_path.get_path_to(&*chunk_path) {
                        build_manifest_pages_entry.push(asset_path.to_string());
                    }
                }

                let chunk_path = node_chunk.ident().path().await?;
                if let Some(asset_path) = pages_manifest_dir_path.get_path_to(&*chunk_path) {
                    pages_manifest
                        .pages
                        .insert(absolute_page_path, asset_path.to_string());
                }

                // for asset_path in page_asset_paths.iter() {
                //     if let Some(asset_path) =
                // node_root.get_path_to(&*asset_path) {
                //         pages_manifest_entry.push(asset_path);
                //     } else if let Some(asset_path) =
                // server_root.get_path_to(&*asset_path) {
                //         build_manifest_pages_entry.push(asset_path);
                //     }
                // }
            }
        }
        // TODO(alexkirsz) These manifests should be assets.
        let build_manifest = serde_json::to_string_pretty(&build_manifest)?;
        let pages_manifest = serde_json::to_string_pretty(&pages_manifest)?;

        build_manifest_path
            .write(FileContent::Content(build_manifest.into()).cell())
            .await?;
        pages_manifest_path
            .write(FileContent::Content(pages_manifest.into()).cell())
            .await?;

        let middleware_manifest = serde_json::to_string_pretty(&MiddlewaresManifest {
            functions: HashMap::new(),
            sorted_middleware: vec![],
            middleware: HashMap::new(),
            version: 2,
        })?;
        let middleware_manifest_path = node_root.join("server/middleware-manifest.json");
        middleware_manifest_path
            .write(FileContent::Content(middleware_manifest.into()).cell())
            .await?;

        let next_font_manifest = serde_json::to_string_pretty(&NextFontManifest {
            ..Default::default()
        })?;
        let next_font_manifest_path = node_root.join("server/next-font-manifest.json");
        next_font_manifest_path
            .write(FileContent::Content(next_font_manifest.into()).cell())
            .await?;

        let font_manifest = serde_json::to_string_pretty(&FontManifest {
            ..Default::default()
        })?;
        let font_manifest_path = node_root.join("server/font-manifest.json");
        font_manifest_path
            .write(FileContent::Content(font_manifest.into()).cell())
            .await?;

        let app_paths_manifest = serde_json::to_string_pretty(&AppPathsManifest {
            ..Default::default()
        })?;
        let app_paths_manifest_path = node_root.join("server/app-paths-manifest.json");
        app_paths_manifest_path
            .write(FileContent::Content(app_paths_manifest.into()).cell())
            .await?;

        let server_reference_manifest = serde_json::to_string_pretty(&ServerReferenceManifest {
            ..Default::default()
        })?;
        let server_reference_manifest_path =
            node_root.join("server/server-reference-manifest.json");
        server_reference_manifest_path
            .write(FileContent::Content(server_reference_manifest.into()).cell())
            .await?;

        let client_reference_manifest = serde_json::to_string_pretty(&ClientReferenceManifest {
            ..Default::default()
        })?;
        let client_reference_manifest_path =
            node_root.join("server/client-reference-manifest.json");
        client_reference_manifest_path
            .write(FileContent::Content(client_reference_manifest.into()).cell())
            .await?;

        let client_css_reference_manifest =
            serde_json::to_string_pretty(&ClientCssReferenceManifest {
                ..Default::default()
            })?;
        let client_css_reference_manifest_path =
            node_root.join("server/flight-server-css-manifest.json");
        client_css_reference_manifest_path
            .write(FileContent::Content(client_css_reference_manifest.into()).cell())
            .await?;

        let react_loadable_manifest = serde_json::to_string_pretty(&ReactLoadableManifest {
            manifest: HashMap::new(),
        })?;
        let react_loadable_manifest_path = node_root.join("react-loadable-manifest.json");
        react_loadable_manifest_path
            .write(FileContent::Content(react_loadable_manifest.into()).cell())
            .await?;

        let app_build_manifest = serde_json::to_string_pretty(&AppBuildManifest {
            ..Default::default()
        })?;
        let app_build_manifest_path = node_root.join("app-build-manifest.json");
        app_build_manifest_path
            .write(FileContent::Content(app_build_manifest.into()).cell())
            .await?;

        if let Some(build_id) = &options.build_id {
            if debug {
                eprintln!("Writing _ssgManifest.js for build id {}", build_id);
            }

            let ssg_manifest_path = node_root.join(&format!("static/{build_id}/_ssgManifest.js"));
            ssg_manifest_path
                .write(
                    FileContent::Content(
                        "self.__SSG_MANIFEST=new \
                         Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()"
                            .into(),
                    )
                    .cell(),
                )
                .await?;
        }
    }

    // let app_structure = find_app_structure(project_root, client_root,
    // next_config); if let Some(app_structure) = &*app_structure.await? {
    //     build_app(*app_structure, execution_context, next_config).await?;
    // }

    Ok(CompletionVc::immutable())
}

#[derive(Serialize, Default)]
struct PagesManifest {
    #[serde(flatten)]
    pages: HashMap<String, String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct BuildManifest {
    dev_files: Vec<String>,
    amp_dev_files: Vec<String>,
    polyfill_files: Vec<String>,
    low_priority_files: Vec<String>,
    root_main_files: Vec<String>,
    pages: HashMap<String, Vec<String>>,
    amp_first_pages: Vec<String>,
}
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct MiddlewaresManifest {
    sorted_middleware: Vec<()>,
    middleware: HashMap<String, ()>,
    functions: HashMap<String, ()>,
    version: u32,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ReactLoadableManifest {
    #[serde(flatten)]
    manifest: HashMap<String, ReactLoadableManifestEntry>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ReactLoadableManifestEntry {
    id: u32,
    files: Vec<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct NextFontManifest {
    pages: HashMap<String, Vec<String>>,
    app: HashMap<String, Vec<String>>,
    app_using_size_adjust: bool,
    pages_using_size_adjust: bool,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppPathsManifest {
    #[serde(flatten)]
    edge_server_app_paths: PagesManifest,
    #[serde(flatten)]
    node_server_app_paths: PagesManifest,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ServerReferenceManifest {
    #[serde(flatten)]
    server_actions: ActionManifest,
    #[serde(flatten)]
    edge_server_actions: ActionManifest,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ActionManifest {
    #[serde(flatten)]
    actions: HashMap<String, ActionManifestEntry>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ActionManifestEntry {
    workers: HashMap<String, ActionManifestWorkerEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
enum ActionManifestWorkerEntry {
    String(String),
    Number(f64),
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClientReferenceManifest {
    client_modules: ManifestNode,
    ssr_module_mapping: HashMap<String, ManifestNode>,
    #[serde(rename = "edgeSSRModuleMapping")]
    edge_ssr_module_mapping: HashMap<String, ManifestNode>,
    css_files: HashMap<String, Vec<String>>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClientCssReferenceManifest {
    css_imports: HashMap<String, Vec<String>>,
    css_modules: HashMap<String, Vec<String>>,
}
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ManifestNode {
    #[serde(flatten)]
    module_exports: HashMap<String, ManifestNodeEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ManifestNodeEntry {
    id: ModuleId,
    name: String,
    chunks: Vec<String>,
    r#async: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
enum ModuleId {
    String(String),
    Number(f64),
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct FontManifest(Vec<FontManifestEntry>);

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct FontManifestEntry {
    url: String,
    content: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AppBuildManifest {
    pages: HashMap<String, Vec<String>>,
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
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn node_fs(node_root: &str, issue_reporter: IssueReporterVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("node".to_string(), node_root.to_string());
    handle_issues(disk_fs, issue_reporter).await?;
    disk_fs.await?.start_watching()?;
    Ok(disk_fs.into())
}

#[turbo_tasks::function]
async fn client_fs(client_root: &str, issue_reporter: IssueReporterVc) -> Result<FileSystemVc> {
    let disk_fs = DiskFileSystemVc::new("client".to_string(), client_root.to_string());
    handle_issues(disk_fs, issue_reporter).await?;
    disk_fs.await?.start_watching()?;
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
