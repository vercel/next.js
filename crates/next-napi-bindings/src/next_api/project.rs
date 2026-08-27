use std::{
    borrow::Cow,
    fs::{canonicalize, create_dir_all},
    io::Write,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex},
    thread,
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail};
use bincode::{Decode, Encode};
use flate2::write::GzEncoder;
use futures_util::TryFutureExt;
use napi::{
    Env, Status, Unknown,
    bindgen_prelude::{External, FunctionRef, PromiseRaw, within_runtime_if_available},
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use napi_derive::napi;
use next_api::{
    entrypoints::Entrypoints,
    next_server_nft::next_server_nft_assets,
    operation::{
        EntrypointsOperation, InstrumentationOperation, MiddlewareOperation, OptionEndpoint,
        RouteOperation,
    },
    project::{
        DebugBuildPaths, DefineEnv, DraftModeOptions, PartialProjectOptions, Project,
        ProjectContainer, ProjectOptions, WatchOptions,
    },
    project_asset_hashes_manifest::immutable_hashes_manifest_asset_if_enabled,
    route::{Endpoint, EndpointGroupKey, Route},
    routes_hashes_manifest::routes_hashes_manifest_asset_if_enabled,
};
use next_core::{
    app_structure::find_app_dir,
    next_config::DIST_PROFILES_DIR_NAME,
    next_telemetry::ProjectFeatureUsageSummary,
    tracing_presets::{
        TRACING_NEXT_OVERVIEW_TARGETS, TRACING_NEXT_TARGETS, TRACING_NEXT_TURBO_TASKS_TARGETS,
        TRACING_NEXT_TURBOPACK_TARGETS,
    },
};
use rand::RngExt;
use serde::Serialize;
use tokio::{io::AsyncWriteExt, runtime::Handle, time::Instant};
use tracing::Instrument;
use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, FxIndexSet, OperationValue, OperationVc, PrettyPrintError, ReadRef, ResolvedVc,
    TransientInstance, TryJoinIterExt, TurboTasksApi, TurboTasksCallApi, UpdateInfo, Vc,
    mark_top_level_task,
    message_queue::{CompilationEvent, Severity},
    read_strongly_consistent_and_apply_effects, take_effects,
    trace::TraceRawVcs,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_backend::{BackingStorageOptions, db_invalidation::invalidation_reasons};
#[cfg(windows)]
use turbo_tasks_fs::windows::to_verbatim_with_case_folded_disk;
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystem, FileSystemPath, canonicalize_to_rcstr, invalidation,
    util::uri_from_file,
};
use turbo_unix_path::{get_relative_path_to, unix_to_sys};
use turbopack_core::{
    PROJECT_FILESYSTEM_NAME, SOURCE_URL_PROTOCOL,
    issue::PlainIssue,
    output::{OutputAsset, OutputAssets},
    source_map::{SourceMap, Token},
    version::{PartialUpdate, TotalUpdate, Update, VersionState},
};
use turbopack_ecmascript_hmr_protocol::{ClientUpdateInstruction, Issue, ResourceIdentifier};
use turbopack_trace_utils::{
    exit::{ExitHandler, ExitReceiver},
    filter_layer::FilterLayer,
    raw_trace::RawTraceLayer,
    trace_writer::TraceWriter,
};
use url::Url;

use crate::{
    next_api::{
        analyze::{WriteAnalyzeResult, write_analyze_data_with_issues_operation},
        endpoint::ExternalEndpoint,
        turbopack_ctx::{
            MemoryEvictionMode, NapiNextTurbopackCallbacks, NapiNextTurbopackCallbacksJsObject,
            NextTurboTasks, NextTurbopackContext, create_turbo_tasks,
        },
        utils::{
            DetachedVc, NapiIssue, NapiUsedFeature, RootTask, TurbopackResult, get_issues,
            strongly_consistent_catch_collectables, subscribe,
        },
    },
    util::DhatProfilerGuard,
};

/// Used by [`benchmark_file_io`]. This is a noisy benchmark, so set the
/// threshold high.
const SLOW_FILESYSTEM_THRESHOLD: Duration = Duration::from_millis(200);
static SOURCE_MAP_PREFIX: LazyLock<String> = LazyLock::new(|| format!("{SOURCE_URL_PROTOCOL}///"));
static SOURCE_MAP_PREFIX_PROJECT: LazyLock<String> =
    LazyLock::new(|| format!("{SOURCE_URL_PROTOCOL}///[{PROJECT_FILESYSTEM_NAME}]/"));

#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiEnvVar {
    pub name: RcStr,
    pub value: RcStr,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiOptionEnvVar {
    pub name: RcStr,
    pub value: Option<RcStr>,
}

#[napi(object)]
pub struct NapiDraftModeOptions {
    pub preview_mode_id: RcStr,
    pub preview_mode_encryption_key: RcStr,
    pub preview_mode_signing_key: RcStr,
}

impl From<NapiDraftModeOptions> for DraftModeOptions {
    fn from(val: NapiDraftModeOptions) -> Self {
        DraftModeOptions {
            preview_mode_id: val.preview_mode_id,
            preview_mode_encryption_key: val.preview_mode_encryption_key,
            preview_mode_signing_key: val.preview_mode_signing_key,
        }
    }
}

#[napi(object)]
pub struct NapiWatchOptions {
    /// Whether to watch the filesystem for file changes.
    pub enable: bool,

    /// Enable polling at a certain interval if the native file watching doesn't work (e.g.
    /// docker).
    pub poll_interval_ms: Option<f64>,
}

#[napi(object)]
pub struct NapiProjectOptions {
    /// An absolute root path (Unix or Windows path) from which all files must be nested under.
    /// Trying to access a file outside this root will fail, so think of this as a chroot.
    /// E.g. `/home/user/projects/my-repo`.
    pub root_path: RcStr,

    /// A path which contains the app/pages directories, relative to [`Project::root_path`], always
    /// Unix path. E.g. `apps/my-app`
    pub project_path: RcStr,

    /// A path where tracing output will be written to and/or cache is read/written.
    /// Usually equal to the `distDir` in next.config.js.
    /// E.g. `.next`
    pub dist_dir: RcStr,

    /// Filesystem watcher options.
    pub watch: NapiWatchOptions,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: RcStr,

    /// A map of environment variables to use when compiling code.
    pub env: Vec<NapiEnvVar>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: NapiDefineEnv,

    /// The mode in which Next.js is running.
    pub dev: bool,

    /// The server actions encryption key.
    pub encryption_key: RcStr,

    /// The build id.
    pub build_id: RcStr,

    /// Options for draft mode.
    pub preview_props: NapiDraftModeOptions,

    /// The browserslist query to use for targeting browsers.
    pub browserslist_query: RcStr,

    /// When the code is minified, this opts out of the default mangling of
    /// local names for variables, functions etc., which can be useful for
    /// debugging/profiling purposes.
    pub no_mangling: bool,

    /// Whether to write the route hashes manifest.
    pub write_routes_hashes_manifest: bool,

    /// The version of Node.js that is available/currently running.
    pub current_node_js_version: RcStr,

    /// Debug build paths for selective builds.
    /// When set, only routes matching these paths will be included in the build.
    pub debug_build_paths: Option<NapiDebugBuildPaths>,

    /// App-router page routes that should be built after non-deferred routes.
    pub deferred_entries: Option<Vec<RcStr>>,

    // Whether persistent caching is enabled
    pub is_persistent_caching_enabled: bool,

    /// The version of Next.js that is running.
    pub next_version: RcStr,

    /// Whether server-side HMR is enabled (disabled with --no-server-fast-refresh).
    pub server_hmr: Option<bool>,
}

/// [NapiProjectOptions] with all fields optional.
#[napi(object)]
pub struct NapiPartialProjectOptions {
    /// An absolute root path  (Unix or Windows path) from which all files must be nested under.
    /// Trying to access a file outside this root will fail, so think of this as a chroot.
    /// E.g. `/home/user/projects/my-repo`.
    pub root_path: Option<RcStr>,

    /// A path which contains the app/pages directories, relative to [`Project::root_path`], always
    /// a Unix path.
    /// E.g. `apps/my-app`
    pub project_path: Option<RcStr>,

    /// Filesystem watcher options.
    pub watch: Option<NapiWatchOptions>,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: Option<RcStr>,

    /// A map of environment variables to use when compiling code.
    pub env: Option<Vec<NapiEnvVar>>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: Option<NapiDefineEnv>,

    /// The mode in which Next.js is running.
    pub dev: Option<bool>,

    /// The server actions encryption key.
    pub encryption_key: Option<RcStr>,

    /// The build id.
    pub build_id: Option<RcStr>,

    /// Options for draft mode.
    pub preview_props: Option<NapiDraftModeOptions>,

    /// The browserslist query to use for targeting browsers.
    pub browserslist_query: Option<RcStr>,

    /// Whether to write the route hashes manifest.
    pub write_routes_hashes_manifest: Option<bool>,

