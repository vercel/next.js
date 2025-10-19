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
use turbo_tasks::{ResolvedVc, TransientInstance, TryJoinIterExt, TurboTasks, Vc, apply_effects};
use turbo_tasks_backend::{
    BackendOptions, NoopBackingStorage, TurboTasksBackend, noop_backing_storage,
};
use turbo_tasks_fs::FileSystem;
use turbo_unix_path::join_path;
use turbopack::{
    css::chunk::CssChunkType, ecmascript::chunk::EcmascriptChunkType,
    global_module_ids::get_global_module_id_strategy,
};
use turbopack_browser::{BrowserChunkingContext, ContentHashing, CurrentChunkMethod};
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    asset::Asset,
    chunk::{
        ChunkingConfig, ChunkingContext, ChunkingContextExt, EvaluatableAsset, EvaluatableAssets,
        MangleType, MinifyType, SourceMapsType, availability_info::AvailabilityInfo,
    },
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment, NodeJsEnvironment},
    ident::AssetIdent,
    issue::{IssueReporter, IssueSeverity, handle_issues},
    module::Module,
    module_graph::{
        ModuleGraph,
        chunk_group_info::{ChunkGroup, ChunkGroupEntry},
        export_usage::compute_export_usage_info,
    },
    output::{OutputAsset, OutputAssets, OutputAssetsWithReferenced},
    reference::all_assets_from_entries,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        origin::{PlainResolveOrigin, ResolveOriginExt},
        parse::Request,
    },
};
use turbopack_ecmascript_runtime::RuntimeType;
use turbopack_env::dotenv::load_env;
use turbopack_node::execution_context::ExecutionContext;
use turbopack_nodejs::NodeJsChunkingContext;

use crate::{
    arguments::{BuildArguments, Target},
    contexts::{NodeEnv, get_client_asset_context, get_client_compile_time_info},
    util::{
        EntryRequest, NormalizedDirs, normalize_dirs, normalize_entries, output_fs, project_fs,
    },
};

type Backend = TurboTasksBackend<NoopBackingStorage>;

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

    pub async fn build(self) -> Result<()> {
        self.turbo_tasks
            .run_once(async move {
                let build_result_op = build_internal(
                    self.project_dir.clone(),
                    self.root_dir,
                    self.entry_requests.clone(),
                    self.browserslist_query,
                    self.source_maps_type,
                    self.minify_type,
                    self.target,
                    self.scope_hoist,
                );

                // Await the result to propagate any errors.
                build_result_op.read_strongly_consistent().await?;

                apply_effects(build_result_op).await?;

                let issue_reporter: Vc<Box<dyn IssueReporter>> =
                    Vc::upcast(ConsoleUi::new(TransientInstance::new(LogOptions {
                        project_dir: PathBuf::from(self.project_dir),
                        current_dir: current_dir().unwrap(),
                        show_all: self.show_all,
                        log_detail: self.log_detail,
                        log_level: self.log_level,
                    })));

                handle_issues(
                    build_result_op,
                    issue_reporter,
                    IssueSeverity::Error,
                    None,
                    None,
                )
                .await?;

                Ok(())
            })
            .await
    }
}

