//! Build driver: compile each HTML entry's local `<script>` / `<link>` references and emit the
//! rewritten HTML plus its content-hashed chunks into the output directory.

use std::{env::current_dir, future::IntoFuture, path::PathBuf, sync::Arc};

use anyhow::{Context, Result};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, OperationVc, ReadRef, ResolvedVc, TransientInstance, TryJoinIterExt, TurboTasks, Vc,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::TurboTasksBackend;
use turbo_tasks_fs::{FileContent, FileSystem};
use turbo_unix_path::join_path;
use turbopack::{
    evaluate_context::node_build_environment, global_module_ids::get_global_module_id_strategy,
};
use turbopack_browser::{BrowserChunkingContext, CurrentChunkMethod};
use turbopack_cli_core::{
    contexts::{
        DEFAULT_BROWSERSLIST_QUERY, NodeEnv, get_client_asset_context, get_client_compile_time_info,
    },
    entry::EntryRequest,
    fs::{output_fs, project_fs},
    html::{HtmlAsset, local_html_entries},
};
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkableModule, ChunkingConfig, ChunkingContext, ContentHashing, EvaluatableAssets,
        MangleType, MinifyType, SourceMapsType,
    },
    context::AssetContext,
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment},
    file_source::FileSource,
    issue::{IssueReporter, IssueSeverity, handle_issues},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph,
        binding_usage_info::compute_binding_usage_info,
        chunk_group_info::{ChunkGroupEntry, EntryHeuristics},
    },
    output::{OutputAsset, OutputAssets},
    reference::all_assets_from_entries,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        origin::{PlainResolveOrigin, ResolveOrigin},
        parse::Request,
    },
    source::Source,
};
use turbopack_css::chunk::CssChunkType;
use turbopack_ecmascript::chunk::EcmascriptChunkType;
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::dotenv::load_env;
use turbopack_node::{child_process_backend, execution_context::ExecutionContext};
use turbopack_nodejs::NodeJsChunkingContext;

use crate::project::ProjectContainer;