    /// When the code is minified, this opts out of the default mangling of
    /// local names for variables, functions etc., which can be useful for
    /// debugging/profiling purposes.
    pub no_mangling: Option<bool>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiDefineEnv {
    pub client: Vec<NapiOptionEnvVar>,
    pub edge: Vec<NapiOptionEnvVar>,
    pub nodejs: Vec<NapiOptionEnvVar>,
}

#[napi(object)]
pub struct NapiTurboEngineOptions {
    /// Track dependencies between tasks. If false, any change during build will error.
    pub dependency_tracking: Option<bool>,
    /// Whether the project is running in a CI environment.
    pub is_ci: Option<bool>,
    /// Whether the project is running in a short session.
    pub is_short_session: Option<bool>,
    /// Whether to skip database compaction during shutdown.
    pub skip_compaction: Option<bool>,
    /// Turbopack memory eviction mode for the persistent cache.
    pub turbopack_memory_eviction: MemoryEvictionMode,
}

impl From<NapiWatchOptions> for WatchOptions {
    fn from(val: NapiWatchOptions) -> Self {
        WatchOptions {
            enable: val.enable,
            poll_interval: val
                .poll_interval_ms
                .filter(|interval| !interval.is_nan() && interval.is_finite() && *interval > 0.0)
                .map(|interval| Duration::from_secs_f64(interval / 1000.0)),
        }
    }
}

impl From<NapiProjectOptions> for ProjectOptions {
    fn from(val: NapiProjectOptions) -> Self {
        let NapiProjectOptions {
            root_path,
            project_path,
            // Only used for initializing cache and tracing
            dist_dir: _,
            watch,
            next_config,
            env,
            define_env,
            dev,
            encryption_key,
            build_id,
            preview_props,
            browserslist_query,
            no_mangling,
            write_routes_hashes_manifest,
            current_node_js_version,
            debug_build_paths,
            deferred_entries,
            is_persistent_caching_enabled,
            next_version,
            server_hmr,
        } = val;
        ProjectOptions {
            root_path,
            project_path,
            watch: watch.into(),
            next_config,
            env: env.into_iter().map(|var| (var.name, var.value)).collect(),
            define_env: define_env.into(),
            dev,
            encryption_key,
            build_id,
            preview_props: preview_props.into(),
            browserslist_query,
            no_mangling,
            write_routes_hashes_manifest,
            current_node_js_version,
            debug_build_paths: debug_build_paths.map(|p| DebugBuildPaths {
                app: p.app,
                pages: p.pages,
            }),
            deferred_entries,
            is_persistent_caching_enabled,
            next_version,
            server_hmr: server_hmr.unwrap_or(false),
        }
    }
}

impl From<NapiPartialProjectOptions> for PartialProjectOptions {
    fn from(val: NapiPartialProjectOptions) -> Self {
        let NapiPartialProjectOptions {
            root_path,
            project_path,
            watch,
            next_config,
            env,
            define_env,
            dev,
            encryption_key,
            build_id,
            preview_props,
            browserslist_query,
            no_mangling,
            write_routes_hashes_manifest,
        } = val;
        PartialProjectOptions {
            root_path,
            project_path,
            watch: watch.map(From::from),
            next_config,
            env: env.map(|env| env.into_iter().map(|var| (var.name, var.value)).collect()),
            define_env: define_env.map(|env| env.into()),
            dev,
            encryption_key,
            build_id,
            preview_props: preview_props.map(|props| props.into()),
            browserslist_query,
            no_mangling,
            write_routes_hashes_manifest,
            debug_build_paths: None,
        }
    }
}

impl From<NapiDefineEnv> for DefineEnv {
    fn from(val: NapiDefineEnv) -> Self {
        DefineEnv {
            client: val
                .client
                .into_iter()
                .map(|var| (var.name, var.value))
                .collect(),
            edge: val
                .edge
                .into_iter()
                .map(|var| (var.name, var.value))
                .collect(),
            nodejs: val
                .nodejs
                .into_iter()
                .map(|var| (var.name, var.value))
                .collect(),
        }
    }
}

pub struct ProjectInstance {
    turbopack_ctx: NextTurbopackContext,
    container: ResolvedVc<ProjectContainer>,
    // Never locked across an await point.
    exit_receiver: Mutex<Option<ExitReceiver>>,
}

#[napi(ts_return_type = "Promise<{ __napiType: \"Project\" }>")]
pub fn project_new<'env>(
    env: &'env Env,
    mut options: NapiProjectOptions,
    turbo_engine_options: NapiTurboEngineOptions,
    napi_callbacks: NapiNextTurbopackCallbacksJsObject,
) -> napi::Result<PromiseRaw<'env, External<ProjectInstance>>> {
    let napi_callbacks = NapiNextTurbopackCallbacks::from_js(env, napi_callbacks)?;
    let (exit, exit_receiver) = ExitHandler::new_receiver();

    // The root path must be canonicalized before DiskFileSystem is constructed, but do it early,
    // before we use it for creating a trace file or anything else. The root path always exists.
    options.root_path = canonicalize_to_rcstr(Path::new(&*options.root_path)).map_err(|e| {
        napi::Error::from_reason(PrettyPrintError(&anyhow::Error::from(e)).to_string())
    })?;
    // The dist dir (e.g. `.next`) may not exist yet, and `canonicalize` requires an existing path.
    create_dir_all(Path::new(&*options.dist_dir))
        .with_context(|| format!("failed to create dist directory {:?}", options.dist_dir))
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    options.dist_dir = canonicalize_to_rcstr(Path::new(&*options.dist_dir)).map_err(|e| {
        napi::Error::from_reason(PrettyPrintError(&anyhow::Error::from(e)).to_string())
    })?;

    if let Some(dhat_profiler) = DhatProfilerGuard::try_init() {
        exit.on_exit(async move {
            tokio::task::spawn_blocking(move || drop(dhat_profiler))
                .await
                .unwrap()
        });
    }

    let mut trace = std::env::var("NEXT_TURBOPACK_TRACING")
        .ok()
        .filter(|v| !v.is_empty());

    if cfg!(feature = "tokio-console") && trace.is_none() {
        // ensure `trace` is set to *something* so that the `tokio-console` feature works,
        // otherwise you just get empty output from `tokio-console`, which can be
        // confusing.
        trace = Some("overview".to_owned());
    }

    enum Compression {
        None,
        GzipFast,
        GzipBest,
    }
    let mut compress = Compression::None;
    if let Some(mut trace) = trace {
        let trace_path_override = std::env::var_os("NEXT_TURBOPACK_TRACING_PATH")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from);
        let trace_file = if let Some(path) = trace_path_override {
            if path.is_absolute() {
                path
            } else {
                std::env::current_dir()
                    .context("Unable to read current working directory")
                    .unwrap()
                    .join(path)
            }
        } else {
            Path::new(&options.root_path)
                .join(&*unix_to_sys(&options.project_path))
                .join(DIST_PROFILES_DIR_NAME)
                // use a generic binary extension to hint to random tools not to read it.
                .join("trace-turbopack.bin")
        };
        let trace_dir = trace_file
            .parent()
            .expect("Trace file path must have a parent directory");

        println!("Turbopack tracing enabled with targets: {trace}");
        println!("  Note that this might have a small performance impact.");
        println!("  Trace output will be written to {}", trace_file.display());

        trace = trace
            .split(",")
            .filter_map(|item| {
                // Trace presets
                Some(match item {
                    "overview" | "1" => Cow::Owned(TRACING_NEXT_OVERVIEW_TARGETS.join(",")),
                    "next" => Cow::Owned(TRACING_NEXT_TARGETS.join(",")),
                    "turbopack" => Cow::Owned(TRACING_NEXT_TURBOPACK_TARGETS.join(",")),
                    "turbo-tasks" => Cow::Owned(TRACING_NEXT_TURBO_TASKS_TARGETS.join(",")),
                    "gz" => {
                        compress = Compression::GzipFast;
                        return None;
                    }
                    "gz-best" => {
                        compress = Compression::GzipBest;
                        return None;
                    }
                    _ => Cow::Borrowed(item),
                })
            })
            .intersperse_with(|| Cow::Borrowed(","))
            .collect::<String>();

        let subscriber = Registry::default();

        if cfg!(feature = "tokio-console") {
            trace = format!("{trace},tokio=trace,runtime=trace");
        }
        #[cfg(feature = "tokio-console")]
        let subscriber = subscriber.with(console_subscriber::spawn());

        let subscriber = subscriber.with(FilterLayer::try_new(&trace).unwrap());

        // For the default `.next-profiles` location the JS CLI already created
        // this directory (with its `.gitignore`) before invoking the binding; this
        // is a safety net and also covers a `NEXT_TURBOPACK_TRACING_PATH` override.
        create_dir_all(trace_dir)
            .with_context(|| {
                format!(
                    "Unable to create trace output directory {}",
                    trace_dir.display()
                )
            })
            .unwrap();
        let (trace_writer, trace_writer_guard) = match compress {
            Compression::None => {
                let trace_writer = std::fs::File::create(trace_file.clone()).unwrap();
                TraceWriter::new(trace_writer)
            }
            Compression::GzipFast => {
                let trace_writer = std::fs::File::create(trace_file.clone()).unwrap();
                let trace_writer = GzEncoder::new(trace_writer, flate2::Compression::fast());
                TraceWriter::new(trace_writer)
            }
            Compression::GzipBest => {
                let trace_writer = std::fs::File::create(trace_file.clone()).unwrap();
                let trace_writer = GzEncoder::new(trace_writer, flate2::Compression::best());
                TraceWriter::new(trace_writer)
            }
        };
        let subscriber = subscriber.with(RawTraceLayer::new(trace_writer));

        exit.on_exit(async move {
            tokio::task::spawn_blocking(move || drop(trace_writer_guard))
                .await
                .unwrap();
        });

        let trace_server = std::env::var("NEXT_TURBOPACK_TRACE_SERVER").ok();
        if trace_server.is_some() {
            thread::spawn(move || {
                turbopack_trace_server::start_turbopack_trace_server(trace_file, None);
            });
            println!("Turbopack trace server started. View trace at https://trace.nextjs.org");
        }

        subscriber.init();
    }

    env.spawn_future(
        async move {
            let dependency_tracking = turbo_engine_options.dependency_tracking.unwrap_or(true);
            let turbopack_memory_eviction = turbo_engine_options.turbopack_memory_eviction;
            let turbo_tasks = create_turbo_tasks(
                PathBuf::from(&options.dist_dir),
                &options.next_version,
                options.is_persistent_caching_enabled,
                dependency_tracking,
                BackingStorageOptions {
                    is_ci: turbo_engine_options.is_ci.unwrap_or(false),
                    is_short_session: turbo_engine_options.is_short_session.unwrap_or(false),
                    skip_compaction: turbo_engine_options.skip_compaction.unwrap_or(false),
                },
                turbopack_memory_eviction,
            )?;
            let turbopack_ctx = NextTurbopackContext::new(turbo_tasks.clone(), napi_callbacks);

            if let Some(stats_path) = std::env::var_os("NEXT_TURBOPACK_TASK_STATISTICS") {
                let task_stats = turbo_tasks.task_statistics().enable().clone();
                exit.on_exit(async move {
                    tokio::task::spawn_blocking(move || {
                        let mut file = std::fs::File::create(&stats_path)
                            .with_context(|| format!("failed to create or open {stats_path:?}"))?;
                        serde_json::to_writer(&file, &task_stats)
                            .context("failed to serialize or write task statistics")?;
                        file.flush().context("failed to flush file")
                    })
                    .await
                    .unwrap()
                    .unwrap();
                });
            }

            let options = ProjectOptions::from(options);
            let is_dev = options.dev;
            let root_path = options.root_path.clone();
            let container = turbo_tasks
                .run(async move {
                    let container_op = ProjectContainer::new_operation(rcstr!("next.js"), is_dev);
                    ProjectContainer::initialize(container_op, options).await?;
                    container_op.resolve().strongly_consistent().await
                })
                .or_else(|e| turbopack_ctx.throw_turbopack_internal_result(&e.into()))
                .await?;

            if is_dev {
                Handle::current().spawn({
                    let tt = turbo_tasks.clone();
                    let root_path = root_path.clone();
                    async move {
                        let result = tt
                            .clone()
                            .run(async move {
                                #[turbo_tasks::function(operation, root)]
                                fn project_node_root_path_operation(
                                    container: ResolvedVc<ProjectContainer>,
                                ) -> Vc<FileSystemPath> {
                                    container.project().node_root()
                                }

                                let mut absolute_benchmark_dir = PathBuf::from(root_path);
                                absolute_benchmark_dir.push(
                                    &project_node_root_path_operation(container)
                                        .read_strongly_consistent()
                                        .await?
                                        .path,
                                );
                                benchmark_file_io(&tt, &absolute_benchmark_dir).await
                            })
                            .await;
                        if let Err(err) = result {
                            // TODO Not ideal to print directly to stdout.
                            // We should use a compilation event instead to report async errors.
                            println!("Failed to benchmark file I/O: {err}");
                        }
                    }
                    .instrument(tracing::info_span!("benchmark file I/O"))
                });
            }

            Ok(External::new(ProjectInstance {
                turbopack_ctx,
                container,
                exit_receiver: Mutex::new(Some(exit_receiver)),
            }))
        }
        .instrument(tracing::info_span!("create project")),
    )
}

#[derive(Debug, Clone, Serialize)]
struct SlowFilesystemEvent {
    directory: String,
    duration_ms: u128,
}

