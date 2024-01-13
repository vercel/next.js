use std::{
    collections::{HashMap, HashSet},
    env::current_dir,
    path::{PathBuf, MAIN_SEPARATOR},
};

use anyhow::{Context, Result};
use dunce::canonicalize;
use next_core::{
    mode::NextMode,
    next_app::get_app_client_references_chunks,
    next_client::{get_client_chunking_context, get_client_compile_time_info},
    next_client_reference::{ClientReferenceGraph, ClientReferenceType},
    next_config::load_next_config,
    next_dynamic::NextDynamicEntries,
    next_manifests::{
        AppBuildManifest, AppPathsManifest, BuildManifest, ClientBuildManifest, FontManifest,
        MiddlewaresManifest, NextFontManifest, PagesManifest, ReactLoadableManifest,
        ServerReferenceManifest,
    },
    next_server::{get_server_chunking_context, get_server_compile_time_info},
    url_node::get_sorted_routes,
    util::NextRuntime,
    {self},
};
use serde::Serialize;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    Completion, Completions, TransientInstance, TryJoinIterExt, Vc,
};
use turbopack_binding::{
    turbo::tasks_fs::{rebase, DiskFileSystem, FileContent, FileSystem, FileSystemPath},
    turbopack::{
        cli_utils::issue::{ConsoleUi, LogOptions},
        core::{
            asset::Asset,
            environment::ServerAddr,
            ident::AssetIdent,
            issue::{handle_issues, IssueReporter, IssueSeverity},
            output::{OutputAsset, OutputAssets},
            virtual_fs::VirtualFileSystem,
        },
        dev::DevChunkingContext,
        ecmascript::utils::StringifyJs,
        env::dotenv::load_env,
        node::execution_context::ExecutionContext,
        turbopack::evaluate_context::node_build_environment,
    },
};

use crate::{
    build_options::{BuildContext, BuildOptions},
    next_app::app_entries::{compute_app_entries_chunks, get_app_entries},
    next_pages::page_entries::{compute_page_entries_chunks, get_page_entries},
};

// TODO this should be Error, but we need to fix the errors happening first
static MIN_FAILING_SEVERITY: IssueSeverity = IssueSeverity::Fatal;