#[turbo_tasks::function(operation, root)]
async fn extract_effects_operation(op: OperationVc<()>) -> Result<Vc<Effects>> {
    let _ = op.resolve().strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

#[turbo_tasks::function(operation, root)]
fn build_operation(container: ResolvedVc<ProjectContainer>) -> Vc<()> {
    build_internal(*container)
}

/// Run a production build for the project: emit rewritten HTML + hashed chunks to the out dir.
pub async fn build_project(
    turbo_tasks: Arc<TurboTasks<TurboTasksBackend>>,
    container: ResolvedVc<ProjectContainer>,
    project_dir: RcStr,
) -> Result<()> {
    turbo_tasks
        .run_once(async move {
            let wrapper_op = extract_effects_operation(build_operation(container));
            read_strongly_consistent_and_apply_effects(wrapper_op, |e| e).await?;

            let issue_reporter: Vc<Box<dyn IssueReporter>> =
                Vc::upcast(ConsoleUi::new(TransientInstance::new(LogOptions {
                    project_dir: PathBuf::from(project_dir.to_string()),
                    current_dir: current_dir().unwrap(),
                    show_all: false,
                    log_detail: false,
                    log_level: IssueSeverity::Warning,
                })));
            handle_issues(wrapper_op, issue_reporter, IssueSeverity::Error, None, None).await?;
            Ok(())
        })
        .await
}

#[turbo_tasks::function]
async fn build_internal(container: ResolvedVc<ProjectContainer>) -> Result<()> {
    let project = container.project().await?;
    let root_dir = project.root_path.clone();
    let dist_dir = project.dist_dir.clone();

    let output_fs = output_fs(root_dir.clone());
    let project_fs = project_fs(
        root_dir.clone(),
        /* watch */ false,
        join_path("", &dist_dir).unwrap().into(),
    );
    let root_path = project_fs.root().owned().await?;
    let project_path = root_path.clone();
    let build_output_root = output_fs.root().await?.join(&dist_dir)?;
    let build_output_root_to_root_path = project_path
        .join(&dist_dir)?
        .get_relative_path_to(&root_path)
        .context("Project path is in root path")?;

    let node_env = NodeEnv::Production.cell();
    let runtime_type = RuntimeType::Production;

    let source_maps_type = SourceMapsType::None;
    // Base path prepended to every emitted chunk/asset URL. Absolute, so the URLs are
    // depth-independent and a nested page resolves the same chunks as a root one.
    let asset_prefix = rcstr!("/");
    // Optimization config will come later; scope hoisting stays off until it is configurable.
    let scope_hoist = false;

    let compile_time_info = get_client_compile_time_info();

    // Node-side execution context: transforms that shell out to Node (PostCSS today, webpack
    // loaders later) evaluate through it. It must use `node_build_environment()` — the standard
    // Node build/evaluate env — and not NodeJsLambda, whose runtime does not fall through to a
    // real Node `require` for those modules. Its chunks go under a separate `_node` directory so
    // they cannot collide with the browser output.
    let node_backend = child_process_backend();
    let node_execution_root = build_output_root.join("_node")?;
    let execution_context = ExecutionContext::new(
        root_path.clone(),
        Vc::upcast(
            NodeJsChunkingContext::builder(
                project_path.clone(),
                node_execution_root.clone(),
                build_output_root_to_root_path.clone(),
                node_execution_root.clone(),
                node_execution_root.join("chunks")?,
                node_execution_root.join("assets")?,
                node_build_environment().to_resolved().await?,
                runtime_type,
            )
            .build(),
        ),
        load_env(root_path.clone()),
        node_backend,
    );

    let asset_context = get_client_asset_context(
        project_path.clone(),
        execution_context,
        compile_time_info,
        node_env,
        source_maps_type,
        /* alias */ Vec::new(),
    );

    // Discover + resolve each HTML page's entries
    struct Page {
        template: ResolvedVc<Box<dyn Source>>,
        modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
        output_name: RcStr,
    }
    let mut pages = Vec::new();
    let mut all_modules: Vec<ResolvedVc<Box<dyn Module>>> = Vec::new();

    for entry in &project.entries {
        // Only HTML entries are supported so far. Skipping anything else silently would emit an
        // empty output directory and still exit successfully, so refuse instead.
        let rel = match entry {
            EntryRequest::Relative(rel) if rel.ends_with(".html") => rel,
            EntryRequest::Relative(rel) => anyhow::bail!(
                "unsupported entry {rel:?}: only `.html` entries can be built so far, so a bare \
                 JavaScript or TypeScript entry has nothing to emit"
            ),
            EntryRequest::Module(module, path) => anyhow::bail!(
                "unsupported entry {module}{path}: only project-relative `.html` entries can be \
                 built so far"
            ),
        };
        let html_path = root_path.join(rel)?;
        let template: ResolvedVc<Box<dyn Source>> =
            ResolvedVc::upcast(FileSource::new(html_path.clone()).to_resolved().await?);
        let content = template.content().file_content().await?;
        let text = match &*content {
            FileContent::Content(file) => file.content().to_str()?.into_owned(),
            FileContent::NotFound => anyhow::bail!("HTML template not found: {rel}"),
        };
        let (scripts, stylesheets) = local_html_entries(&text)?;
        // The per-reference loop below rebinds `rel`, so hold on to the page's own path for
        // error messages.
        let entry_html = rel;

        let html_dir = html_path.parent();
        // Root-relative `/src/x` resolves from the project root
        // Dir-relative `./x` or `x` resolves from the HTML file's directory,
        // so a nested page (`blog/post.html`) referencing `/src/post.tsx` resolves correctly.
        let html_origin = PlainResolveOrigin::new(asset_context, html_dir.join("_")?).await?;
        let root_origin = PlainResolveOrigin::new(asset_context, root_path.join("_")?).await?;

        let mut page_modules = Vec::new();
        for req_str in scripts.iter().chain(stylesheets.iter()) {
            let (origin, rel): (&ReadRef<PlainResolveOrigin>, RcStr) =
                if let Some(rest) = req_str.strip_prefix('/') {
                    (&root_origin, rest.into())
                } else {
                    (
                        &html_origin,
                        req_str.strip_prefix("./").unwrap_or(req_str).into(),
                    )
                };
            let request =
                Request::relative(rel.into(), Default::default(), Default::default(), false);
            let module = asset_context
                .resolve_asset(
                    origin.origin_path(),
                    request,
                    origin.resolve_options(),
                    ReferenceType::Entry(EntryReferenceSubType::Web),
                )
                .await?
                .first_module()
                .await?
                // Dropping an unresolvable reference would delete its tag from the rewritten HTML
                // and still report a successful build, leaving a page that loads nothing.
                .with_context(|| {
                    format!("could not resolve {req_str:?}, referenced by {entry_html}")
                })?;
            all_modules.push(module);
            let chunkable = ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(module)
                .with_context(|| {
                    format!("{req_str:?}, referenced by {entry_html}, cannot be bundled")
                })?;
            page_modules.push(chunkable);
        }
        pages.push(Page {
            template,
            modules: page_modules,
            output_name: rel.clone(),
        });
    }

    // One shared module graph (prod: with binding usage + global module ids).
    let single_graph = SingleModuleGraph::new_with_entries(
        GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry {
            modules: all_modules,
            heuristics: EntryHeuristics::default(),
        }])
        .resolved_cell(),
        false,
        true,
    );
    let mut module_graph = ModuleGraph::from_graphs(vec![single_graph], None);
    // Force graph construction (module discovery, parse, analyze) before timing the rest.
    module_graph.connect().to_resolved().await?;
    let binding_usage = compute_binding_usage_info(module_graph, true);
    let unused_references = binding_usage
        .connect()
        .unused_references()
        .to_resolved()
        .await?;
    module_graph = ModuleGraph::from_graphs(vec![single_graph], Some(binding_usage));
    let module_graph = module_graph.connect().to_resolved().await?;
    let module_id_strategy = get_global_module_id_strategy(*module_graph)
        .to_resolved()
        .await?;

    let chunking_context: ResolvedVc<Box<dyn ChunkingContext>> = ResolvedVc::upcast(
        BrowserChunkingContext::builder(
            project_path.clone(),
            build_output_root.clone(),
            build_output_root_to_root_path.clone(),
            build_output_root.clone(),
            build_output_root.join("_chunks")?,
            build_output_root.join("_assets")?,
            Environment::new(ExecutionEnvironment::Browser(
                BrowserEnvironment {
                    dom: true,
                    web_worker: false,
                    service_worker: false,
                    browserslist_query: RcStr::from(DEFAULT_BROWSERSLIST_QUERY),
                }
                .resolved_cell(),
            ))
            .to_resolved()
            .await?,
            runtime_type,
        )
        .source_maps(source_maps_type)
        .module_id_strategy(module_id_strategy)
        .export_usage(Some(binding_usage.connect().to_resolved().await?))
        .unused_references(unused_references)
        // Content-hashing requires DocumentCurrentScript (embedding a chunk's own hashed path in
        // its body would be a cycle). The runtime reads the path from currentScript and expects
        // sibling content chunks to already be in the DOM as classic <script> tags.
        .current_chunk_method(CurrentChunkMethod::DocumentCurrentScript)
        .minify_type(MinifyType::Minify {
            mangle: Some(MangleType::OptimalSize),
        })
        // Absolute base path, so chunk URLs (`<assetPrefix>/_chunks/…`) are depth-independent
        // and nested routes resolve them. A configurable prefix would let the client bundle live
        // under a subpath or on a CDN.
        .chunk_base_path(Some(asset_prefix.clone()))
        .asset_base_path(Some(asset_prefix.clone()))
        .chunking_config(
            Vc::<EcmascriptChunkType>::default().to_resolved().await?,
            ChunkingConfig {
                min_chunk_size: 50_000,
                max_chunk_count_per_group: 40,
                max_merge_chunk_size: 200_000,
                ..Default::default()
            },
        )
        .chunking_config(
            Vc::<CssChunkType>::default().to_resolved().await?,
            ChunkingConfig {
                max_merge_chunk_size: 100_000,
                ..Default::default()
            },
        )
        .chunk_content_hashing(ContentHashing::Direct { length: 13 })
        .asset_content_hashing(ContentHashing::Direct { length: 13 })
        .nested_async_availability(true)
        .module_merging(scope_hoist)
        .build()
        .to_resolved()
        .await?,
    );

    // Build one HtmlAsset per page (empty runtime entries = production; the entry still
    // self-executes via the evaluated chunk group).
    let runtime_entries = EvaluatableAssets::empty().to_resolved().await?;
    let mut roots: Vec<ResolvedVc<Box<dyn OutputAsset>>> = Vec::new();
    for page in pages {
        let html_asset: ResolvedVc<Box<dyn OutputAsset>> = ResolvedVc::upcast(
            HtmlAsset::new(
                build_output_root.join(&page.output_name)?,
                build_output_root.clone(),
                asset_prefix.clone(),
                page.template,
                page.modules,
                module_graph,
                chunking_context,
                Some(runtime_entries),
            )
            .to_resolved()
            .await?,
        );
        roots.push(html_asset);
    }

    // Expand the transitive output-asset graph (HTML + all chunks) and write each to disk.
    let all_assets = all_assets_from_entries(Vc::<OutputAssets>::cell(roots))
        .into_future()
        .instrument(tracing::info_span!("build: expand output graph"))
        .await?;
    all_assets
        .iter()
        .map(|asset| async move { asset.content().write(asset.path().owned().await?).await })
        .try_join()
        .instrument(tracing::info_span!("build: generate content and write"))
        .await?;

    Ok(())
}