impl CompilationEvent for SlowFilesystemEvent {
    fn type_name(&self) -> &'static str {
        "SlowFilesystemEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Warning
    }

    fn message(&self) -> String {
        format!(
            "Slow filesystem detected. The benchmark took {}ms. If {} is a network drive, \
             consider moving it to a local folder.\n\
            See more: https://nextjs.org/docs/app/guides/local-development",
            self.duration_ms, self.directory
        )
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

/// A very simple and low-overhead, but potentially noisy benchmark to detect
/// very slow disk IO. Warns the user (via `println!`) if the benchmark takes
/// more than `SLOW_FILESYSTEM_THRESHOLD`.
///
/// This idea is copied from Bun:
/// - https://x.com/jarredsumner/status/1637549427677364224
/// - https://github.com/oven-sh/bun/blob/06a9aa80c38b08b3148bfeabe560/src/install/install.zig#L3038
async fn benchmark_file_io(turbo_tasks: &NextTurboTasks, dir: &Path) -> Result<()> {
    let temp_path = dir.join(format!(
        "tmp_file_io_benchmark_{:x}",
        rand::random::<u128>()
    ));

    let mut random_buffer = [0u8; 512];
    rand::rng().fill(&mut random_buffer[..]);

    // perform IO directly with tokio (skipping `tokio_tasks_fs`) to avoid the
    // additional noise/overhead of tasks caching, invalidation, file locks,
    // etc.
    let start = Instant::now();
    async {
        for _ in 0..3 {
            // create a new empty file
            let mut file = tokio::fs::File::create(&temp_path).await?;
            file.write_all(&random_buffer).await?;
            file.sync_all().await?;
            drop(file);

            // remove the file
            tokio::fs::remove_file(&temp_path).await?;
        }
        anyhow::Ok(())
    }
    .instrument(tracing::info_span!("benchmark file IO (measurement)", path = %temp_path.display()))
    .await?;

    let duration = Instant::now().duration_since(start);
    if duration > SLOW_FILESYSTEM_THRESHOLD {
        turbo_tasks.send_compilation_event(Arc::new(SlowFilesystemEvent {
            directory: dir.to_string_lossy().into(),
            duration_ms: duration.as_millis(),
        }));
    }

    Ok(())
}

#[tracing::instrument(level = "info", name = "update project", skip_all)]
#[napi]
pub async fn project_update(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    options: NapiPartialProjectOptions,
) -> napi::Result<()> {
    let ctx = &project.turbopack_ctx;
    let options = options.into();
    let container = project.container;
    ctx.turbo_tasks()
        .run(async move { container.update(options).await })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await
}

/// Invalidates the filesystem cache so that it will be deleted next time that a turbopack project
/// is created with filesystem cache enabled.
#[napi]
pub async fn project_invalidate_file_system_cache(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<()> {
    let ctx = project.turbopack_ctx.clone();
    tokio::task::spawn_blocking(move || {
        // TODO: Let the JS caller specify a reason? We need to limit the reasons to ones we
        // know how to generate a message for on the Rust side of the FFI.
        ctx.turbo_tasks()
            .backend()
            .invalidate_storage(invalidation_reasons::USER_REQUEST)
    })
    .await
    .context("panicked while invalidating filesystem cache")??;
    Ok(())
}

/// Runs exit handlers for the project registered using the [`ExitHandler`] API.
///
/// This is called by `project_shutdown`, so if you're calling that API, you shouldn't call this
/// one.
#[napi]
pub async fn project_on_exit(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<()> {
    run_exit_handlers(&project.exit_receiver).await;
    Ok(())
}

/// Takes the [`ExitReceiver`] out of the shared slot and runs the registered exit handlers.
///
/// The receiver is taken only once the caller is ready to run the handlers, so an earlier failure
/// (e.g. a panic in `stop_and_wait` during `project_shutdown`) leaves it in place for a fallback
/// `project_on_exit` call.
async fn run_exit_handlers(exit_receiver: &Mutex<Option<ExitReceiver>>) {
    let exit_receiver = exit_receiver
        .lock()
        .expect("panicked while holding the exit receiver")
        .take();
    exit_receiver
        .expect("`project.onExitSync` must only be called once")
        .run_exit_handler()
        .await;
}

/// Runs `project_on_exit`, and then waits for turbo_tasks to gracefully shut down.
///
/// This is used in builds where it's important that we completely persist turbo-tasks to disk, but
/// it's skipped in the development server (`project_on_exit` is used instead with a short timeout),
/// where we prioritize fast exit and user responsiveness over all else.
#[tracing::instrument(level = "info", name = "shutdown project", skip_all)]
#[napi]
pub async fn project_shutdown(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<()> {
    let tt = project.turbopack_ctx.turbo_tasks();
    tt.stop_and_wait().await;
    run_exit_handlers(&project.exit_receiver).await;
    Ok(())
}

#[napi(object, object_from_js = false)]
#[derive(Default)]
pub struct AppPageNapiRoute {
    /// The relative path from project_path to the route file
    pub original_name: Option<RcStr>,

    pub html_endpoint: Option<External<ExternalEndpoint>>,
    pub rsc_hmr_endpoint: Option<External<ExternalEndpoint>>,
}

#[napi(object, object_from_js = false)]
#[derive(Default)]
pub struct NapiRoute {
    /// The router path
    pub pathname: RcStr,
    /// The relative path from project_path to the route file
    pub original_name: Option<RcStr>,

    /// The type of route, eg a Page or App
    pub r#type: &'static str,

    pub pages: Option<Vec<AppPageNapiRoute>>,

    pub has_action_manifest: Option<bool>,

    // Different representations of the endpoint
    pub endpoint: Option<External<ExternalEndpoint>>,
    pub html_endpoint: Option<External<ExternalEndpoint>>,
    pub rsc_hmr_endpoint: Option<External<ExternalEndpoint>>,
    pub data_endpoint: Option<External<ExternalEndpoint>>,
}

impl NapiRoute {
    fn from_route(
        pathname: RcStr,
        value: RouteOperation,
        turbopack_ctx: &NextTurbopackContext,
    ) -> Self {
        let convert_endpoint = |endpoint: OperationVc<OptionEndpoint>| {
            Some(External::new(ExternalEndpoint(DetachedVc::new(
                turbopack_ctx.clone(),
                endpoint,
            ))))
        };
        match value {
            RouteOperation::Page {
                html_endpoint,
                data_endpoint,
            } => NapiRoute {
                pathname,
                r#type: "page",
                html_endpoint: convert_endpoint(html_endpoint),
                data_endpoint: convert_endpoint(data_endpoint),
                ..Default::default()
            },
            RouteOperation::PageApi { endpoint } => NapiRoute {
                pathname,
                r#type: "page-api",
                endpoint: convert_endpoint(endpoint),
                ..Default::default()
            },
            RouteOperation::AppPage(pages) => NapiRoute {
                pathname,
                r#type: "app-page",
                pages: Some(
                    pages
                        .into_iter()
                        .map(|page_route| AppPageNapiRoute {
                            original_name: Some(page_route.original_name),
                            html_endpoint: convert_endpoint(page_route.html_endpoint),
                            rsc_hmr_endpoint: convert_endpoint(page_route.rsc_hmr_endpoint),
                        })
                        .collect(),
                ),
                ..Default::default()
            },
            RouteOperation::AppRoute {
                original_name,
                endpoint,
                has_action_manifest,
            } => NapiRoute {
                pathname,
                original_name: Some(original_name),
                r#type: "app-route",
                endpoint: convert_endpoint(endpoint),
                has_action_manifest: Some(has_action_manifest),
                ..Default::default()
            },
            RouteOperation::Conflict => NapiRoute {
                pathname,
                r#type: "conflict",
                ..Default::default()
            },
        }
    }
}

#[napi(object, object_from_js = false)]
pub struct NapiMiddleware {
    pub endpoint: External<ExternalEndpoint>,
    pub is_proxy: bool,
}

impl NapiMiddleware {
    fn from_middleware(
        value: &MiddlewareOperation,
        turbopack_ctx: &NextTurbopackContext,
    ) -> Result<Self> {
        Ok(NapiMiddleware {
            endpoint: External::new(ExternalEndpoint(DetachedVc::new(
                turbopack_ctx.clone(),
                value.endpoint,
            ))),
            is_proxy: value.is_proxy,
        })
    }
}

#[napi(object, object_from_js = false)]
pub struct NapiInstrumentation {
    pub node_js: External<ExternalEndpoint>,
    pub edge: External<ExternalEndpoint>,
}

impl NapiInstrumentation {
    fn from_instrumentation(
        value: &InstrumentationOperation,
        turbopack_ctx: &NextTurbopackContext,
    ) -> Result<Self> {
        Ok(NapiInstrumentation {
            node_js: External::new(ExternalEndpoint(DetachedVc::new(
                turbopack_ctx.clone(),
                value.node_js,
            ))),
            edge: External::new(ExternalEndpoint(DetachedVc::new(
                turbopack_ctx.clone(),
                value.edge,
            ))),
        })
    }
}

#[napi(object, object_from_js = false)]
pub struct NapiEntrypoints {
    pub routes: Vec<NapiRoute>,
    pub middleware: Option<NapiMiddleware>,
    pub instrumentation: Option<NapiInstrumentation>,
    pub pages_document_endpoint: External<ExternalEndpoint>,
    pub pages_app_endpoint: External<ExternalEndpoint>,
    pub pages_error_endpoint: External<ExternalEndpoint>,
}

impl NapiEntrypoints {
    fn from_entrypoints_op(
        entrypoints: &EntrypointsOperation,
        turbopack_ctx: &NextTurbopackContext,
    ) -> Result<Self> {
        let routes = entrypoints
            .routes
            .iter()
            .map(|(k, v)| NapiRoute::from_route(k.clone(), v.clone(), turbopack_ctx))
            .collect();
        let middleware = entrypoints
            .middleware
            .as_ref()
            .map(|m| NapiMiddleware::from_middleware(m, turbopack_ctx))
            .transpose()?;
        let instrumentation = entrypoints
            .instrumentation
            .as_ref()
            .map(|i| NapiInstrumentation::from_instrumentation(i, turbopack_ctx))
            .transpose()?;
        let pages_document_endpoint = External::new(ExternalEndpoint(DetachedVc::new(
            turbopack_ctx.clone(),
            entrypoints.pages_document_endpoint,
        )));
        let pages_app_endpoint = External::new(ExternalEndpoint(DetachedVc::new(
            turbopack_ctx.clone(),
            entrypoints.pages_app_endpoint,
        )));
        let pages_error_endpoint = External::new(ExternalEndpoint(DetachedVc::new(
            turbopack_ctx.clone(),
            entrypoints.pages_error_endpoint,
        )));
        Ok(NapiEntrypoints {
            routes,
            middleware,
            instrumentation,
            pages_document_endpoint,
            pages_app_endpoint,
            pages_error_endpoint,
        })
    }
}

#[turbo_tasks::value(serialization = "skip")]
struct EntrypointsWithIssues {
    entrypoints: Option<ReadRef<EntrypointsOperation>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation, root)]
async fn get_entrypoints_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Result<Vc<EntrypointsWithIssues>> {
    let entrypoints_operation =
        EntrypointsOperation::new(project_container_entrypoints_operation(container));
    let filter = container.project().issue_filter().await?;
    let (entrypoints, issues, effects) =
        strongly_consistent_catch_collectables(entrypoints_operation, &filter).await?;
    Ok(EntrypointsWithIssues {
        entrypoints,
        issues,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation, root)]
fn project_container_entrypoints_operation(
    // the container is a long-lived object with internally mutable state, there's no risk of it
    // becoming stale
    container: ResolvedVc<ProjectContainer>,
) -> Vc<Entrypoints> {
    container.entrypoints()
}

#[turbo_tasks::value(serialization = "skip")]
struct OperationResult {
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::value(serialization = "skip")]
struct AllWrittenEntrypointsWithIssues {
    entrypoints: Option<ReadRef<EntrypointsOperation>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    effects: Arc<Effects>,
}

#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiDebugBuildPaths {
    pub app: Vec<RcStr>,
    pub pages: Vec<RcStr>,
}

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, Eq, Hash, OperationValue, PartialEq, TraceRawVcs, Encode, Decode)]
enum EntrypointsWritePhase {
    All,
    NonDeferred,
    Deferred,
}

fn normalize_deferred_route(route: &str) -> String {
    let with_leading_slash = if route.starts_with('/') {
        route.to_owned()
    } else {
        format!("/{route}")
    };

    if with_leading_slash.len() > 1 && with_leading_slash.ends_with('/') {
        with_leading_slash
            .strip_suffix('/')
            .unwrap_or_default()
            .to_owned()
    } else {
        with_leading_slash
    }
}

fn is_deferred_app_route(route: &str, deferred_entries: &[RcStr]) -> bool {
    let normalized_route = normalize_deferred_route(route);

    deferred_entries.iter().any(|entry| {
        let normalized_entry = normalize_deferred_route(entry);
        normalized_route == normalized_entry
            || normalized_route.starts_with(&format!("{normalized_entry}/"))
    })
}

#[derive(Clone, Debug, TraceRawVcs)]
struct DeferredPhaseBuildPaths {
    non_deferred: DebugBuildPaths,
    all: DebugBuildPaths,
    deferred_invalidation_dirs: Vec<RcStr>,
}

fn to_app_debug_path(route: &str, leaf: &'static str) -> RcStr {
    let with_leading_slash = if route.starts_with('/') {
        route.to_owned()
    } else {
        format!("/{route}")
    };

    let normalized_route = if with_leading_slash.len() > 1 && with_leading_slash.ends_with('/') {
        with_leading_slash.trim_end_matches('/').to_owned()
    } else {
        with_leading_slash
    };

    if normalized_route == "/" {
        format!("/{leaf}").into()
    } else {
        format!("{normalized_route}/{leaf}").into()
    }
}

fn app_entry_source_dir_from_original_name(original_name: &str) -> RcStr {
    let normalized_name = normalize_deferred_route(original_name);
    let mut segments = normalized_name
        .trim_start_matches('/')
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    if !segments.is_empty() {
        segments.pop();
    }

    if segments.is_empty() {
        rcstr!("/")
    } else {
        format!("/{}", segments.join("/")).into()
    }
}

fn compute_deferred_phase_build_paths(
    entrypoints: &Entrypoints,
    deferred_entries: &[RcStr],
) -> DeferredPhaseBuildPaths {
    let mut non_deferred_app = FxIndexSet::default();
    let mut deferred_app = FxIndexSet::default();
    let mut deferred_invalidation_dirs = FxIndexSet::default();
    let mut pages = FxIndexSet::default();

    for (route_key, route) in entrypoints.routes.iter() {
        match route {
            Route::Page { .. } | Route::PageApi { .. } => {
                pages.insert(route_key.clone());
            }
            Route::AppPage(app_page_routes) => {
                let app_debug_path = to_app_debug_path(route_key.as_str(), "page");
                if is_deferred_app_route(route_key.as_str(), deferred_entries) {
                    deferred_app.insert(app_debug_path);
                    deferred_invalidation_dirs.extend(app_page_routes.iter().map(|route| {
                        app_entry_source_dir_from_original_name(route.original_name.as_str())
                    }));
                } else {
                    non_deferred_app.insert(app_debug_path);
                }
            }
            Route::AppRoute { original_name, .. } => {
                let app_debug_path = to_app_debug_path(route_key.as_str(), "route");
                if is_deferred_app_route(route_key.as_str(), deferred_entries) {
                    deferred_app.insert(app_debug_path);
                    deferred_invalidation_dirs.insert(app_entry_source_dir_from_original_name(
                        original_name.as_str(),
                    ));
                } else {
                    non_deferred_app.insert(app_debug_path);
                }
            }
            Route::Conflict => {}
        }
    }

    let pages_vec = pages.into_iter().collect::<Vec<_>>();
    let all_app_vec = non_deferred_app
        .iter()
        .chain(deferred_app.iter())
        .cloned()
        .collect::<FxIndexSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    DeferredPhaseBuildPaths {
        non_deferred: DebugBuildPaths {
            app: non_deferred_app.into_iter().collect::<Vec<_>>(),
            pages: pages_vec.clone(),
        },
        all: DebugBuildPaths {
            app: all_app_vec,
            pages: pages_vec,
        },
        deferred_invalidation_dirs: deferred_invalidation_dirs.into_iter().collect::<Vec<_>>(),
    }
}

async fn invalidate_deferred_entry_source_dirs_after_callback(
    container: ResolvedVc<ProjectContainer>,
    deferred_invalidation_dirs: Vec<RcStr>,
) -> Result<()> {
    if deferred_invalidation_dirs.is_empty() {
        return Ok(());
    }

    #[turbo_tasks::value(cell = "new", eq = "manual")]
    struct ProjectInfo(Option<FileSystemPath>, DiskFileSystem);

    #[turbo_tasks::function(operation, root)]
    async fn project_info_operation(
        container: ResolvedVc<ProjectContainer>,
    ) -> Result<Vc<ProjectInfo>> {
        let project = container.project();
        let app_dir = find_app_dir(project.project_path().owned().await?)
            .owned()
            .await?;
        let project_fs = project.project_fs().owned().await?;
        Ok(ProjectInfo(app_dir, project_fs).cell())
    }
    let ProjectInfo(app_dir, project_fs) = &*project_info_operation(container)
        .read_strongly_consistent()
        .await?;

    let Some(app_dir) = app_dir else {
        return Ok(());
    };
    // Use `to_sys_path_raw` (not `to_sys_path`): these paths are compared against the invalidator
    // map keys inside `invalidate_path_and_children_with_reason`, which use the internal (verbatim
    // on Windows) representation.
    let app_dir_sys_path = project_fs.to_sys_path_raw(app_dir);
    let paths_to_invalidate = deferred_invalidation_dirs
        .into_iter()
        .map(|dir| {
            let normalized_dir = normalize_deferred_route(dir.as_str());
            let relative_dir = normalized_dir.trim_start_matches('/');
            if relative_dir.is_empty() {
                app_dir_sys_path.clone()
            } else {
                app_dir_sys_path.join(unix_to_sys(relative_dir).as_ref())
            }
        })
        .collect::<FxIndexSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();

    if paths_to_invalidate.is_empty() {
        // Fallback to full invalidation when app dir paths are unavailable.
        project_fs.invalidate_with_reason(|path| invalidation::Initialize {
            path: RcStr::from(path.to_string_lossy()),
        });
    } else {
        project_fs.invalidate_path_and_children_with_reason(paths_to_invalidate, |path| {
            invalidation::Initialize {
                path: RcStr::from(path.to_string_lossy()),
            }
        });
    }

    Ok(())
}

fn is_deferred_endpoint_group(key: &EndpointGroupKey, deferred_entries: &[RcStr]) -> bool {
    if deferred_entries.is_empty() {
        return false;
    }

    let EndpointGroupKey::Route(route_key) = key else {
        return false;
    };

    is_deferred_app_route(route_key.as_str(), deferred_entries)
}

fn should_include_endpoint_group(
    write_phase: EntrypointsWritePhase,
    key: &EndpointGroupKey,
    deferred_entries: &[RcStr],
) -> bool {
    let is_deferred = is_deferred_endpoint_group(key, deferred_entries);

    match write_phase {
        EntrypointsWritePhase::All => true,
        EntrypointsWritePhase::NonDeferred => !is_deferred,
        EntrypointsWritePhase::Deferred => is_deferred,
    }
}

async fn app_route_filter_for_write_phase(
    project: Vc<Project>,
    write_phase: EntrypointsWritePhase,
    deferred_entries: &[RcStr],
) -> Result<Option<Vec<RcStr>>> {
    if matches!(write_phase, EntrypointsWritePhase::All) || deferred_entries.is_empty() {
        return Ok(None);
    }

    let include_deferred = write_phase == EntrypointsWritePhase::Deferred;
    let app_project = project.app_project().await?;
    let app_route_keys = if let Some(app_project) = &*app_project {
        app_project
            .route_keys()
            .await?
            .iter()
            .cloned()
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    Ok(Some(
        app_route_keys
            .iter()
            .filter(|route| {
                is_deferred_app_route(route.as_str(), deferred_entries) == include_deferred
            })
            .cloned()
            .collect::<Vec<_>>(),
    ))
}

#[tracing::instrument(level = "info", name = "write all entrypoints to disk", skip_all)]
#[napi(ts_return_type = "Promise<TurbopackResult<Partial<NapiEntrypoints>>>")]
pub async fn project_write_all_entrypoints_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    app_dir_only: bool,
) -> napi::Result<TurbopackResult<Option<NapiEntrypoints>>> {
    let ctx = &project.turbopack_ctx;
    let container = project.container;
    let tt = ctx.turbo_tasks();

    #[turbo_tasks::function(operation, root)]
    async fn has_deferred_entrypoints_operation(
        container: ResolvedVc<ProjectContainer>,
    ) -> Result<Vc<bool>> {
        let project = container.project();
        let deferred_entries = project.deferred_entries().owned().await?;

        if deferred_entries.is_empty() {
            return Ok(Vc::cell(false));
        }

        let app_project = project.app_project().await?;
        let has_deferred = if let Some(app_project) = &*app_project {
            app_project
                .route_keys()
                .await?
                .iter()
                .any(|route_key| is_deferred_app_route(route_key.as_str(), &deferred_entries))
        } else {
            false
        };

        Ok(Vc::cell(has_deferred))
    }

    let has_deferred_entrypoints = tt
        .run(async move {
            Ok(*has_deferred_entrypoints_operation(container)
                .read_strongly_consistent()
                .await?)
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;

    let phase_build_paths = if has_deferred_entrypoints {
        Some(
            tt.run(async move {
                #[turbo_tasks::value(serialization = "skip")]
                struct DeferredEntrypointInfo(ReadRef<Entrypoints>, ReadRef<Vec<RcStr>>);

                #[turbo_tasks::function(operation, root)]
                async fn deferred_entrypoint_info_operation(
                    container: ResolvedVc<ProjectContainer>,
                ) -> Result<Vc<DeferredEntrypointInfo>> {
                    let project = container.project();
                    Ok(DeferredEntrypointInfo(
                        project.entrypoints().await?,
                        project.deferred_entries().await?,
                    )
                    .cell())
                }

                let DeferredEntrypointInfo(entrypoints, deferred_entries) =
                    &*deferred_entrypoint_info_operation(container)
                        .read_strongly_consistent()
                        .await?;

                Ok(compute_deferred_phase_build_paths(
                    entrypoints,
                    deferred_entries,
                ))
            })
            .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
            .await?,
        )
    } else {
        None
    };

    if let Some(phase_build_paths) = phase_build_paths.as_ref() {
        let non_deferred_build_paths = phase_build_paths.non_deferred.clone();
        tt.run(async move {
            container
                .update(PartialProjectOptions {
                    debug_build_paths: Some(non_deferred_build_paths),
                    ..Default::default()
                })
                .await?;
            Ok(())
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;
    }

    let first_phase = if has_deferred_entrypoints {
        EntrypointsWritePhase::NonDeferred
    } else {
        EntrypointsWritePhase::All
    };

    let (mut entrypoints, mut issues) = tt
        .run(async move {
            let entrypoints_with_issues_op = get_all_written_entrypoints_with_issues_operation(
                container,
                app_dir_only,
                first_phase,
            );

            let read =
                read_strongly_consistent_and_apply_effects(entrypoints_with_issues_op, |v| {
                    &v.effects
                })
                .await?;
            let AllWrittenEntrypointsWithIssues {
                entrypoints,
                issues,
                ..
            } = &*read;

            Ok((
                entrypoints.clone(),
                issues.iter().cloned().collect::<Vec<_>>(),
            ))
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;

    if has_deferred_entrypoints {
        ctx.on_before_deferred_entries().await?;

        // onBeforeDeferredEntries can materialize deferred route source files on disk.
        // Build mode does not run a filesystem watcher, so force invalidation for the
        // deferred source subtrees before compiling deferred entrypoints.
        let deferred_invalidation_dirs = phase_build_paths
            .as_ref()
            .map(|paths| paths.deferred_invalidation_dirs.clone())
            .unwrap_or_default();

        tt.run(async move {
            invalidate_deferred_entry_source_dirs_after_callback(
                container,
                deferred_invalidation_dirs,
            )
            .await?;
            Ok(())
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;

        if let Some(phase_build_paths) = phase_build_paths.as_ref() {
            let all_build_paths = phase_build_paths.all.clone();
            tt.run(async move {
                container
                    .update(PartialProjectOptions {
                        debug_build_paths: Some(all_build_paths),
                        ..Default::default()
                    })
                    .await?;
                Ok(())
            })
            .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
            .await?;
        }

        let (deferred_entrypoints, deferred_issues) = tt
            .run(async move {
                let entrypoints_with_issues_op = get_all_written_entrypoints_with_issues_operation(
                    container,
                    app_dir_only,
                    EntrypointsWritePhase::Deferred,
                );

                let read =
                    read_strongly_consistent_and_apply_effects(entrypoints_with_issues_op, |v| {
                        &v.effects
                    })
                    .await?;
                let AllWrittenEntrypointsWithIssues {
                    entrypoints,
                    issues,
                    ..
                } = &*read;

                Ok((
                    entrypoints.clone(),
                    issues.iter().cloned().collect::<Vec<_>>(),
                ))
            })
            .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
            .await?;

        if deferred_entrypoints.is_some() {
            entrypoints = deferred_entrypoints;
        }
        issues.extend(deferred_issues);
    }

    let emit_issues = tt
        .run(async move {
            let emit_result_op = emit_all_output_assets_once_with_issues_operation(
                container,
                app_dir_only,
                has_deferred_entrypoints,
            );
            let read =
                read_strongly_consistent_and_apply_effects(emit_result_op, |v| &v.effects).await?;
            let OperationResult { issues, .. } = &*read;

            Ok(issues.clone())
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;

    issues.extend(emit_issues.iter().cloned());

    Ok(TurbopackResult {
        result: if let Some(entrypoints) = entrypoints {
            Some(NapiEntrypoints::from_entrypoints_op(&entrypoints, ctx)?)
        } else {
            None
        },
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
    })
}

#[turbo_tasks::function(operation, root)]
async fn get_all_written_entrypoints_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
    write_phase: EntrypointsWritePhase,
) -> Result<Vc<AllWrittenEntrypointsWithIssues>> {
    let entrypoints_operation = EntrypointsOperation::new(all_entrypoints_write_to_disk_operation(
        container,
        app_dir_only,
        write_phase,
    ));
    let filter = container.project().issue_filter().await?;
    let (entrypoints, issues, effects) =
        strongly_consistent_catch_collectables(entrypoints_operation, &filter).await?;
    Ok(AllWrittenEntrypointsWithIssues {
        entrypoints,
        issues,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation, root)]
pub async fn all_entrypoints_write_to_disk_operation(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
    write_phase: EntrypointsWritePhase,
) -> Result<Vc<Entrypoints>> {
    // Compute all outputs for this phase but do not emit to disk yet.
    let output_assets_operation = output_assets_operation(project, app_dir_only, write_phase);
    let _ = output_assets_operation.connect().await?;

    Ok(project.entrypoints())
}

#[turbo_tasks::function(operation)]
async fn output_assets_for_single_emit_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
    has_deferred_entrypoints: bool,
) -> Result<Vc<OutputAssets>> {
    if !has_deferred_entrypoints {
        return Ok(
            output_assets_operation(container, app_dir_only, EntrypointsWritePhase::All).connect(),
        );
    }

    let non_deferred_output_assets =
        output_assets_operation(container, app_dir_only, EntrypointsWritePhase::NonDeferred)
            .connect()
            .await?;
    let deferred_output_assets =
        output_assets_operation(container, app_dir_only, EntrypointsWritePhase::Deferred)
            .connect()
            .await?;

    let merged_output_assets: FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>> =
        non_deferred_output_assets
            .iter()
            .chain(deferred_output_assets.iter())
            .copied()
            .collect();

    Ok(Vc::cell(merged_output_assets.into_iter().collect()))
}

#[turbo_tasks::function(operation, root)]
async fn emit_all_output_assets_once_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
    has_deferred_entrypoints: bool,
) -> Result<Vc<Entrypoints>> {
    let output_assets_operation =
        output_assets_for_single_emit_operation(container, app_dir_only, has_deferred_entrypoints);
    container
        .project()
        .emit_all_output_assets(output_assets_operation)
        .as_side_effect()
        .await?;

    Ok(container.entrypoints())
}

#[turbo_tasks::function(operation, root)]
async fn emit_all_output_assets_once_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
    has_deferred_entrypoints: bool,
) -> Result<Vc<OperationResult>> {
    let entrypoints_operation = EntrypointsOperation::new(emit_all_output_assets_once_operation(
        container,
        app_dir_only,
        has_deferred_entrypoints,
    ));
    let filter = container.project().issue_filter().await?;
    let (_, issues, effects) =
        strongly_consistent_catch_collectables(entrypoints_operation, &filter).await?;

    Ok(OperationResult { issues, effects }.cell())
}

#[turbo_tasks::function(operation)]
async fn output_assets_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
    write_phase: EntrypointsWritePhase,
) -> Result<Vc<OutputAssets>> {
    let project = container.project();
    let deferred_entries = project.deferred_entries().owned().await?;
    let app_route_filter =
        app_route_filter_for_write_phase(project, write_phase, &deferred_entries).await?;

    let endpoint_groups = project
        .get_all_endpoint_groups_with_app_route_filter(app_dir_only, app_route_filter)
        .await?;

    let endpoints = endpoint_groups
        .iter()
        .filter(|(key, _)| should_include_endpoint_group(write_phase, key, &deferred_entries))
        .flat_map(|(_, group)| {
            group
                .primary
                .iter()
                .chain(group.additional.iter())
                .map(|entry| entry.endpoint)
        })
        .collect::<Vec<_>>();

    let endpoint_assets = endpoints
        .iter()
        .map(async |endpoint| endpoint.output().await?.output_assets.await)
        .try_join()
        .await?;

    let output_assets: FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>> = endpoint_assets
        .iter()
        .flat_map(|assets| assets.iter().copied())
        .collect();

    if write_phase == EntrypointsWritePhase::NonDeferred {
        return Ok(Vc::cell(output_assets.into_iter().collect()));
    }

    let whole_app_module_graphs = project.whole_app_module_graphs();
    // This makes the trace file nicer to look at
    whole_app_module_graphs.as_side_effect().await?;

    let nft = next_server_nft_assets(project).await?;
    let routes_hashes_manifest = routes_hashes_manifest_asset_if_enabled(project).await?;
    let immutable_hashes_manifest_asset =
        immutable_hashes_manifest_asset_if_enabled(project).await?;

    Ok(Vc::cell(
        output_assets
            .into_iter()
            .chain(nft.iter().copied())
            .chain(routes_hashes_manifest.iter().copied())
            .chain(immutable_hashes_manifest_asset.iter().copied())
            .collect(),
    ))
}

#[tracing::instrument(level = "info", name = "get entrypoints", skip_all)]
#[napi(ts_return_type = "Promise<TurbopackResult<Partial<NapiEntrypoints>>>")]
pub async fn project_entrypoints(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<TurbopackResult<Option<NapiEntrypoints>>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    let (entrypoints, issues) = ctx
        .turbo_tasks()
        .run_once(async move {
            let entrypoints_with_issues_op = get_entrypoints_with_issues_operation(container);

            // Read and compile the files
            let EntrypointsWithIssues {
                entrypoints,
                issues,
                effects: _,
            } = &*entrypoints_with_issues_op
                .read_strongly_consistent()
                .await?;

            Ok((entrypoints.clone(), issues.clone()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    let result = match entrypoints {
        Some(entrypoints) => Some(NapiEntrypoints::from_entrypoints_op(&entrypoints, &ctx)?),
        None => None,
    };

    Ok(TurbopackResult {
        result,
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
    })
}

#[tracing::instrument(level = "info", name = "subscribe to entrypoints", skip_all)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_entrypoints_subscribe(
    env: Env,
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    #[napi(ts_arg_type = "(err: Error, value: TurbopackResult<Partial<NapiEntrypoints>>) => void")]
    func: FunctionRef<TurbopackResult<Option<NapiEntrypoints>>, ()>,
) -> napi::Result<External<RootTask>> {
    let turbopack_ctx = project.turbopack_ctx.clone();
    let container = project.container;
    subscribe(
        turbopack_ctx.clone(),
        &env,
        &func,
        move || {
            async move {
                let entrypoints_with_issues_op = get_entrypoints_with_issues_operation(container);
                let read =
                    read_strongly_consistent_and_apply_effects(entrypoints_with_issues_op, |v| {
                        &v.effects
                    })
                    .await?;
                let EntrypointsWithIssues {
                    entrypoints,
                    issues,
                    ..
                } = &*read;
                Ok((entrypoints.clone(), issues.clone()))
            }
            .instrument(tracing::info_span!("entrypoints subscription"))
        },
        move |ctx| {
            let (entrypoints, issues) = ctx.value;
            let result = match entrypoints {
                Some(entrypoints) => Some(NapiEntrypoints::from_entrypoints_op(
                    &entrypoints,
                    &turbopack_ctx,
                )?),
                None => None,
            };

            Ok(TurbopackResult {
                result,
                issues: issues
                    .iter()
                    .map(|issue| NapiIssue::from(&**issue))
                    .collect(),
            })
        },
    )
}

#[turbo_tasks::value(serialization = "skip")]
struct HmrUpdateWithIssues {
    update: ReadRef<Update>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation, root)]
fn project_hmr_update_operation(
    project: ResolvedVc<Project>,
    chunk_name: RcStr,
    state: ResolvedVc<VersionState>,
) -> Vc<Update> {
    project.hmr_update(chunk_name, *state)
}

#[tracing::instrument(
    level = "info",
    name = "hmr subscription",
    skip_all,
    fields(chunk_name = %chunk_name),
)]
#[turbo_tasks::function(operation, root)]
async fn hmr_update_with_issues_operation(
    project: ResolvedVc<Project>,
    chunk_name: RcStr,
    state: ResolvedVc<VersionState>,
) -> Result<Vc<HmrUpdateWithIssues>> {
    tracing::info!(chunk_name = %chunk_name, "hmr subscription");
    let update_op = project_hmr_update_operation(project, chunk_name, state);
    // NOTE: we do not use `strongly_consistent_catch_collectables` here. The JS HMR
    // consumers in `hot-reloader-turbopack.ts` (`subscribeToServerHmr` and
    // `subscribeToClientHmrEvents`) rely on this read *throwing* on build-graph
    // failures to trigger their recovery paths
    let update = update_op.read_strongly_consistent().await?;
    let filter = project.issue_filter().await?;
    let issues = get_issues(update_op, &filter).await?;
    let effects = Arc::new(take_effects(update_op).await?);
    Ok(HmrUpdateWithIssues {
        update,
        issues,
        effects,
    }
    .cell())
}

/// Aggregate counterpart to [`project_hmr_update_operation`].
#[turbo_tasks::function(operation, root)]
fn project_server_hmr_update_operation(
    project: ResolvedVc<Project>,
    state: ResolvedVc<VersionState>,
) -> Vc<Update> {
    project.server_hmr_update(*state)
}

/// Aggregate counterpart to [`hmr_update_with_issues_operation`].
#[tracing::instrument(level = "info", name = "server hmr subscription", skip_all)]
#[turbo_tasks::function(operation, root)]
async fn server_hmr_update_with_issues_operation(
    project: ResolvedVc<Project>,
    state: ResolvedVc<VersionState>,
) -> Result<Vc<HmrUpdateWithIssues>> {
    tracing::info!("server hmr subscription");
    let update_op = project_server_hmr_update_operation(project, state);
    // See `hmr_update_with_issues_operation`: the JS consumer relies on this
    // read *throwing* on build-graph failures; don't swallow errors.
    let update = update_op
        .read_strongly_consistent()
        .final_read_hint()
        .await?;
    let filter = project.issue_filter().await?;
    let issues = get_issues(update_op, &filter).await?;
    let effects = Arc::new(take_effects(update_op).await?);
    Ok(HmrUpdateWithIssues {
        update,
        issues,
        effects,
    }
    .cell())
}

#[tracing::instrument(
    level = "info",
    name = "get server HMR events",
    skip(env, project, func)
)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_server_hmr_events(
    env: Env,
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    #[napi(ts_arg_type = "(err: Error, value: TurbopackResult<NodeJsHmrUpdate>) => void")]
    func: FunctionRef<TurbopackResult<Unknown<'static>>, ()>,
) -> napi::Result<External<RootTask>> {
    let container = project.container;
    // Sentinel resource id for the aggregated stream (no real chunk path).
    let identifier_path: RcStr = rcstr!("__next_all_hmr__");
    subscribe(
        project.turbopack_ctx.clone(),
        &env,
        &func,
        move || async move {
            // HACK(bgw): Remove this unmark call
            unmark_top_level_task_may_leak_eventually_consistent_state();

            let project = container.project().to_resolved().await?;
            let state = project.server_hmr_version_state().to_resolved().await?;

            let update_op = server_hmr_update_with_issues_operation(project, state);

            // HACK(bgw): Remove this mark call
            mark_top_level_task();

            let read =
                read_strongly_consistent_and_apply_effects(update_op, |v| &v.effects).await?;

            // HACK(bgw): Remove this unmark call
            unmark_top_level_task_may_leak_eventually_consistent_state();

            let HmrUpdateWithIssues { update, issues, .. } = &*read;
            match &**update {
                Update::Missing | Update::None => {}
                Update::Total(TotalUpdate { to }) => {
                    state.set(to.clone()).await?;
                }
                Update::Partial(PartialUpdate { to, .. }) => {
                    state.set(to.clone()).await?;
                }
            }
            Ok((Some(update.clone()), issues.clone()))
        },
        move |ctx| {
            let (update, issues) = ctx.value;

            let napi_issues = issues
                .iter()
                .map(|issue| NapiIssue::from(&**issue))
                .collect();
            let update_issues = issues
                .iter()
                .map(|issue| Issue::from(&**issue))
                .collect::<Vec<_>>();

            let identifier = ResourceIdentifier {
                path: identifier_path.clone(),
                headers: None,
            };
            let update = match update.as_deref() {
                None | Some(Update::Missing) | Some(Update::Total(_)) => {
                    ClientUpdateInstruction::restart(&identifier, &update_issues)
                }
                Some(Update::Partial(update)) => ClientUpdateInstruction::partial(
                    &identifier,
                    &update.instruction,
                    &update_issues,
                ),
                Some(Update::None) => ClientUpdateInstruction::issues(&identifier, &update_issues),
            };

            Ok(TurbopackResult {
                result: ctx.env.to_js_value(&update)?,
                issues: napi_issues,
            })
        },
    )
}

#[tracing::instrument(level = "info", name = "get client HMR events", skip(env, project, func), fields(chunk_name = %chunk_name))]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_client_hmr_events(
    env: Env,
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    chunk_name: RcStr,
    #[napi(ts_arg_type = "(err: Error, value: TurbopackResult<Update>) => void")] func: FunctionRef<
        TurbopackResult<Unknown<'static>>,
        (),
    >,
) -> napi::Result<External<RootTask>> {
    let container = project.container;
    let session = TransientInstance::new(());
    subscribe(
        project.turbopack_ctx.clone(),
        &env,
        &func,
        {
            let outer_chunk_name = chunk_name.clone();
            let session = session.clone();
            move || {
                let chunk_name: RcStr = outer_chunk_name.clone();
                let session = session.clone();
                async move {
                    // HACK(bgw): Remove this unmark call
                    unmark_top_level_task_may_leak_eventually_consistent_state();
                    let project = container.project().to_resolved().await?;
                    let state = project
                        .hmr_version_state(chunk_name.clone(), session)
                        .to_resolved()
                        .await?;

                    let update_op =
                        hmr_update_with_issues_operation(project, chunk_name.clone(), state);
                    // HACK(bgw): Remove this mark call
                    mark_top_level_task();
                    let read =
                        read_strongly_consistent_and_apply_effects(update_op, |v| &v.effects)
                            .await?;
                    // HACK(bgw): Remove this unmark call
                    unmark_top_level_task_may_leak_eventually_consistent_state();
                    let HmrUpdateWithIssues { update, issues, .. } = &*read;
                    match &**update {
                        Update::Missing | Update::None => {}
                        Update::Total(TotalUpdate { to }) => {
                            state.set(to.clone()).await?;
                        }
                        Update::Partial(PartialUpdate { to, .. }) => {
                            state.set(to.clone()).await?;
                        }
                    }
                    Ok((Some(update.clone()), issues.clone()))
                }
            }
        },
        move |ctx| {
            let (update, issues) = ctx.value;

            let napi_issues = issues
                .iter()
                .map(|issue| NapiIssue::from(&**issue))
                .collect();
            let update_issues = issues
                .iter()
                .map(|issue| Issue::from(&**issue))
                .collect::<Vec<_>>();

            let identifier = ResourceIdentifier {
                path: chunk_name.clone(),
                headers: None,
            };
            let update = match update.as_deref() {
                None | Some(Update::Missing) | Some(Update::Total(_)) => {
                    ClientUpdateInstruction::restart(&identifier, &update_issues)
                }
                Some(Update::Partial(update)) => ClientUpdateInstruction::partial(
                    &identifier,
                    &update.instruction,
                    &update_issues,
                ),
                Some(Update::None) => ClientUpdateInstruction::issues(&identifier, &update_issues),
            };

            Ok(TurbopackResult {
                result: ctx.env.to_js_value(&update)?,
                issues: napi_issues,
            })
        },
    )
}

#[napi(object, object_from_js = false)]
pub struct HmrChunkNames {
    pub chunk_names: Vec<RcStr>,
}

#[turbo_tasks::value(serialization = "skip")]
struct HmrChunkNamesWithIssues {
    chunk_names: ReadRef<Vec<RcStr>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation, root)]
fn project_client_hmr_chunk_names_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Vc<Vec<RcStr>> {
    container.hmr_chunk_names()
}

#[turbo_tasks::function(operation, root)]
async fn get_client_hmr_chunk_names_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Result<Vc<HmrChunkNamesWithIssues>> {
    let hmr_chunk_names_op = project_client_hmr_chunk_names_operation(container);
    // Do NOT switch this to `strongly_consistent_catch_collectables`. The JS HMR
    // chunk-names consumer in `hot-reloader-turbopack.ts` relies on this read
    // *throwing* on build-graph failures so its outer `try` block exits the
    // subscription loop. Swallowing the error and emitting an empty chunk-name
    // list keeps the loop running but with stale state, and obscures the real
    // failure from the dev server log.
    let hmr_chunk_names = hmr_chunk_names_op.read_strongly_consistent().await?;
    let filter = container.project().issue_filter().await?;
    let issues = get_issues(hmr_chunk_names_op, &filter).await?;
    let effects = Arc::new(take_effects(hmr_chunk_names_op).await?);
    Ok(HmrChunkNamesWithIssues {
        chunk_names: hmr_chunk_names,
        issues,
        effects,
    }
    .cell())
}

#[tracing::instrument(
    level = "info",
    name = "get client HMR chunk names",
    skip(env, project, func)
)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_client_hmr_chunk_names_subscribe(
    env: Env,
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    #[napi(ts_arg_type = "(err: Error, value: TurbopackResult<HmrChunkNames>) => void")]
    func: FunctionRef<TurbopackResult<HmrChunkNames>, ()>,
) -> napi::Result<External<RootTask>> {
    let container = project.container;
    subscribe(
        project.turbopack_ctx.clone(),
        &env,
        &func,
        move || async move {
            let hmr_chunk_names_with_issues_op =
                get_client_hmr_chunk_names_with_issues_operation(container);
            let read =
                read_strongly_consistent_and_apply_effects(hmr_chunk_names_with_issues_op, |v| {
                    &v.effects
                })
                .await?;
            let HmrChunkNamesWithIssues {
                chunk_names,
                issues,
                ..
            } = &*read;

            Ok((chunk_names.clone(), issues.clone()))
        },
        move |ctx| {
            let (chunk_names, issues) = ctx.value;

            Ok(TurbopackResult {
                result: HmrChunkNames {
                    chunk_names: ReadRef::into_owned(chunk_names),
                },
                issues: issues
                    .iter()
                    .map(|issue| NapiIssue::from(&**issue))
                    .collect(),
            })
        },
    )
}

pub enum UpdateMessage {
    Start,
    End(UpdateInfo),
}

#[napi(object, object_from_js = false)]
pub struct NapiUpdateMessage {
    pub update_type: &'static str,
    pub value: Option<NapiUpdateInfo>,
}

impl From<UpdateMessage> for NapiUpdateMessage {
    fn from(update_message: UpdateMessage) -> Self {
        match update_message {
            UpdateMessage::Start => NapiUpdateMessage {
                update_type: "start",
                value: None,
            },
            UpdateMessage::End(info) => NapiUpdateMessage {
                update_type: "end",
                value: Some(info.into()),
            },
        }
    }
}

#[napi(object, object_from_js = false)]
pub struct NapiUpdateInfo {
    pub duration: u32,
    pub tasks: u32,
}

impl From<UpdateInfo> for NapiUpdateInfo {
    fn from(update_info: UpdateInfo) -> Self {
        Self {
            duration: update_info.duration.as_millis() as u32,
            tasks: update_info.tasks as u32,
        }
    }
}

/// Subscribes to lifecycle events of the compilation.
///
/// Emits an [UpdateMessage::Start] event when any computation starts.
/// Emits an [UpdateMessage::End] event when there was no computation for the
/// specified time (`aggregation_ms`). The [UpdateMessage::End] event contains
/// information about the computations that happened since the
/// [UpdateMessage::Start] event. It contains the duration of the computation
/// (excluding the idle time that was spend waiting for `aggregation_ms`), and
/// the number of tasks that were executed.
///
/// The signature of the `func` is `(update_message: UpdateMessage) => void`.
#[napi]
pub fn project_update_info_subscribe(
    env: Env,
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    aggregation_ms: u32,
    #[napi(ts_arg_type = "(err: Error, value: TurbopackResult<UpdateMessage>) => void")]
    func: FunctionRef<NapiUpdateMessage, ()>,
) -> napi::Result<()> {
    let func: ThreadsafeFunction<UpdateMessage, (), NapiUpdateMessage, Status, true> = func
        .borrow_back(&env)?
        .build_threadsafe_function::<UpdateMessage>()
        .callee_handled::<true>()
        .build_callback(|ctx| {
            let message = ctx.value;
            Ok(NapiUpdateMessage::from(message))
        })?;
    let tt = project.turbopack_ctx.turbo_tasks().clone();
    within_runtime_if_available(|| {
        tokio::spawn(async move {
            loop {
                let update_info = tt
                    .aggregated_update_info(Duration::ZERO, Duration::ZERO)
                    .await;

                func.call(
                    Ok(UpdateMessage::Start),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );

                let update_info = match update_info {
                    Some(update_info) => update_info,
                    None => {
                        tt.get_or_wait_aggregated_update_info(Duration::from_millis(
                            aggregation_ms.into(),
                        ))
                        .await
                    }
                };

                let status = func.call(
                    Ok(UpdateMessage::End(update_info)),
                    ThreadsafeFunctionCallMode::NonBlocking,
                );

                if !matches!(status, Status::Ok) {
                    let error = anyhow!("Error calling JS function: {}", status);
                    eprintln!("{error}");
                    break;
                }
            }
        });
    });
    Ok(())
}

#[napi(object, object_from_js = false)]
pub struct NapiCompilationEvent {
    pub type_name: &'static str,
    pub severity: String,
    pub message: String,
    pub event_json: String,
    #[napi(ts_type = "unknown")]
    pub event_data: External<Arc<dyn CompilationEvent>>,
}

impl From<Arc<dyn CompilationEvent>> for NapiCompilationEvent {
    fn from(event: Arc<dyn CompilationEvent>) -> Self {
        NapiCompilationEvent {
            type_name: event.type_name(),
            severity: event.severity().to_string(),
            message: event.message(),
            event_json: event.to_json(),
            event_data: External::new(event),
        }
    }
}

/// Subscribes to all compilation events that are not cached like timing and progress information.
#[napi]
pub fn project_compilation_events_subscribe(
    env: Env,
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    #[napi(ts_arg_type = "(err: Error, value: TurbopackResult<CompilationEvent>) => void")]
    func: FunctionRef<NapiCompilationEvent, ()>,
    event_types: Option<Vec<String>>,
) -> napi::Result<()> {
    let tsfn: ThreadsafeFunction<
        Arc<dyn CompilationEvent>,
        (),
        NapiCompilationEvent,
        Status,
        true,
    > = func
        .borrow_back(&env)?
        .build_threadsafe_function::<Arc<dyn CompilationEvent>>()
        .callee_handled::<true>()
        .build_callback(|ctx| Ok(NapiCompilationEvent::from(ctx.value)))?;

    let tt = project.turbopack_ctx.turbo_tasks().clone();
    within_runtime_if_available(|| {
        tokio::spawn(async move {
            let mut receiver = tt.subscribe_to_compilation_events(event_types);
            while let Some(msg) = receiver.recv().await {
                let status = tsfn.call(Ok(msg), ThreadsafeFunctionCallMode::Blocking);

                if status != Status::Ok {
                    break;
                }
            }
            // Signal the JS side that the subscription has ended (e.g. after
            // project shutdown drops all senders). This allows the async
            // iterator to exit promptly instead of hanging forever.
            let _ = tsfn.call(
                Err(napi::Error::new(
                    Status::Cancelled,
                    "compilation events subscription closed",
                )),
                ThreadsafeFunctionCallMode::Blocking,
            );
        });
    });

    Ok(())
}

#[napi(object)]
#[turbo_tasks::task_input]
#[derive(Clone, Debug, Eq, Hash, OperationValue, PartialEq, TraceRawVcs, Encode, Decode)]
pub struct StackFrame {
    pub is_server: bool,
    pub is_ignored: Option<bool>,
    pub original_file: Option<RcStr>,
    pub file: RcStr,
    /// 1-indexed, unlike source map tokens
    pub line: Option<u32>,
    /// 1-indexed, unlike source map tokens
    pub column: Option<u32>,
    pub method_name: Option<RcStr>,
}

#[turbo_tasks::value(transparent)]
#[derive(Clone)]
pub struct OptionStackFrame(Option<StackFrame>);

/// Parses a stack-frame source URL — either a `file://` URL (with an optional `id` query parameter
/// identifying the module) or a raw system path — into a system path and an optional module id,
/// for use with [`get_source_map_rope`].
///
/// The returned path is canonicalized (with a lexical fallback if the file no longer exists).
/// Canonicalization (not just lexical normalization) is needed because the path is later compared
/// against paths derived from the canonicalized project root, and two spellings of a path only
/// compare equal once both are reduced to the same canonical form. Canonicalization performs
/// untracked filesystem reads, so this must be called from the napi layer, outside of any (cached)
/// turbo-tasks function.
fn parse_and_canonicalize_source_url(source_url: &str) -> Result<(RcStr, Option<RcStr>)> {
    let (path, module) = match Url::parse(source_url) {
        Ok(url) => match url.scheme() {
            "file" => {
                let Ok(path) = url.to_file_path() else {
                    bail!("Failed to convert file URL to file path: {url}");
                };
                let module = url.query_pairs().find(|(k, _)| k == "id");
                (
                    path,
                    match module {
                        Some(module) => Some(urlencoding::decode(&module.1)?.into_owned().into()),
                        None => None,
                    },
                )
            }
            _ => bail!("Unknown url scheme '{}'", url.scheme()),
        },
        Err(_) => (PathBuf::from(source_url), None),
    };

    // Canonicalization resolves symlinks and (on Windows) yields a verbatim path with a
    // case-folded drive letter and on-disk casing, matching the canonicalized project root.
    let path = match canonicalize(&path) {
        Ok(canonical) => canonical,
        Err(_) => {
            // The file may not exist (e.g. a stale stack frame). Fall back to a purely lexical
            // normalization that approximates the canonical format.
            #[cfg(windows)]
            {
                to_verbatim_with_case_folded_disk(&path).unwrap_or(path)
            }
            #[cfg(not(windows))]
            {
                path
            }
        }
    };

    let path = path
        .into_string()
        .map(RcStr::from)
        .map_err(|p| anyhow!("path {p:?} is not valid unicode"))?;
    Ok((path, module))
}

/// `file_path_sys` and `module` must be produced by [`parse_and_canonicalize_source_url`], which
/// canonicalizes the path. That must happen in the napi layer: this is a cached turbo-tasks
/// function, so it cannot perform untracked reads like canonicalization itself.
#[turbo_tasks::function]
async fn get_source_map_rope(
    container: Vc<ProjectContainer>,
    sys_path: RcStr,
    module: Option<RcStr>,
) -> Result<Vc<FileContent>> {
    let sys_path = Path::new(&*sys_path);

    let project = container.project();
    let output_fs = project.output_fs().to_resolved().await?;
    let Some(fs_path) = output_fs
        .await?
        .try_from_sys_path(output_fs, sys_path, None)
    else {
        // The path is outside of the filesystem root
        return Ok(FileContent::NotFound.cell());
    };

    let node_root = project.node_root().await?;
    let Some(chunk_base_unix) = node_root.get_path_to(&fs_path).map(ToOwned::to_owned) else {
        // The path is not within the dist dir
        return Ok(FileContent::NotFound.cell());
    };

    let client_relative_path = project.client_relative_path().await?;
    let client_path = client_relative_path.join(&chunk_base_unix)?;

    // `fs_path` is the server path: it's inside `node_root`, and `output_fs` is the filesystem
    // that `node_root` uses.
    let mut map = container.get_source_map(fs_path, module.clone());

    if !map.await?.is_content() {
        // If the chunk doesn't exist as a server chunk, try a client chunk.
        // TODO: Properly tag all server chunks and use the `isServer` query param.
        // Currently, this is inaccurate as it does not cover RSC server
        // chunks.
        map = container.get_source_map(client_path, module.clone());
        if !map.await?.is_content() {
            // An older revision of a chunk's sourcemap may be requested by an HMR client. We
            // remove stale entries from the VersionStateMap but a client may be holding onto a
            // reference to a stale chunk and requesting its sourcmemap via the error
            // overlay.
            //
            // This exists because we don't have logic for the server hmr client to mark which
            // chunks it's no longer using.
            //
            // Fall back to reading from the filesystem.
            let map_relative = format!("{chunk_base_unix}.map");
            let server_map = node_root.join(&map_relative)?.read();
            if server_map.await?.is_content() {
                return Ok(server_map);
            }
            let client_map = client_relative_path.join(&map_relative)?.read();
            if client_map.await?.is_content() {
                return Ok(client_map);
            }
            bail!("chunk/module {sys_path:?} (module: {module:?}) is missing a sourcemap");
        }
    }

    Ok(map)
}

/// See [`get_source_map_rope`]: `file_path_sys` and `module` must be produced by
/// [`parse_and_canonicalize_source_url`] in the napi layer.
#[turbo_tasks::function(operation, root)]
fn get_source_map_rope_operation(
    container: ResolvedVc<ProjectContainer>,
    file_path_sys: RcStr,
    module: Option<RcStr>,
) -> Vc<FileContent> {
    get_source_map_rope(*container, file_path_sys, module)
}

/// `frame_file_path_sys` and `frame_module` are the normalized form of `frame.file`, and must be
/// produced by [`parse_and_canonicalize_source_url`] in the napi layer (see
/// [`get_source_map_rope`]).
#[turbo_tasks::function(operation, root)]
async fn project_trace_source_operation(
    container: ResolvedVc<ProjectContainer>,
    frame: StackFrame,
    frame_file_path_sys: RcStr,
    frame_module: Option<RcStr>,
    current_directory_file_url: RcStr,
) -> Result<Vc<OptionStackFrame>> {
    let Some(map) = &*SourceMap::new_from_rope_cached(get_source_map_rope(
        *container,
        frame_file_path_sys,
        frame_module,
    ))
    .await?
    else {
        return Ok(Vc::cell(None));
    };

    let Some(line) = frame.line else {
        return Ok(Vc::cell(None));
    };

    let token = map.lookup_token(
        line.saturating_sub(1),
        frame.column.unwrap_or(1).saturating_sub(1),
    );

    let (original_file, line, column, method_name, is_ignored) = match token {
        Token::Original(token) => (
            // Still percent-encoded, like the URIs it's compared against.
            token.original_file,
            // JS stack frames are 1-indexed, source map tokens are 0-indexed
            Some(token.original_line + 1),
            Some(token.original_column + 1),
            token.name,
            token.is_ignored,
        ),
        Token::Synthetic(token) => {
            let Some(original_file) = token.guessed_original_file else {
                return Ok(Vc::cell(None));
            };
            (original_file, None, None, None, false)
        }
    };

    // Turns a percent-encoded URI fragment back into a path for output.
    fn decode_uri_fragment(value: &str) -> Result<RcStr> {
        Ok(match urlencoding::decode(value)? {
            Cow::Borrowed(borrowed) => RcStr::from(borrowed),
            Cow::Owned(owned) => RcStr::from(owned),
        })
    }

    let project_root_uri =
        uri_from_file(container.project().project_root_path().owned().await?, None).await? + "/";
    // Relative paths are computed on decoded inputs: they come from
    // different encoders that disagree on characters like `[` vs `%5B`.
    let current_directory_path = decode_uri_fragment(&current_directory_file_url)?;
    let (file, original_file) =
        if let Some(source_file) = original_file.strip_prefix(&project_root_uri) {
            // Client code uses file://
            (
                RcStr::from(
                    get_relative_path_to(
                        &current_directory_path,
                        &decode_uri_fragment(&original_file)?,
                    )
                    // TODO(sokra) remove this to include a ./ here to make it a relative path
                    .trim_start_matches("./"),
                ),
                Some(decode_uri_fragment(source_file)?),
            )
        } else if let Some(source_file) = original_file.strip_prefix(&*SOURCE_MAP_PREFIX_PROJECT) {
            // Server code uses turbopack:///[project]
            // TODO should this also be file://?
            let source_file = decode_uri_fragment(source_file)?;
            (
                RcStr::from(
                    get_relative_path_to(
                        &current_directory_path,
                        &format!("{}{}", decode_uri_fragment(&project_root_uri)?, source_file),
                    )
                    // TODO(sokra) remove this to include a ./ here to make it a relative path
                    .trim_start_matches("./"),
                ),
                Some(source_file),
            )
        } else if let Some(source_file) = original_file.strip_prefix(&*SOURCE_MAP_PREFIX) {
            // TODO(veil): Should the protocol be preserved?
            (decode_uri_fragment(source_file)?, None)
        } else {
            bail!(
                "Original file ({}) outside project ({})",
                original_file,
                project_root_uri
            )
        };

    Ok(Vc::cell(Some(StackFrame {
        file,
        original_file,
        method_name,
        line,
        column,
        is_server: frame.is_server,
        is_ignored: Some(is_ignored),
    })))
}

#[tracing::instrument(level = "info", name = "apply SourceMap to stack frame", skip_all)]
#[napi(ts_return_type = "Promise<StackFrame | null>")]
pub async fn project_trace_source(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    frame: StackFrame,
    current_directory_file_url: String,
) -> napi::Result<Option<StackFrame>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    // Normalization canonicalizes (an untracked read), so it must happen here, outside of the
    // cached turbo-tasks functions below.
    let (frame_file_path_sys, frame_module) = parse_and_canonicalize_source_url(&frame.file)
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    ctx.turbo_tasks()
        .run(async move {
            let traced_frame = project_trace_source_operation(
                container,
                frame,
                frame_file_path_sys,
                frame_module,
                RcStr::from(current_directory_file_url),
            )
            .read_strongly_consistent()
            .await?;
            Ok(ReadRef::into_owned(traced_frame))
        })
        // HACK: Don't use `TurbopackInternalError`, this function is race-condition prone
        // (the source files may have changed or been deleted), so these probably aren't
        // internal errors? Ideally we should differentiate.
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e.into()).to_string()))
}

