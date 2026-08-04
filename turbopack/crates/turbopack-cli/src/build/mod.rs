use std::{
    env::current_dir,
    mem::forget,
    path::{MAIN_SEPARATOR, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result, bail};
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Effects, OperationVc, ResolvedVc, TransientInstance, TryJoinIterExt, TurboTasks, Vc,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{
    BackendOptions, GitVersionInfo, StartupCacheState, StorageMode, TurboTasksBackend,
    noop_backing_storage, turbo_backing_storage,
};
use turbo_tasks_fs::{FileSystem, FileSystemPath};
use turbo_unix_path::join_path;
use turbopack::global_module_ids::get_global_module_id_strategy;
use turbopack_browser::{BrowserChunkingContext, CurrentChunkMethod};
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkingConfig, ChunkingContext, ChunkingContextExt, ContentHashing, EvaluatableAsset,
        MangleType, MinifyType, SourceMapsType, availability_info::AvailabilityInfo,
    },
    context::AssetContext,
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment, NodeJsEnvironment},
    ident::AssetIdent,
    issue::{IssueReporter, IssueSeverity, handle_issues},
    module::Module,
    module_graph::{
        GraphEntries, ModuleGraph, SingleModuleGraph,
        binding_usage_info::compute_binding_usage_info,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        origin::{PlainResolveOrigin, ResolveOrigin},
        parse::Request,
    },
};
use turbopack_css::chunk::CssChunkType;
use turbopack_ecmascript::chunk::EcmascriptChunkType;
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::dotenv::load_env;
use turbopack_node::{child_process_backend, execution_context::ExecutionContext};
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    arguments::{BuildArguments, Target},
    contexts::{NodeEnv, get_client_asset_context, get_client_compile_time_info},
    util::{
        EntryRequest, NormalizedDirs, normalize_dirs, normalize_entries, output_fs, project_fs,
    },
};

type Backend = TurboTasksBackend;

pub struct TurbopackBuildBuilder {
    turbo_tasks: Arc<TurboTasks<Backend>>,
    project_dir: RcStr,
    root_dir: RcStr,
    entry_requests: Vec<EntryRequest>,
    browserslist_query: RcStr,
    log_level: IssueSeverity,
    show_all: bool,
    log_detail: bool,
    source_maps_type: SourceMapsType,
    minify_type: MinifyType,
    target: Target,
    scope_hoist: bool,
}

impl TurbopackBuildBuilder {
    pub fn new(turbo_tasks: Arc<TurboTasks<Backend>>, project_dir: RcStr, root_dir: RcStr) -> Self {
        TurbopackBuildBuilder {
            turbo_tasks,
            project_dir,
            root_dir,
            entry_requests: vec![],
            browserslist_query: "last 1 Chrome versions, last 1 Firefox versions, last 1 Safari \
                                 versions, last 1 Edge versions"
                .into(),
            log_level: IssueSeverity::Warning,
            show_all: false,
            log_detail: false,
            source_maps_type: SourceMapsType::Full,
            minify_type: MinifyType::Minify {
                mangle: Some(MangleType::OptimalSize),
            },
            target: Target::Node,
            scope_hoist: true,
        }
    }

    pub fn entry_request(mut self, entry_asset_path: EntryRequest) -> Self {
        self.entry_requests.push(entry_asset_path);
        self
    }

    pub fn browserslist_query(mut self, browserslist_query: RcStr) -> Self {
        self.browserslist_query = browserslist_query;
        self
    }

    pub fn log_level(mut self, log_level: IssueSeverity) -> Self {
        self.log_level = log_level;
        self
    }

    pub fn show_all(mut self, show_all: bool) -> Self {
        self.show_all = show_all;
        self
    }

    pub fn log_detail(mut self, log_detail: bool) -> Self {
        self.log_detail = log_detail;
        self
    }

    pub fn source_maps_type(mut self, source_maps_type: SourceMapsType) -> Self {
        self.source_maps_type = source_maps_type;
        self
    }

    pub fn minify_type(mut self, minify_type: MinifyType) -> Self {
        self.minify_type = minify_type;
        self
    }

    pub fn scope_hoist(mut self, scope_hoist: bool) -> Self {
        self.scope_hoist = scope_hoist;
        self
    }

    pub fn target(mut self, target: Target) -> Self {
        self.target = target;
        self
    }

    #[cfg(not(feature = "sync"))]
    pub async fn build(self) -> Result<()> {
        self.turbo_tasks
            .clone()
            .run_once(async move { self.build_inner().await })
            .await
    }

