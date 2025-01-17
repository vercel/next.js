use std::{
    collections::HashSet,
    env::current_dir,
    path::{PathBuf, MAIN_SEPARATOR},
    sync::Arc,
};

use anyhow::{bail, Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    apply_effects, ReadConsistency, ResolvedVc, TransientInstance, TryJoinIterExt, TurboTasks,
    Value, Vc,
};
use turbo_tasks_fs::FileSystem;
use turbo_tasks_memory::MemoryBackend;
use turbopack_browser::BrowserChunkingContext;
use turbopack_cli_utils::issue::{ConsoleUi, LogOptions};
use turbopack_core::{
    asset::Asset,
    chunk::{
        availability_info::AvailabilityInfo, ChunkingContext, EvaluatableAsset, EvaluatableAssets,
        MinifyType,
    },
    environment::{BrowserEnvironment, Environment, ExecutionEnvironment, NodeJsEnvironment},
    ident::AssetIdent,
    issue::{handle_issues, IssueReporter, IssueSeverity},
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
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
    contexts::{get_client_asset_context, get_client_compile_time_info, NodeEnv},
    util::{
        normalize_dirs, normalize_entries, output_fs, project_fs, EntryRequest, EntryRequests,
        NormalizedDirs,
    },
};

pub fn register() {
    turbopack::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

pub struct TurbopackBuildBuilder {
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    project_dir: RcStr,
    root_dir: RcStr,
    entry_requests: Vec<EntryRequest>,
    browserslist_query: RcStr,
    log_level: IssueSeverity,
    show_all: bool,
    log_detail: bool,
    minify_type: MinifyType,
    target: Target,
}

impl TurbopackBuildBuilder {
    pub fn new(
        turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
        project_dir: RcStr,
        root_dir: RcStr,
    ) -> Self {
        TurbopackBuildBuilder {
            turbo_tasks,
            project_dir,
            root_dir,
            entry_requests: vec![],
            browserslist_query: "chrome 64, edge 79, firefox 67, opera 51, safari 12".into(),
            log_level: IssueSeverity::Warning,
            show_all: false,
            log_detail: false,
            minify_type: MinifyType::Minify,
            target: Target::Node,
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

    pub fn minify_type(mut self, minify_type: MinifyType) -> Self {
        self.minify_type = minify_type;
        self
    }

    pub fn target(mut self, target: Target) -> Self {
        self.target = target;
        self
    }

    pub async fn build(self) -> Result<()> {
        let task = self.turbo_tasks.spawn_once_task::<(), _>(async move {
            let build_result_op = build_internal(
                self.project_dir.clone(),
                self.root_dir,
                EntryRequests(
                    self.entry_requests
                        .iter()
                        .cloned()
                        .map(EntryRequest::resolved_cell)
                        .collect(),
                )
                .resolved_cell(),
                self.browserslist_query,
                self.minify_type,
                self.target,
            );

            // Await the result to propagate any errors.
            build_result_op.connect().strongly_consistent().await?;

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
                IssueSeverity::Error.into(),
                None,
                None,
            )
            .await?;

            Ok(Default::default())
        });

        self.turbo_tasks
            .wait_task_completion(task, ReadConsistency::Strong)
            .await?;

        Ok(())
    }
}

#[turbo_tasks::function(operation)]
async fn build_internal(
    project_dir: RcStr,
    root_dir: RcStr,
    entry_requests: ResolvedVc<EntryRequests>,
    browserslist_query: RcStr,
    minify_type: MinifyType,
    target: Target,
) -> Result<Vc<()>> {
    let output_fs = output_fs(project_dir.clone());
    let project_fs = project_fs(root_dir.clone());
    let project_relative = project_dir.strip_prefix(&*root_dir).unwrap();
    let project_relative: RcStr = project_relative
        .strip_prefix(MAIN_SEPARATOR)
        .unwrap_or(project_relative)
        .replace(MAIN_SEPARATOR, "/")
        .into();
    let root_path = project_fs.root().to_resolved().await?;
    let project_path = root_path.join(project_relative).to_resolved().await?;
    let build_output_root = output_fs.root().join("dist".into()).to_resolved().await?;

    let node_env = NodeEnv::Production.cell();

    let build_output_root_to_root_path = project_path
        .join("dist".into())
        .await?
        .get_relative_path_to(&*root_path.await?)
        .context("Project path is in root path")?;

    let runtime_type = match *node_env.await? {
        NodeEnv::Development => RuntimeType::Development,
        NodeEnv::Production => RuntimeType::Production,
    };

    let chunking_context: Vc<Box<dyn ChunkingContext>> = match target {
        Target::Browser => Vc::upcast(
            BrowserChunkingContext::builder(
                project_path,
                build_output_root,
                ResolvedVc::cell(build_output_root_to_root_path),
                build_output_root,
                build_output_root,
                build_output_root,
                Environment::new(Value::new(ExecutionEnvironment::Browser(
                    BrowserEnvironment {
                        dom: true,
                        web_worker: false,
                        service_worker: false,
                        browserslist_query: browserslist_query.clone(),
                    }
                    .resolved_cell(),
                )))
                .to_resolved()
                .await?,
                runtime_type,
            )
            .minify_type(minify_type)
            .build(),
        ),
        Target::Node => Vc::upcast(
            NodeJsChunkingContext::builder(
                project_path,
                build_output_root,
                ResolvedVc::cell(build_output_root_to_root_path),
                build_output_root,
                build_output_root,
                build_output_root,
                Environment::new(Value::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment::default().resolved_cell(),
                )))
                .to_resolved()
                .await?,
                runtime_type,
            )
            .minify_type(minify_type)
            .build(),
        ),
    };

    let compile_time_info = get_client_compile_time_info(browserslist_query, node_env);
    let execution_context =
        ExecutionContext::new(*root_path, chunking_context, load_env(*root_path));
    let asset_context = get_client_asset_context(
        *project_path,
        execution_context,
        compile_time_info,
        node_env,
    );

    let entry_requests = (*entry_requests
        .await?
        .iter()
        .cloned()
        .map(|r| async move {
            Ok(match &*r.await? {
                EntryRequest::Relative(p) => Request::relative(
                    Value::new(p.clone().into()),
                    Default::default(),
                    Default::default(),
                    false,
                ),
                EntryRequest::Module(m, p) => Request::module(
                    m.clone(),
                    Value::new(p.clone().into()),
                    Default::default(),
                    Default::default(),
                ),
            })
        })
        .try_join()
        .await?)
        .to_vec();

    let origin = PlainResolveOrigin::new(asset_context, project_fs.root().join("_".into()));
    let project_dir = &project_dir;
    let entries = entry_requests
        .into_iter()
        .map(|request_vc| async move {
            let ty = Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined));
            let request = request_vc.await?;
            origin
                .resolve_asset(request_vc, origin.resolve_options(ty.clone()), ty)
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
        .await?;

    let module_graph = ModuleGraph::from_modules(Vc::cell(entries.clone()));

    let entry_chunk_groups = entries
        .into_iter()
        .map(|entry_module| async move {
            Ok(
                if let Some(ecmascript) =
                    ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(entry_module).await?
                {
                    match target {
                        Target::Browser => {
                            chunking_context
                                .evaluated_chunk_group(
                                    AssetIdent::from_path(
                                        build_output_root
                                            .join(
                                                ecmascript
                                                    .ident()
                                                    .path()
                                                    .file_stem()
                                                    .await?
                                                    .as_deref()
                                                    .unwrap()
                                                    .into(),
                                            )
                                            .with_extension("entry.js".into()),
                                    ),
                                    EvaluatableAssets::one(*ResolvedVc::upcast(ecmascript)),
                                    module_graph,
                                    Value::new(AvailabilityInfo::Root),
                                )
                                .await?
                                .assets
                        }
                        Target::Node => ResolvedVc::cell(vec![
                            chunking_context
                                .entry_chunk_group(
                                    build_output_root
                                        .join(
                                            ecmascript
                                                .ident()
                                                .path()
                                                .file_stem()
                                                .await?
                                                .as_deref()
                                                .unwrap()
                                                .into(),
                                        )
                                        .with_extension("entry.js".into()),
                                    *ResolvedVc::upcast(ecmascript),
                                    EvaluatableAssets::one(*ResolvedVc::upcast(ecmascript)),
                                    module_graph,
                                    OutputAssets::empty(),
                                    Value::new(AvailabilityInfo::Root),
                                )
                                .await?
                                .asset,
                        ]),
                    }
                } else {
                    bail!(
                        "Entry module is not chunkable, so it can't be used to bootstrap the \
                         application"
                    )
                },
            )
        })
        .try_join()
        .await?;

    let mut chunks: HashSet<ResolvedVc<Box<dyn OutputAsset>>> = HashSet::new();
    for chunk_group in entry_chunk_groups {
        chunks.extend(&*all_assets_from_entries(*chunk_group).await?);
    }

    chunks
        .iter()
        .map(|c| c.content().write(c.ident().path()))
        .try_join()
        .await?;

    Ok(Default::default())
}

pub async fn build(args: &BuildArguments) -> Result<()> {
    let NormalizedDirs {
        project_dir,
        root_dir,
    } = normalize_dirs(&args.common.dir, &args.common.root)?;

    let tt = TurboTasks::new(MemoryBackend::new(
        args.common
            .memory_limit
            .map_or(usize::MAX, |l| l * 1024 * 1024),
    ));

    let mut builder = TurbopackBuildBuilder::new(tt, project_dir, root_dir)
        .log_detail(args.common.log_detail)
        .log_level(
            args.common
                .log_level
                .map_or_else(|| IssueSeverity::Warning, |l| l.0),
        )
        .minify_type(if args.no_minify {
            MinifyType::NoMinify
        } else {
            MinifyType::Minify
        })
        .target(args.common.target.unwrap_or(Target::Node))
        .show_all(args.common.show_all);

    for entry in normalize_entries(&args.common.entries) {
        builder = builder.entry_request(EntryRequest::Relative(entry));
    }

    builder.build().await?;

    Ok(())
}