#[tracing::instrument(level = "info", name = "get source content for asset", skip_all)]
#[napi(ts_return_type = "Promise<string | null>")]
pub async fn project_get_source_for_asset(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    file_path: RcStr,
) -> napi::Result<Option<String>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    ctx.turbo_tasks()
        .run(async move {
            #[turbo_tasks::function(operation, root)]
            async fn source_content_operation(
                container: ResolvedVc<ProjectContainer>,
                file_path: RcStr,
            ) -> Result<Vc<FileContent>> {
                let project_path = container.project().project_path().await?;
                Ok(project_path.fs().root().await?.join(&file_path)?.read())
            }

            let source_content = &*source_content_operation(container, file_path.clone())
                .read_strongly_consistent()
                .await?;

            let FileContent::Content(source_content) = source_content else {
                bail!("Cannot find source for asset {}", file_path);
            };

            Ok(Some(source_content.content().to_str()?.into_owned()))
        })
        // HACK: Don't use `TurbopackInternalError`, this function is race-condition prone
        // (the source files may have changed or been deleted), so these probably aren't
        // internal errors? Ideally we should differentiate.
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e.into()).to_string()))
}

async fn project_get_source_map_inner(
    ctx: NextTurbopackContext,
    container: ResolvedVc<ProjectContainer>,
    file_path_sys: RcStr,
    module: Option<RcStr>,
) -> napi::Result<Option<String>> {
    ctx.turbo_tasks()
        .run(async move {
            let source_map = get_source_map_rope_operation(container, file_path_sys, module)
                .read_strongly_consistent()
                .await?;
            let Some(map) = source_map.as_content() else {
                return Ok(None);
            };
            Ok(Some(map.content().to_str()?.to_string()))
        })
        // HACK: Don't use `TurbopackInternalError`, this function is race-condition prone (the
        // source files may have changed or been deleted), so these probably aren't internal errors?
        // Ideally we should differentiate.
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e.into()).to_string()))
}