#[turbo_tasks::function]
pub(crate) async fn next_build(options: TransientInstance<BuildOptions>) -> Result<Vc<Completion>> {
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
                              versions, last 1 Edge versions"
        .to_string();

    let log_options = LogOptions {
        project_dir: PathBuf::from(project_root.clone()),
        current_dir: current_dir().unwrap(),
        show_all: options.show_all,
        log_detail: options.log_detail,
        log_level: options.log_level.unwrap_or(IssueSeverity::Warning),
    };

    let dist_dir = options
        .dist_dir
        .as_ref()
        .map_or_else(|| ".next".to_string(), |d| d.to_string());

    let issue_reporter: Vc<Box<dyn IssueReporter>> =
        Vc::upcast(ConsoleUi::new(TransientInstance::new(log_options)));
    let node_fs = node_fs(project_root.clone(), issue_reporter);
    let node_root = node_fs.root().join(dist_dir.clone());
    let client_fs = client_fs(project_root.clone(), issue_reporter);
    let client_root = client_fs.root().join(dist_dir);
    // TODO(alexkirsz) This should accept a URL for assetPrefix.
    // let client_public_fs = VirtualFileSystem::new();
    // let client_public_root = client_public_fs.root();
    let workspace_fs = workspace_fs(workspace_root.clone(), issue_reporter);
    let project_relative = project_root.strip_prefix(&workspace_root).unwrap();
    let project_relative = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/");
    let project_root = workspace_fs.root().join(project_relative);

    let node_root_ref = node_root.await?;

    let node_execution_chunking_context = Vc::upcast(
        DevChunkingContext::builder(
            project_root,
            node_root,
            node_root.join("chunks".to_string()),
            node_root.join("assets".to_string()),
            node_build_environment(),
        )
        .build(),
    );

    let env = load_env(project_root);

    let execution_context =
        ExecutionContext::new(project_root, node_execution_chunking_context, env);
    let next_config = load_next_config(execution_context);

    let mode = NextMode::Build;

    let client_define_env = Vc::cell(options.define_env.client.iter().cloned().collect());
    let client_compile_time_info =
        get_client_compile_time_info(browserslist_query, client_define_env);

    let server_define_env = Vc::cell(options.define_env.nodejs.iter().cloned().collect());
    let server_compile_time_info =
        get_server_compile_time_info(env, ServerAddr::empty(), server_define_env);

    // TODO(alexkirsz) Pages should build their own routes, outside of a FS.
    let next_router_fs = Vc::upcast::<Box<dyn FileSystem>>(VirtualFileSystem::new());
    let next_router_root = next_router_fs.root();
    let page_entries = get_page_entries(
        next_router_root,
        project_root,
        execution_context,
        client_compile_time_info,
        server_compile_time_info,
        next_config,
    );

    let app_entries = get_app_entries(
        project_root,
        execution_context,
        client_compile_time_info,
        server_compile_time_info,
        next_config,
    );

    handle_issues(
        page_entries,
        issue_reporter,
        MIN_FAILING_SEVERITY.cell(),
        None,
        None,
    )
    .await?;
    handle_issues(
        app_entries,
        issue_reporter,
        MIN_FAILING_SEVERITY.cell(),
        None,
        None,
    )
    .await?;

    let page_entries = page_entries.await?;
    let app_entries = app_entries.await?;

    let app_rsc_entries: Vec<_> = app_entries
        .entries
        .iter()
        .copied()
        .map(|entry| async move { Ok(entry.await?.rsc_entry) })
        .try_join()
        .await?;

    let app_client_references = ClientReferenceGraph::new(Vc::cell(
        app_rsc_entries.iter().copied().map(Vc::upcast).collect(),
    ));

    // The same client reference can occur from two different server components.
    // Here, we're only interested in deduped client references.
    let app_client_reference_tys = app_client_references.types();

    let app_ssr_entries: Vec<_> = app_client_reference_tys
        .await?
        .iter()
        .map(|client_reference_ty| async move {
            let ClientReferenceType::EcmascriptClientReference(entry) = client_reference_ty else {
                return Ok(None);
            };

            Ok(Some(entry.await?.ssr_module))
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect();

    let page_ssr_entries = page_entries
        .entries
        .iter()
        .copied()
        .map(|entry| async move { Ok(entry.await?.ssr_module) })
        .try_join()
        .await?;

    let app_node_entries: Vec<_> = app_ssr_entries
        .iter()
        .copied()
        .chain(app_rsc_entries.iter().copied())
        .collect();

    let all_node_entries: Vec<_> = page_ssr_entries
        .iter()
        .copied()
        .chain(app_node_entries.iter().copied())
        .collect();

    // TODO(alexkirsz) Handle dynamic entries and dynamic chunks.
    let _dynamic_entries = NextDynamicEntries::from_entries(Vc::cell(
        all_node_entries.iter().copied().map(Vc::upcast).collect(),
    ))
    .await?;

    // TODO(alexkirsz) At this point, we have access to the whole module graph via
    // the entries. This is where we should compute unique module ids and optimized
    // chunks.

    // CHUNKING

    // This ensures that the _next prefix is properly stripped from all client paths
    // in manifests. It will be added back on the client through the chunk_base_path
    // mechanism.
    let next_config_ref = next_config.await?;
    let client_relative_path = client_root.join(format!(
        "{}/_next",
        next_config_ref
            .base_path
            .clone()
            .unwrap_or_else(|| "".to_string()),
    ));
    let client_relative_path_ref = client_relative_path.await?;

    let client_chunking_context = get_client_chunking_context(
        project_root,
        client_relative_path,
        next_config.computed_asset_prefix(),
        client_compile_time_info.environment(),
        mode,
    );

    let server_chunking_context = get_server_chunking_context(
        project_root,
        node_root,
        client_relative_path,
        next_config.computed_asset_prefix(),
        server_compile_time_info.environment(),
    );
    let mut all_chunks = vec![];

    let mut build_manifest: BuildManifest = Default::default();
    let build_manifest_path = client_root.join("build-manifest.json".to_string());

    // PAGE CHUNKING

    let mut pages_manifest: PagesManifest = Default::default();
    let pages_manifest_path = node_root.join("server/pages-manifest.json".to_string());
    let pages_manifest_dir_path = pages_manifest_path.parent().await?;

    compute_page_entries_chunks(
        &page_entries,
        client_chunking_context,
        server_chunking_context,
        node_root,
        &pages_manifest_dir_path,
        &client_relative_path_ref,
        &mut pages_manifest,
        &mut build_manifest,
        &mut all_chunks,
    )
    .await?;

    // APP CHUNKING

    let mut app_build_manifest = AppBuildManifest::default();
    let app_build_manifest_path = client_root.join("app-build-manifest.json".to_string());

    let mut app_paths_manifest = AppPathsManifest::default();
    let app_paths_manifest_path = node_root.join("server/app-paths-manifest.json".to_string());
    let app_paths_manifest_dir_path = app_paths_manifest_path.parent().await?;

    // APP CLIENT REFERENCES CHUNKING

    let app_client_references_chunks = get_app_client_references_chunks(
        AssetIdent::from_path(project_root.join("next-client-components.js".to_string())),
        app_client_reference_tys,
        client_chunking_context,
        // TODO(WEB-1824): add edge support
        Vc::upcast(server_chunking_context),
    );
    let app_client_references_chunks_ref = app_client_references_chunks.await?;

    for app_client_reference_chunks in app_client_references_chunks_ref.values() {
        let client_chunks = &app_client_reference_chunks.client_chunks.await?;
        let ssr_chunks = &app_client_reference_chunks.ssr_chunks.await?;
        all_chunks.extend(client_chunks.iter().copied());
        all_chunks.extend(ssr_chunks.iter().copied());
    }

    // APP RSC CHUNKING
    // TODO(alexkirsz) Do some of that in parallel with the above.

    compute_app_entries_chunks(
        next_config,
        &app_entries,
        app_client_references,
        app_client_references_chunks,
        server_chunking_context,
        client_chunking_context,
        Vc::upcast(server_chunking_context),
        node_root,
        client_relative_path,
        &app_paths_manifest_dir_path,
        &mut app_build_manifest,
        &mut build_manifest,
        &mut app_paths_manifest,
        &mut all_chunks,
        // TODO(WEB-1824): add edge support
        NextRuntime::NodeJs,
    )
    .await?;

    let mut completions = vec![];

    if let Some(build_context) = &options.build_context {
        let BuildContext { build_id, rewrites } = build_context;

        let ssg_manifest_path = format!("static/{build_id}/_ssgManifest.js");

        let ssg_manifest_fs_path = node_root.join(ssg_manifest_path.clone());
        completions.push(
            ssg_manifest_fs_path.write(
                FileContent::Content(
                    "self.__SSG_MANIFEST=new Set;self.__SSG_MANIFEST_CB&&self.__SSG_MANIFEST_CB()"
                        .into(),
                )
                .cell(),
            ),
        );

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

        let client_manifest_fs_path = node_root.join(client_manifest_path.clone());
        completions.push(
            client_manifest_fs_path.write(
                FileContent::Content(
                    format!(
                        "self.__BUILD_MANIFEST={};self.__BUILD_MANIFEST_CB && \
                         self.__BUILD_MANIFEST_CB()",
                        StringifyJs(&client_manifest)
                    )
                    .into(),
                )
                .cell(),
            ),
        );

        build_manifest.low_priority_files.push(client_manifest_path);
    }

    completions.push(write_manifest(pages_manifest, pages_manifest_path)?);
    completions.push(write_manifest(app_build_manifest, app_build_manifest_path)?);
    completions.push(write_manifest(app_paths_manifest, app_paths_manifest_path)?);
    completions.push(write_manifest(build_manifest, build_manifest_path)?);

    // Placeholder manifests.

    // TODO(alexkirsz) Proper middleware manifest with all (edge?) routes in it,
    // experimental-edge pages?
    completions.push(write_manifest(
        MiddlewaresManifest::default(),
        node_root.join("server/middleware-manifest.json".to_string()),
    )?);
    completions.push(write_manifest(
        NextFontManifest::default(),
        node_root.join("server/next-font-manifest.json".to_string()),
    )?);
    completions.push(write_manifest(
        FontManifest::default(),
        node_root.join("server/font-manifest.json".to_string()),
    )?);
    completions.push(write_manifest(
        ServerReferenceManifest::default(),
        node_root.join("server/server-reference-manifest.json".to_string()),
    )?);
    completions.push(write_manifest(
        ReactLoadableManifest::default(),
        node_root.join("react-loadable-manifest.json".to_string()),
    )?);

    completions.push(
        emit_all_assets(
            all_chunks,
            &node_root_ref,
            client_relative_path,
            client_root,
        )
        .await?,
    );

    Ok(Completions::all(completions))
}

#[turbo_tasks::function]
async fn workspace_fs(
    workspace_root: String,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("workspace".to_string(), workspace_root.to_string());
    handle_issues(
        disk_fs,
        issue_reporter,
        MIN_FAILING_SEVERITY.cell(),
        None,
        None,
    )
    .await?;
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
async fn node_fs(
    node_root: String,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("node".to_string(), node_root.to_string());
    handle_issues(
        disk_fs,
        issue_reporter,
        MIN_FAILING_SEVERITY.cell(),
        None,
        None,
    )
    .await?;
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
async fn client_fs(
    client_root: String,
    issue_reporter: Vc<Box<dyn IssueReporter>>,
) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new("client".to_string(), client_root.to_string());
    handle_issues(
        disk_fs,
        issue_reporter,
        MIN_FAILING_SEVERITY.cell(),
        None,
        None,
    )
    .await?;
    Ok(Vc::upcast(disk_fs))
}

/// Emits all assets transitively reachable from the given chunks, that are
/// inside the node root or the client root.
async fn emit_all_assets(
    chunks: Vec<Vc<Box<dyn OutputAsset>>>,
    node_root: &FileSystemPath,
    client_relative_path: Vc<FileSystemPath>,
    client_output_path: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    let all_assets = all_assets_from_entries(Vc::cell(chunks)).await?;
    Ok(Completions::all(
        all_assets
            .iter()
            .copied()
            .map(|asset| async move {
                if asset.ident().path().await?.is_inside_ref(node_root) {
                    return Ok(emit(asset));
                } else if asset
                    .ident()
                    .path()
                    .await?
                    .is_inside_ref(&*client_relative_path.await?)
                {
                    // Client assets are emitted to the client output path, which is prefixed with
                    // _next. We need to rebase them to remove that prefix.
                    return Ok(emit_rebase(asset, client_relative_path, client_output_path));
                }

                Ok(Completion::immutable())
            })
            .try_join()
            .await?,
    ))
}

#[turbo_tasks::function]
fn emit(asset: Vc<Box<dyn OutputAsset>>) -> Vc<Completion> {
    asset.content().write(asset.ident().path())
}

#[turbo_tasks::function]
fn emit_rebase(
    asset: Vc<Box<dyn OutputAsset>>,
    from: Vc<FileSystemPath>,
    to: Vc<FileSystemPath>,
) -> Vc<Completion> {
    asset
        .content()
        .write(rebase(asset.ident().path(), from, to))
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
async fn all_assets_from_entries(entries: Vc<OutputAssets>) -> Result<Vc<OutputAssets>> {
    Ok(Vc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries.await?.iter().copied().map(Vc::upcast),
                get_referenced_assets,
            )
            .await
            .completed()?
            .into_inner()
            .into_reverse_topological()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk.
async fn get_referenced_assets(
    asset: Vc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn OutputAsset>>> + Send> {
    Ok(asset
        .references()
        .await?
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .into_iter())
}

/// Writes a manifest to disk. This consumes the manifest to ensure we don't
/// write to it afterwards.
fn write_manifest<T>(manifest: T, manifest_path: Vc<FileSystemPath>) -> Result<Vc<Completion>>
where
    T: Serialize,
{
    let manifest_contents = serde_json::to_string_pretty(&manifest)?;
    Ok(manifest_path.write(FileContent::Content(manifest_contents.into()).cell()))
}