    /// Sync build driver: `run_sync` runs the whole build inline on the sync engine
    /// with no async runtime (the async build uses `run_once` + a tokio runtime).
    #[cfg(feature = "sync")]
    pub fn build(self) -> Result<()> {
        let tt = self.turbo_tasks.clone();
        tt.run_sync(move || self.build_inner())
    }
}

impl TurbopackBuildBuilder {
    turbo_tasks::dual_fn! {
        /// The build body, shared by the async `run_once` and sync `run_sync` drivers.
        fn build_inner(self) -> Result<()> {
            let wrapper_op = extract_effects_operation(build_internal(
                self.project_dir.clone(),
                self.root_dir,
                self.entry_requests.clone(),
                self.browserslist_query,
                self.source_maps_type,
                self.minify_type,
                self.target,
                self.scope_hoist,
            ));

            turbo_tasks::read!(read_strongly_consistent_and_apply_effects(wrapper_op, |e| e))?;

            let issue_reporter: Vc<Box<dyn IssueReporter>> =
                Vc::upcast(ConsoleUi::new(TransientInstance::new(LogOptions {
                    project_dir: PathBuf::from(self.project_dir),
                    current_dir: current_dir().unwrap(),
                    show_all: self.show_all,
                    log_detail: self.log_detail,
                    log_level: self.log_level,
                })));

            turbo_tasks::read!(handle_issues(
                wrapper_op,
                issue_reporter,
                IssueSeverity::Error,
                None,
                None
            ))?;

            Ok(())
        }
    }
}

#[turbo_tasks::function(operation, root)]
async fn extract_effects_operation(op: OperationVc<()>) -> Result<Vc<Effects>> {
    let _ = turbo_tasks::read!(op.resolve().strongly_consistent())?;
    Ok(turbo_tasks::read!(take_effects(op))?.cell())
}

turbo_tasks::dual_fn! {
    /// Builds the chunk group for a single entry module (per-item body of the
    /// entries fan-out in `build_internal`).
    fn build_entry_chunk_group(
        entry_module: ResolvedVc<Box<dyn Module>>,
        target: Target,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        build_output_root: FileSystemPath,
    ) -> Result<Vc<OutputAssetsWithReferenced>> {
        Ok(
            if let Some(ecmascript) =
                ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(entry_module)
            {
                match target {
                    Target::Browser => chunking_context.evaluated_chunk_group_assets(
                        AssetIdent::from_path(
                            build_output_root
                                .join(
                                    turbo_tasks::read!(ecmascript.ident())?
                                        .path
                                        .file_stem()
                                        .unwrap(),
                                )?
                                .with_extension("entry.js"),
                        )
                        .into_vc(),
                        ChunkGroup::Entry([ResolvedVc::upcast(ecmascript)].into_iter().collect()),
                        module_graph,
                        OutputAssets::empty(),
                        AvailabilityInfo::root(),
                    ),
                    Target::Node => OutputAssetsWithReferenced {
                        assets: ResolvedVc::cell(vec![
                            turbo_tasks::read!(chunking_context.entry_chunk_group(
                                build_output_root
                                    .join(
                                        turbo_tasks::read!(ecmascript.ident())?
                                            .path
                                            .file_stem()
                                            .unwrap(),
                                    )?
                                    .with_extension("entry.js"),
                                ChunkGroup::Entry(vec![ResolvedVc::upcast(ecmascript)]),
                                module_graph,
                                OutputAssets::empty(),
                                OutputAssets::empty(),
                                AvailabilityInfo::root(),
                            ))?
                            .asset,
                        ]),
                        referenced_assets: ResolvedVc::cell(vec![]),
                        references: ResolvedVc::cell(vec![]),
                    }
                    .cell(),
                }
            } else {
                bail!(
                    "Entry module is not chunkable, so it can't be used to bootstrap the \
                     application"
                )
            },
        )
    }
}