#[turbo_tasks::function(operation)]
async fn build_internal(
    project_dir: RcStr,
    root_dir: RcStr,
    entry_requests: Vec<EntryRequest>,
    browserslist_query: RcStr,
    source_maps_type: SourceMapsType,
    minify_type: MinifyType,
    target: Target,
    scope_hoist: bool,
) -> Result<Vc<()>> {
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
    let root_path = project_fs.root().owned().await?;
    let project_path = root_path.join(&project_relative)?;
    let build_output_root = output_fs.root().await?.join(OUTPUT_DIR)?;

    let node_env = NodeEnv::Production.cell();

    let build_output_root_to_root_path = project_path
        .join(OUTPUT_DIR)?
        .get_relative_path_to(&root_path)
        .context("Project path is in root path")?;

    let runtime_type = match *node_env.await? {
        NodeEnv::Development => RuntimeType::Development,
        NodeEnv::Production => RuntimeType::Production,
    };

    let compile_time_info = get_client_compile_time_info(browserslist_query.clone(), node_env);
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
                Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment::default().resolved_cell(),
                ))
                .to_resolved()
                .await?,
                runtime_type,
            )
            .build(),
        ),
        load_env(root_path.clone()),
    );

    let asset_context = get_client_asset_context(
        project_path.clone(),
        execution_context,
        compile_time_info,
        node_env,
        source_maps_type,
    );

    let entry_requests = (*entry_requests
        .into_iter()
        .map(|r| async move {
            Ok(match r {
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
        })
        .try_join()
        .await?)
        .to_vec();

    let origin = PlainResolveOrigin::new(asset_context, project_fs.root().await?.join("_")?);
    let project_dir = &project_dir;
    let entries = async move {
        entry_requests
            .into_iter()
            .map(|request_vc| async move {
                let ty = ReferenceType::Entry(EntryReferenceSubType::Undefined);
                let request = request_vc.await?;
                origin
                    .resolve_asset(request_vc, origin.resolve_options(ty.clone()).await?, ty)
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
            })
            .try_join()
            .await
    }
    .instrument(tracing::info_span!("resolve entries"))
    .await?;

    let module_graph = ModuleGraph::from_modules(
        Vc::cell(vec![ChunkGroupEntry::Entry(entries.clone())]),
        false,
    );
    let module_id_strategy = ResolvedVc::upcast(
        get_global_module_id_strategy(module_graph)
            .to_resolved()
            .await?,
    );
    let export_usage = compute_export_usage_info(module_graph.to_resolved().await?)
        .resolve_strongly_consistent()
        .await?;

    let chunking_context: Vc<Box<dyn ChunkingContext>> = match target {
        Target::Browser => {
            let mut builder = BrowserChunkingContext::builder(
                project_path,
                build_output_root.clone(),
                build_output_root_to_root_path,
                build_output_root.clone(),
                build_output_root.clone(),
                build_output_root.clone(),
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
                .await?,
                runtime_type,
            )
            .source_maps(source_maps_type)
            .module_id_strategy(module_id_strategy)
            .export_usage(Some(export_usage))
            .current_chunk_method(CurrentChunkMethod::DocumentCurrentScript)
            .minify_type(minify_type);

            match *node_env.await? {
                NodeEnv::Development => {}
                NodeEnv::Production => {
                    builder = builder
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
                        .use_content_hashing(ContentHashing::Direct { length: 16 })
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
                Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment::default().resolved_cell(),
                ))
                .to_resolved()
                .await?,
                runtime_type,
            )
            .source_maps(source_maps_type)
            .module_id_strategy(module_id_strategy)
            .export_usage(Some(export_usage))
            .minify_type(minify_type);

            match *node_env.await? {
                NodeEnv::Development => {}
                NodeEnv::Production => {
                    builder = builder
                        .chunking_config(
                            Vc::<EcmascriptChunkType>::default().to_resolved().await?,
                            ChunkingConfig {
                                min_chunk_size: 20_000,
                                max_chunk_count_per_group: 100,
                                max_merge_chunk_size: 100_000,
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
                        .module_merging(scope_hoist);
                }
            }

            Vc::upcast(builder.build())
        }
    };

    let entry_chunk_groups = entries
        .into_iter()
        .map(|entry_module| {
            let build_output_root = build_output_root.clone();

            async move {
                Ok(
                    if let Some(ecmascript) =
                        ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(entry_module)
                    {
                        match target {
                            Target::Browser => {
                                *chunking_context
                                    .evaluated_chunk_group_assets(
                                        AssetIdent::from_path(
                                            build_output_root
                                                .join(
                                                    ecmascript
                                                        .ident()
                                                        .path()
                                                        .await?
                                                        .file_stem()
                                                        .unwrap(),
                                                )?
                                                .with_extension("entry.js"),
                                        ),
                                        ChunkGroup::Entry(
                                            [ResolvedVc::upcast(ecmascript)].into_iter().collect(),
                                        ),
                                        module_graph,
                                        AvailabilityInfo::Root,
                                    )
                                    .await?
                            }
                            Target::Node => OutputAssetsWithReferenced {
                                assets: ResolvedVc::cell(vec![
                                    chunking_context
                                        .entry_chunk_group(
                                            build_output_root
                                                .join(
                                                    ecmascript
                                                        .ident()
                                                        .path()
                                                        .await?
                                                        .file_stem()
                                                        .unwrap(),
                                                )?
                                                .with_extension("entry.js"),
                                            EvaluatableAssets::one(*ecmascript),
                                            module_graph,
                                            OutputAssets::empty(),
                                            OutputAssets::empty(),
                                            AvailabilityInfo::Root,
                                        )
                                        .await?
                                        .asset,
                                ]),
                                referenced_assets: ResolvedVc::cell(vec![]),
                            },
                        }
                    } else {
                        bail!(
                            "Entry module is not chunkable, so it can't be used to bootstrap the \
                             application"
                        )
                    },
                )
            }
        })
        .try_join()
        .await?;

    let all_assets = async move {
        let mut all_assets: FxHashSet<ResolvedVc<Box<dyn OutputAsset>>> = FxHashSet::default();
        for OutputAssetsWithReferenced {
            assets,
            referenced_assets,
        } in entry_chunk_groups
        {
            all_assets.extend(all_assets_from_entries(*assets).await?.into_iter().copied());
            all_assets.extend(
                all_assets_from_entries(*referenced_assets)
                    .await?
                    .into_iter()
                    .copied(),
            );
        }
        anyhow::Ok(all_assets)
    }
    .instrument(tracing::info_span!("list chunks"))
    .await?;

    all_assets
        .iter()
        .map(|c| async move { c.content().write(c.path().owned().await?).await })
        .try_join()
        .await?;

    Ok(Default::default())
}

pub async fn build(args: &BuildArguments) -> Result<()> {
    let NormalizedDirs {
        project_dir,
        root_dir,
    } = normalize_dirs(&args.common.dir, &args.common.root)?;

    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            dependency_tracking: false,
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ));

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

    builder.build().await?;

    // Intentionally leak this `Arc`. Otherwise we'll waste time during process exit performing a
    // ton of drop calls.
    if !args.force_memory_cleanup {
        forget(tt);
    }

    Ok(())
}