#[tracing::instrument(level = "info", name = "get SourceMap for asset", skip_all)]
#[napi(ts_return_type = "Promise<string | null>")]
pub async fn project_get_source_map(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    source_map_url: RcStr,
) -> napi::Result<Option<String>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    // Normalization canonicalizes (an untracked read), so it must happen here, outside of the
    // cached turbo-tasks functions below.
    let (file_path_sys, module) = parse_and_canonicalize_source_url(&source_map_url)
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    project_get_source_map_inner(ctx, container, file_path_sys, module).await
}

#[napi]
pub fn project_get_source_map_sync(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    source_map_url: RcStr,
) -> napi::Result<Option<String>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    let (file_path_sys, module) = parse_and_canonicalize_source_url(&source_map_url)
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    within_runtime_if_available(|| {
        tokio::runtime::Handle::current().block_on(project_get_source_map_inner(
            ctx,
            container,
            file_path_sys,
            module,
        ))
    })
}

#[napi]
pub async fn project_write_analyze_data(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
    app_dir_only: bool,
) -> napi::Result<TurbopackResult<()>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    let issues = ctx
        .turbo_tasks()
        .run_once(async move {
            let analyze_data_op = write_analyze_data_with_issues_operation(container, app_dir_only);
            // Write the files to disk
            let read =
                read_strongly_consistent_and_apply_effects(analyze_data_op, |v| &v.effects).await?;
            let WriteAnalyzeResult { issues, .. } = &*read;
            Ok(issues.clone())
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(TurbopackResult {
        result: (),
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
    })
}

#[turbo_tasks::function(operation, root)]
async fn get_all_compilation_issues_inner_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Result<Vc<()>> {
    let project = container.project();
    // Build the whole app module graph without chunking, code gen, or disk emission.
    // We use whole_app_module_graphs_without_dropping_issues() instead of
    // whole_app_module_graphs() because the latter drops issues in development mode
    // (to avoid duplicate per-route HMR noise). The non-dropping variant ensures issues
    // like missing modules and transform errors are properly collected as collectables here.
    project
        .whole_app_module_graphs_without_dropping_issues()
        .as_side_effect()
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function(operation, root)]
async fn get_all_compilation_issues_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Result<Vc<OperationResult>> {
    let inner_op = get_all_compilation_issues_inner_operation(container);
    let filter = container.project().issue_filter().await?;
    let (_, issues, effects) = strongly_consistent_catch_collectables(inner_op, &filter).await?;
    Ok(OperationResult { issues, effects }.cell())
}

/// Returns the build-feature-usage telemetry summary for this project — the set of
/// `(featureName, invocationCount)` pairs reported to the Next.js telemetry service.
///
/// Intended to be called once at the end of a build, after `writeAllEntrypointsToDisk`. The
/// summary is computed by walking the whole-app module graph and is cached by turbo-tasks, so the
/// call is cheap when the graph is already materialized.
#[tracing::instrument(level = "info", name = "get project feature usage", skip_all)]
#[napi]
pub async fn project_feature_usage(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<Vec<NapiUsedFeature>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    let summary = ctx
        .turbo_tasks()
        .run_once(async move {
            #[turbo_tasks::function(operation, root)]
            async fn project_feature_usage_operation(
                container: ResolvedVc<ProjectContainer>,
            ) -> Result<Vc<ProjectFeatureUsageSummary>> {
                Ok(container.project().project_feature_usage())
            }
            project_feature_usage_operation(container)
                .read_strongly_consistent()
                .await
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(summary
        .features
        .iter()
        .map(|(name, count)| NapiUsedFeature::new(name.clone(), *count))
        .collect())
}

#[tracing::instrument(level = "info", name = "get all compilation issues", skip_all)]
#[napi]
pub async fn project_get_all_compilation_issues(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: &External<ProjectInstance>,
) -> napi::Result<TurbopackResult<()>> {
    let ctx = project.turbopack_ctx.clone();
    let container = project.container;
    let issues = ctx
        .turbo_tasks()
        .run_once(async move {
            let op = get_all_compilation_issues_operation(container);
            let OperationResult { issues, effects: _ } = &*op.read_strongly_consistent().await?;
            Ok(issues.clone())
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(TurbopackResult {
        result: (),
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
    })
}

/// Opens the Turbopack persistent cache database at the given path and performs a full compaction.
///
/// The `path` should point to the `<distDir>/cache/turbopack` directory.
#[napi]
pub async fn turbopack_database_compact(path: String, next_version: String) -> napi::Result<()> {
    let describe = crate::next_api::turbopack_ctx::cache_describe(&next_version);
    let version_info = crate::next_api::turbopack_ctx::git_version_info(&describe);
    let is_ci = std::env::var("CI").is_ok_and(|v| !v.is_empty());
    turbo_tasks_backend::compact_database(&PathBuf::from(path), &version_info, is_ci)
        .map_err(|e| napi::Error::from_reason(format!("Database compaction failed: {e}")))?;
    Ok(())
}