#[turbo_tasks::function(operation, root)]
async fn build_internal(
    project_dir: RcStr,
    root_dir: RcStr,
    entry_requests: Vec<EntryRequest>,
    browserslist_query: RcStr,
    source_maps_type: SourceMapsType,
    minify_type: MinifyType,
    target: Target,
    scope_hoist: bool,
) -> Result<()> {
    let output_fs = output_fs(project_dir.clone());
    const OUTPUT_DIR: &str = "dist";
    let project_relative = project_dir.strip_prefix(&*root_dir).unwrap();
    let project_relative: RcStr = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/")
        .into();
    let project_fs = project_fs(
        root_dir.clone(),
        /* watch= */ false,
        join_path(project_relative.as_str(), OUTPUT_DIR)
            .unwrap()
            .into(),
    );
    let root_path = turbo_tasks::read!(project_fs.root().owned())?;
    let project_path = root_path.join(&project_relative)?;
    let build_output_root = turbo_tasks::read!(output_fs.root())?.join(OUTPUT_DIR)?;

    let node_env = NodeEnv::Production.cell();

    let build_output_root_to_root_path = project_path
        .join(OUTPUT_DIR)?
        .get_relative_path_to(&root_path)
        .context("Project path is in root path")?;

    let runtime_type = match *turbo_tasks::read!(node_env)? {
        NodeEnv::Development => RuntimeType::Development,
        NodeEnv::Production => RuntimeType::Production,
    };

    let compile_time_info =
        get_client_compile_time_info(browserslist_query.clone(), node_env, false);
    let node_backend = child_process_backend();
    let execution_context = ExecutionContext::new(
        root_path.clone(),
        Vc::upcast(
            NodeJsChunkingContext::builder(
                project_path.clone(),
                build_output_root.clone(),
                build_output_root_to_root_path.clone(),
                build_output_root.clone(),
                build_output_root.clone(),
                build_output_root.clone(),
                turbo_tasks::read!(
                    Environment::new(ExecutionEnvironment::NodeJsLambda(
                        NodeJsEnvironment::default().resolved_cell(),
                    ))
                    .to_resolved()
                )?,
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
    );

    // Pure `Vc<Request>` construction — no reads, so this is mode-agnostic.
    let entry_requests = entry_requests
        .into_iter()
        .map(|r| match r {
            EntryRequest::Relative(p) => Request::relative(
                p.clone().into(),
                Default::default(),
                Default::default(),
                false,
            ),
            EntryRequest::Module(m, p) => Request::module(
                m.clone().into(),
                p.clone().into(),
                Default::default(),
                Default::default(),
            ),
        })
        .collect::<Vec<_>>();

    let origin = turbo_tasks::read!(PlainResolveOrigin::new(
        asset_context,
        turbo_tasks::read!(project_fs.root())?.join("_")?
    ))?;
    let resolve_options = origin.resolve_options();
    let asset_context = origin.asset_context();
    let origin_path = origin.origin_path();
    let project_dir = &project_dir;
    // Async: resolve all entries concurrently under a `resolve entries` span. Sync:
    // resolve sequentially inside the entered span (no async runtime). Per-item body
    // is identical; only the fan-out/instrument shape differs.
    #[cfg(not(feature = "sync"))]
    let entries = entry_requests
        .into_iter()
        .map(|request_vc| {
            let origin_path = origin_path.clone();
            async move {
                let ty = ReferenceType::Entry(EntryReferenceSubType::Undefined);
                let request = request_vc.await?;
                asset_context
                    .resolve_asset(origin_path, request_vc, resolve_options, ty)
                    .await?
                    .first_module()
                    .await?
                    .with_context(|| {
                        format!(
                            "Unable to resolve entry {} from directory {}.",
                            request.request().unwrap(),
                            project_dir
                        )
                    })
            }
        })
        .try_join()
        .instrument(tracing::info_span!("resolve entries"))
        .await?;
    #[cfg(feature = "sync")]
    let entries = {
        let _span = tracing::info_span!("resolve entries").entered();
        let mut entries = Vec::with_capacity(entry_requests.len());
        for request_vc in entry_requests {
            let ty = ReferenceType::Entry(EntryReferenceSubType::Undefined);
            let request = turbo_tasks::read!(request_vc)?;
            entries.push(
                turbo_tasks::read!(
                    turbo_tasks::read!(asset_context.resolve_asset(
                        origin_path.clone(),
                        request_vc,
                        resolve_options,
                        ty
                    ))?
                    .first_module()
                )?
                .with_context(|| {
                    format!(
                        "Unable to resolve entry {} from directory {}.",
                        request.request().unwrap(),
                        project_dir
                    )
                })?,
            );
        }
        entries
    };

    let single_graph = SingleModuleGraph::new_with_entries(
        GraphEntries::from_chunk_groups(vec![ChunkGroupEntry::Entry(entries.clone())])
            .resolved_cell(),
        false,
        true,
    );
    let mut module_graph = ModuleGraph::from_graphs(vec![single_graph], None);
    let binding_usage = compute_binding_usage_info(module_graph, true);
    let unused_references =
        turbo_tasks::read!(binding_usage.connect().unused_references().to_resolved())?;
    module_graph = ModuleGraph::from_graphs(vec![single_graph], Some(binding_usage));
    let module_graph = module_graph.connect();
    let module_id_strategy =
        turbo_tasks::read!(get_global_module_id_strategy(module_graph).to_resolved())?;

    let chunking_context: Vc<Box<dyn ChunkingContext>> = match target {
        Target::Browser => {
            let mut builder = BrowserChunkingContext::builder(
                project_path,
                build_output_root.clone(),
                build_output_root_to_root_path,
                build_output_root.clone(),
                build_output_root.clone(),
                build_output_root.clone(),
                turbo_tasks::read!(
                    Environment::new(ExecutionEnvironment::Browser(
                        BrowserEnvironment {
                            dom: true,
                            web_worker: false,
                            service_worker: false,
                            browserslist_query: browserslist_query.clone(),
                        }
                        .resolved_cell(),
                    ))
                    .to_resolved()
                )?,
                runtime_type,
            )
            .source_maps(source_maps_type)
            .module_id_strategy(module_id_strategy)
            .export_usage(Some(turbo_tasks::read!(
                binding_usage.connect().to_resolved()
            )?))
            .unused_references(unused_references)
            .current_chunk_method(CurrentChunkMethod::DocumentCurrentScript)
            .minify_type(minify_type);

            match *turbo_tasks::read!(node_env)? {
                NodeEnv::Development => {}
                NodeEnv::Production => {
                    builder = builder
                        .chunking_config(
                            turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                            ChunkingConfig {
                                min_chunk_size: 50_000,
                                max_chunk_count_per_group: 40,
                                max_merge_chunk_size: 200_000,
                                ..Default::default()
                            },
                        )
                        .chunking_config(
                            turbo_tasks::read!(Vc::<CssChunkType>::default().to_resolved())?,
                            ChunkingConfig {
                                max_merge_chunk_size: 100_000,
                                ..Default::default()
                            },
                        )
                        .chunk_content_hashing(ContentHashing::Direct { length: 13 })
                        .asset_content_hashing(ContentHashing::Direct { length: 13 })
                        .nested_async_availability(true)
                        .module_merging(scope_hoist);
                }
            }

            Vc::upcast(builder.build())
        }
        Target::Node => {
            let mut builder = NodeJsChunkingContext::builder(
                project_path,
                build_output_root.clone(),
                build_output_root_to_root_path,
                build_output_root.clone(),
                build_output_root.clone(),
                build_output_root.clone(),
                turbo_tasks::read!(
                    Environment::new(ExecutionEnvironment::NodeJsLambda(
                        NodeJsEnvironment::default().resolved_cell(),
                    ))
                    .to_resolved()
                )?,
                runtime_type,
            )
            .source_maps(source_maps_type)
            .module_id_strategy(module_id_strategy)
            .export_usage(Some(turbo_tasks::read!(
                binding_usage.connect().to_resolved()
            )?))
            .unused_references(unused_references)
            .minify_type(minify_type);

            match *turbo_tasks::read!(node_env)? {
                NodeEnv::Development => {}
                NodeEnv::Production => {
                    builder = builder
                        .chunking_config(
                            turbo_tasks::read!(Vc::<EcmascriptChunkType>::default().to_resolved())?,
                            ChunkingConfig {
                                min_chunk_size: 20_000,
                                max_chunk_count_per_group: 100,
                                max_merge_chunk_size: 100_000,
                                ..Default::default()
                            },
                        )
                        .chunking_config(
                            turbo_tasks::read!(Vc::<CssChunkType>::default().to_resolved())?,
                            ChunkingConfig {
                                max_merge_chunk_size: 100_000,
                                ..Default::default()
                            },
                        )
                        .module_merging(scope_hoist);
                }
            }

            Vc::upcast(builder.build())
        }
    };

    // Async: build entry chunk groups concurrently. Sync: sequentially (same body,
    // via the shared `build_entry_chunk_group` dual helper).
    #[cfg(not(feature = "sync"))]
    let entry_chunk_groups = entries
        .into_iter()
        .map(|entry_module| {
            build_entry_chunk_group(
                entry_module,
                target,
                chunking_context,
                module_graph,
                build_output_root.clone(),
            )
        })
        .try_join()
        .await?;
    #[cfg(feature = "sync")]
    let entry_chunk_groups = {
        let mut groups = Vec::with_capacity(entries.len());
        for entry_module in entries {
            groups.push(build_entry_chunk_group(
                entry_module,
                target,
                chunking_context,
                module_graph,
                build_output_root.clone(),
            )?);
        }
        groups
    };

    // Async: instrument the future (a span guard can't be held across `.await`).
    // Sync: enter the span directly around the inline loop.
    #[cfg(not(feature = "sync"))]
    let all_assets = async move {
        let mut all_assets: FxHashSet<ResolvedVc<Box<dyn OutputAsset>>> = FxHashSet::default();
        for group in entry_chunk_groups {
            all_assets.extend(group.expand_all_assets().await?);
        }
        anyhow::Ok(all_assets)
    }
    .instrument(tracing::info_span!("list chunks"))
    .await?;
    #[cfg(feature = "sync")]
    let all_assets = {
        let _span = tracing::info_span!("list chunks").entered();
        let mut all_assets: FxHashSet<ResolvedVc<Box<dyn OutputAsset>>> = FxHashSet::default();
        for group in entry_chunk_groups {
            all_assets.extend(turbo_tasks::read!(group.expand_all_assets())?);
        }
        all_assets
    };

    // Emit every asset to disk. Async: concurrent writes; sync: sequential.
    #[cfg(not(feature = "sync"))]
    all_assets
        .iter()
        .map(|c| async move { c.content().write(c.path().owned().await?).await })
        .try_join()
        .await?;
    // Sync: `write()` schedules an effect that is only flushed on the driver, so
    // the writes themselves must stay on the driver (a serial loop). But each
    // asset's `content()` is pure, cached codegen + source-map generation — fan
    // that out on the worker pool first so the biggest chunk's generation overlaps
    // the smaller assets', then the serial writes below just read cached content.
    #[cfg(feature = "sync")]
    {
        let assets: Vec<_> = all_assets.iter().copied().collect();
        turbo_tasks::sync_parallel_map(assets, |c| turbo_tasks::read!(c.content()).map(|_| ()))
            .into_iter()
            .collect::<Result<Vec<()>>>()?;
        for c in all_assets.iter() {
            turbo_tasks::read!(c.content().write(turbo_tasks::read!(c.path().owned())?))?;
        }
    }

    Ok(())
}

turbo_tasks::dual_fn! {
pub fn build(args: &BuildArguments) -> Result<()> {
    let NormalizedDirs {
        project_dir,
        root_dir,
    } = normalize_dirs(&args.common.dir, &args.common.root)?;

    let is_ci = std::env::var("CI").is_ok_and(|v| !v.is_empty());
    let is_short_session = true; // build sessions are always short

    let tt = if args.common.persistent_caching {
        let version_info = GitVersionInfo {
            describe: env!("VERGEN_GIT_DESCRIBE"),
            dirty: option_env!("CI").is_none_or(|v| v.is_empty())
                && env!("VERGEN_GIT_DIRTY") == "true",
        };
        let cache_dir = args
            .common
            .cache_dir
            .clone()
            .unwrap_or_else(|| PathBuf::from(&*project_dir).join(".turbopack/cache"));
        let (backing_storage, cache_state) =
            turbo_backing_storage(&cache_dir, &version_info, is_ci, is_short_session, false)?;
        let storage_mode = if std::env::var("TURBO_ENGINE_READ_ONLY").is_ok() {
            StorageMode::ReadOnly
        } else if is_ci || is_short_session {
            StorageMode::ReadWriteOnShutdown
        } else {
            StorageMode::ReadWrite
        };
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                dependency_tracking: false,
                storage_mode: Some(storage_mode),
                ..Default::default()
            },
            backing_storage,
        ));
        if let StartupCacheState::Invalidated { reason_code } = cache_state {
            eprintln!(
                "warn  - Turbopack cache was invalidated{}",
                reason_code
                    .as_deref()
                    .map(|r| format!(": {r}"))
                    .unwrap_or_default()
            );
        }
        tt
    } else {
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                dependency_tracking: false,
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        ))
    };

    let mut builder = TurbopackBuildBuilder::new(tt.clone(), project_dir, root_dir)
        .log_detail(args.common.log_detail)
        .log_level(
            args.common
                .log_level
                .map_or_else(|| IssueSeverity::Warning, |l| l.0),
        )
        .source_maps_type(if args.no_sourcemap {
            SourceMapsType::None
        } else {
            SourceMapsType::Full
        })
        .minify_type(if args.no_minify {
            MinifyType::NoMinify
        } else {
            MinifyType::Minify {
                mangle: Some(MangleType::OptimalSize),
            }
        })
        .scope_hoist(!args.no_scope_hoist)
        .target(args.common.target.unwrap_or(Target::Node))
        .show_all(args.common.show_all);

    for entry in normalize_entries(&args.common.entries) {
        builder = builder.entry_request(EntryRequest::Relative(entry));
    }

    turbo_tasks::read!(builder.build())?;

    // Intentionally leak this `Arc`. Otherwise we'll waste time during process exit performing a
    // ton of drop calls.
    if !args.force_memory_cleanup {
        forget(tt);
    }

    Ok(())
}
}
