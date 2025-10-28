use std::{borrow::Cow, io::Write, path::PathBuf, sync::Arc, thread, time::Duration};

use anyhow::{Context, Result, anyhow, bail};
use flate2::write::GzEncoder;
use futures_util::TryFutureExt;
use napi::{
    Env, JsFunction, JsObject, Status,
    bindgen_prelude::{External, within_runtime_if_available},
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use next_api::{
    entrypoints::Entrypoints,
    next_server_nft::next_server_nft_assets,
    operation::{
        EntrypointsOperation, InstrumentationOperation, MiddlewareOperation, OptionEndpoint,
        RouteOperation,
    },
    project::{
        DefineEnv, DraftModeOptions, PartialProjectOptions, Project, ProjectContainer,
        ProjectOptions, WatchOptions,
    },
    route::Endpoint,
};
use next_core::tracing_presets::{
    TRACING_NEXT_OVERVIEW_TARGETS, TRACING_NEXT_TARGETS, TRACING_NEXT_TURBO_TASKS_TARGETS,
    TRACING_NEXT_TURBOPACK_TARGETS,
};
use once_cell::sync::Lazy;
use rand::Rng;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, runtime::Handle, time::Instant};
use tracing::Instrument;
use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, FxIndexSet, NonLocalValue, OperationValue, OperationVc, ReadRef, ResolvedVc,
    TaskInput, TransientInstance, TryJoinIterExt, TurboTasksApi, UpdateInfo, Vc, get_effects,
    message_queue::{CompilationEvent, Severity},
    trace::TraceRawVcs,
};
use turbo_tasks_backend::{BackingStorage, db_invalidation::invalidation_reasons};
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystem, FileSystemPath, util::uri_from_file,
};
use turbo_unix_path::{get_relative_path_to, sys_to_unix};
use turbopack_core::{
    PROJECT_FILESYSTEM_NAME, SOURCE_URL_PROTOCOL,
    diagnostics::PlainDiagnostic,
    error::PrettyPrintError,
    issue::PlainIssue,
    output::{OutputAsset, OutputAssets},
    source_map::{OptionStringifiedSourceMap, SourceMap, Token},
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
        endpoint::ExternalEndpoint,
        turbopack_ctx::{
            NapiNextTurbopackCallbacks, NapiNextTurbopackCallbacksJsObject, NextTurboTasks,
            NextTurbopackContext, create_turbo_tasks,
        },
        utils::{
            DetachedVc, NapiDiagnostic, NapiIssue, RootTask, TurbopackResult, get_diagnostics,
            get_issues, strongly_consistent_catch_collectables, subscribe,
        },
    },
    util::DhatProfilerGuard,
};

/// Used by [`benchmark_file_io`]. This is a noisy benchmark, so set the
/// threshold high.
const SLOW_FILESYSTEM_THRESHOLD: Duration = Duration::from_millis(100);
static SOURCE_MAP_PREFIX: Lazy<String> = Lazy::new(|| format!("{SOURCE_URL_PROTOCOL}///"));
static SOURCE_MAP_PREFIX_PROJECT: Lazy<String> =
    Lazy::new(|| format!("{SOURCE_URL_PROTOCOL}///[{PROJECT_FILESYSTEM_NAME}]/"));

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

    /// A path where to emit the build outputs, relative to [`Project::project_path`], always Unix
    /// path. Corresponds to next.config.js's `distDir`.
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

    /// The version of Node.js that is available/currently running.
    pub current_node_js_version: RcStr,
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

    /// A path where to emit the build outputs, relative to [`Project::project_path`], always a
    /// Unix path. Corresponds to next.config.js's `distDir`.
    /// E.g. `.next`
    pub dist_dir: Option<Option<RcStr>>,

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
    /// Use the new backend with filesystem cache enabled.
    pub persistent_caching: Option<bool>,
    /// An upper bound of memory that turbopack will attempt to stay under.
    pub memory_limit: Option<f64>,
    /// Track dependencies between tasks. If false, any change during build will error.
    pub dependency_tracking: Option<bool>,
    /// Whether the project is running in a CI environment.
    pub is_ci: Option<bool>,
    /// Whether the project is running in a short session.
    pub is_short_session: Option<bool>,
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
        ProjectOptions {
            root_path: val.root_path,
            project_path: val.project_path,
            watch: val.watch.into(),
            next_config: val.next_config,
            env: val
                .env
                .into_iter()
                .map(|var| (var.name, var.value))
                .collect(),
            define_env: val.define_env.into(),
            dev: val.dev,
            encryption_key: val.encryption_key,
            build_id: val.build_id,
            preview_props: val.preview_props.into(),
            browserslist_query: val.browserslist_query,
            no_mangling: val.no_mangling,
            current_node_js_version: val.current_node_js_version,
        }
    }
}

impl From<NapiPartialProjectOptions> for PartialProjectOptions {
    fn from(val: NapiPartialProjectOptions) -> Self {
        PartialProjectOptions {
            root_path: val.root_path,
            project_path: val.project_path,
            watch: val.watch.map(From::from),
            next_config: val.next_config,
            env: val
                .env
                .map(|env| env.into_iter().map(|var| (var.name, var.value)).collect()),
            define_env: val.define_env.map(|env| env.into()),
            dev: val.dev,
            encryption_key: val.encryption_key,
            build_id: val.build_id,
            preview_props: val.preview_props.map(|props| props.into()),
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
    exit_receiver: tokio::sync::Mutex<Option<ExitReceiver>>,
}

#[napi(ts_return_type = "Promise<{ __napiType: \"Project\" }>")]
pub fn project_new(
    env: Env,
    options: NapiProjectOptions,
    turbo_engine_options: NapiTurboEngineOptions,
    napi_callbacks: NapiNextTurbopackCallbacksJsObject,
) -> napi::Result<JsObject> {
    let napi_callbacks = NapiNextTurbopackCallbacks::from_js(napi_callbacks)?;
    let (exit, exit_receiver) = ExitHandler::new_receiver();

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
        println!("Turbopack tracing enabled with targets: {trace}");
        println!("  Note that this might have a small performance impact.");

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

        let internal_dir = PathBuf::from(&options.root_path)
            .join(&options.project_path)
            .join(&options.dist_dir);
        std::fs::create_dir_all(&internal_dir)
            .context("Unable to create .next directory")
            .unwrap();
        let trace_file;
        let (trace_writer, trace_writer_guard) = match compress {
            Compression::None => {
                trace_file = internal_dir.join("trace-turbopack");
                let trace_writer = std::fs::File::create(trace_file.clone()).unwrap();
                TraceWriter::new(trace_writer)
            }
            Compression::GzipFast => {
                trace_file = internal_dir.join("trace-turbopack");
                let trace_writer = std::fs::File::create(trace_file.clone()).unwrap();
                let trace_writer = GzEncoder::new(trace_writer, flate2::Compression::fast());
                TraceWriter::new(trace_writer)
            }
            Compression::GzipBest => {
                trace_file = internal_dir.join("trace-turbopack");
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
            let memory_limit = turbo_engine_options
                .memory_limit
                .map(|m| m as usize)
                .unwrap_or(usize::MAX);
            let persistent_caching = turbo_engine_options.persistent_caching.unwrap_or_default();
            let dependency_tracking = turbo_engine_options.dependency_tracking.unwrap_or(true);
            let is_ci = turbo_engine_options.is_ci.unwrap_or(false);
            let is_short_session = turbo_engine_options.is_short_session.unwrap_or(false);
            let turbo_tasks = create_turbo_tasks(
                PathBuf::from(&options.dist_dir),
                persistent_caching,
                memory_limit,
                dependency_tracking,
                is_ci,
                is_short_session,
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

            let options: ProjectOptions = options.into();
            let is_dev = options.dev;
            let container = turbo_tasks
                .run(async move {
                    let project = ProjectContainer::new(rcstr!("next.js"), is_dev);
                    let project = project.to_resolved().await?;
                    project.initialize(options).await?;
                    Ok(project)
                })
                .or_else(|e| turbopack_ctx.throw_turbopack_internal_result(&e.into()))
                .await?;

            if is_dev {
                Handle::current().spawn({
                    let tt = turbo_tasks.clone();
                    async move {
                        let result = tt
                            .clone()
                            .run(async move {
                                benchmark_file_io(
                                    tt,
                                    container.project().node_root().owned().await?,
                                )
                                .await
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
                exit_receiver: tokio::sync::Mutex::new(Some(exit_receiver)),
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
             consider moving it to a local folder. If you have an antivirus enabled, consider \
             excluding your project directory.",
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
async fn benchmark_file_io(turbo_tasks: NextTurboTasks, directory: FileSystemPath) -> Result<()> {
    // try to get the real file path on disk so that we can use it with tokio
    let fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(directory.fs)
        .context(anyhow!(
            "expected node_root to be a DiskFileSystem, cannot benchmark"
        ))?
        .await?;

    let directory = fs.to_sys_path(&directory);
    let temp_path = directory.join(format!(
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
            directory: directory.to_string_lossy().into(),
            duration_ms: duration.as_millis(),
        }));
    }

    Ok(())
}

#[tracing::instrument(level = "info", name = "update project", skip_all)]
#[napi]
pub async fn project_update(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    options: NapiPartialProjectOptions,
) -> napi::Result<()> {
    let ctx = &project.turbopack_ctx;
    let options = options.into();
    let container = project.container;
    ctx.turbo_tasks()
        .run(async move {
            container.update(options).await?;
            Ok(())
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await
}

/// Invalidates the filesystem cache so that it will be deleted next time that a turbopack project
/// is created with filesystem cache enabled.
#[napi]
pub async fn project_invalidate_file_system_cache(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
) -> napi::Result<()> {
    tokio::task::spawn_blocking(move || {
        // TODO: Let the JS caller specify a reason? We need to limit the reasons to ones we know
        // how to generate a message for on the Rust side of the FFI.
        project
            .turbopack_ctx
            .turbo_tasks()
            .backend()
            .backing_storage()
            .invalidate(invalidation_reasons::USER_REQUEST)
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
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
) {
    project_on_exit_internal(&project).await
}

async fn project_on_exit_internal(project: &ProjectInstance) {
    let exit_receiver = project.exit_receiver.lock().await.take();
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
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
) {
    project.turbopack_ctx.turbo_tasks().stop_and_wait().await;
    project_on_exit_internal(&project).await;
}

#[napi(object)]
#[derive(Default)]
pub struct AppPageNapiRoute {
    /// The relative path from project_path to the route file
    pub original_name: Option<RcStr>,

    pub html_endpoint: Option<External<ExternalEndpoint>>,
    pub rsc_endpoint: Option<External<ExternalEndpoint>>,
}

#[napi(object)]
#[derive(Default)]
pub struct NapiRoute {
    /// The router path
    pub pathname: String,
    /// The relative path from project_path to the route file
    pub original_name: Option<RcStr>,

    /// The type of route, eg a Page or App
    pub r#type: &'static str,

    pub pages: Option<Vec<AppPageNapiRoute>>,

    // Different representations of the endpoint
    pub endpoint: Option<External<ExternalEndpoint>>,
    pub html_endpoint: Option<External<ExternalEndpoint>>,
    pub rsc_endpoint: Option<External<ExternalEndpoint>>,
    pub data_endpoint: Option<External<ExternalEndpoint>>,
}

impl NapiRoute {
    fn from_route(
        pathname: String,
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
                            rsc_endpoint: convert_endpoint(page_route.rsc_endpoint),
                        })
                        .collect(),
                ),
                ..Default::default()
            },
            RouteOperation::AppRoute {
                original_name,
                endpoint,
            } => NapiRoute {
                pathname,
                original_name: Some(original_name),
                r#type: "app-route",
                endpoint: convert_endpoint(endpoint),
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

#[napi(object)]
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

#[napi(object)]
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

#[napi(object)]
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
            .map(|(k, v)| NapiRoute::from_route(k.to_string(), v.clone(), turbopack_ctx))
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

#[turbo_tasks::value(serialization = "none")]
struct EntrypointsWithIssues {
    entrypoints: Option<ReadRef<EntrypointsOperation>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
async fn get_entrypoints_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Result<Vc<EntrypointsWithIssues>> {
    let entrypoints_operation =
        EntrypointsOperation::new(project_container_entrypoints_operation(container));
    let (entrypoints, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(entrypoints_operation).await?;
    Ok(EntrypointsWithIssues {
        entrypoints,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
fn project_container_entrypoints_operation(
    // the container is a long-lived object with internally mutable state, there's no risk of it
    // becoming stale
    container: ResolvedVc<ProjectContainer>,
) -> Vc<Entrypoints> {
    container.entrypoints()
}

#[turbo_tasks::value(serialization = "none")]
struct AllWrittenEntrypointsWithIssues {
    entrypoints: Option<ReadRef<EntrypointsOperation>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[tracing::instrument(level = "info", name = "write all entrypoints to disk", skip_all)]
#[napi]
pub async fn project_write_all_entrypoints_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    app_dir_only: bool,
) -> napi::Result<TurbopackResult<Option<NapiEntrypoints>>> {
    let ctx = &project.turbopack_ctx;
    let container = project.container;
    let tt = ctx.turbo_tasks();

    let (entrypoints, issues, diags) = tt
        .run(async move {
            let entrypoints_with_issues_op =
                get_all_written_entrypoints_with_issues_operation(container, app_dir_only);

            // Read and compile the files
            let AllWrittenEntrypointsWithIssues {
                entrypoints,
                issues,
                diagnostics,
                effects,
            } = &*entrypoints_with_issues_op
                .read_strongly_consistent()
                .await?;

            // Write the files to disk
            effects.apply().await?;

            Ok((entrypoints.clone(), issues.clone(), diagnostics.clone()))
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;

    Ok(TurbopackResult {
        result: if let Some(entrypoints) = entrypoints {
            Some(NapiEntrypoints::from_entrypoints_op(
                &entrypoints,
                &project.turbopack_ctx,
            )?)
        } else {
            None
        },
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
        diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
    })
}

#[turbo_tasks::function(operation)]
async fn get_all_written_entrypoints_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<AllWrittenEntrypointsWithIssues>> {
    let entrypoints_operation = EntrypointsOperation::new(all_entrypoints_write_to_disk_operation(
        container,
        app_dir_only,
    ));
    let (entrypoints, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(entrypoints_operation).await?;
    Ok(AllWrittenEntrypointsWithIssues {
        entrypoints,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
pub async fn all_entrypoints_write_to_disk_operation(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<Entrypoints>> {
    project
        .project()
        .emit_all_output_assets(output_assets_operation(project, app_dir_only))
        .as_side_effect()
        .await?;

    Ok(project.entrypoints())
}

#[turbo_tasks::function(operation)]
async fn output_assets_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<OutputAssets>> {
    let endpoint_assets = container
        .project()
        .get_all_endpoints(app_dir_only)
        .await?
        .iter()
        .map(|endpoint| async move { endpoint.output().await?.output_assets.await })
        .try_join()
        .await?;

    let output_assets: FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>> = endpoint_assets
        .iter()
        .flat_map(|assets| assets.iter().copied())
        .collect();

    let nft = next_server_nft_assets(container.project()).await?;

    Ok(Vc::cell(
        output_assets
            .into_iter()
            .chain(nft.iter().copied())
            .collect(),
    ))
}

#[tracing::instrument(level = "info", name = "get entrypoints", skip_all)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_entrypoints_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbopack_ctx = project.turbopack_ctx.clone();
    let container = project.container;
    subscribe(
        turbopack_ctx.clone(),
        func,
        move || {
            async move {
                let entrypoints_with_issues_op = get_entrypoints_with_issues_operation(container);
                let EntrypointsWithIssues {
                    entrypoints,
                    issues,
                    diagnostics,
                    effects,
                } = &*entrypoints_with_issues_op
                    .read_strongly_consistent()
                    .await?;

                effects.apply().await?;
                Ok((entrypoints.clone(), issues.clone(), diagnostics.clone()))
            }
            .instrument(tracing::info_span!("entrypoints subscription"))
        },
        move |ctx| {
            let (entrypoints, issues, diags) = ctx.value;
            let result = match entrypoints {
                Some(entrypoints) => Some(NapiEntrypoints::from_entrypoints_op(
                    &entrypoints,
                    &turbopack_ctx,
                )?),
                None => None,
            };

            Ok(vec![TurbopackResult {
                result,
                issues: issues
                    .iter()
                    .map(|issue| NapiIssue::from(&**issue))
                    .collect(),
                diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
            }])
        },
    )
}

#[turbo_tasks::value(serialization = "none")]
struct HmrUpdateWithIssues {
    update: ReadRef<Update>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
async fn hmr_update_with_issues_operation(
    project: ResolvedVc<Project>,
    identifier: RcStr,
    state: ResolvedVc<VersionState>,
) -> Result<Vc<HmrUpdateWithIssues>> {
    let update_op = project_hmr_update_operation(project, identifier, state);
    let update = update_op.read_strongly_consistent().await?;
    let issues = get_issues(update_op).await?;
    let diagnostics = get_diagnostics(update_op).await?;
    let effects = Arc::new(get_effects(update_op).await?);
    Ok(HmrUpdateWithIssues {
        update,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
fn project_hmr_update_operation(
    project: ResolvedVc<Project>,
    identifier: RcStr,
    state: ResolvedVc<VersionState>,
) -> Vc<Update> {
    project.hmr_update(identifier, *state)
}

#[tracing::instrument(level = "info", name = "get HMR events", skip(project, func))]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_hmr_events(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    identifier: RcStr,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let container = project.container;
    let session = TransientInstance::new(());
    subscribe(
        project.turbopack_ctx.clone(),
        func,
        {
            let outer_identifier = identifier.clone();
            let session = session.clone();
            move || {
                let identifier: RcStr = outer_identifier.clone();
                let session = session.clone();
                async move {
                    let project = container.project().to_resolved().await?;
                    let state = project
                        .hmr_version_state(identifier.clone(), session)
                        .to_resolved()
                        .await?;

                    let update_op =
                        hmr_update_with_issues_operation(project, identifier.clone(), state);
                    let update = update_op.read_strongly_consistent().await?;
                    let HmrUpdateWithIssues {
                        update,
                        issues,
                        diagnostics,
                        effects,
                    } = &*update;
                    effects.apply().await?;
                    match &**update {
                        Update::Missing | Update::None => {}
                        Update::Total(TotalUpdate { to }) => {
                            state.set(to.clone()).await?;
                        }
                        Update::Partial(PartialUpdate { to, .. }) => {
                            state.set(to.clone()).await?;
                        }
                    }
                    Ok((Some(update.clone()), issues.clone(), diagnostics.clone()))
                }
            }
        },
        move |ctx| {
            let (update, issues, diags) = ctx.value;

            let napi_issues = issues
                .iter()
                .map(|issue| NapiIssue::from(&**issue))
                .collect();
            let update_issues = issues
                .iter()
                .map(|issue| Issue::from(&**issue))
                .collect::<Vec<_>>();

            let identifier = ResourceIdentifier {
                path: identifier.clone(),
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

            Ok(vec![TurbopackResult {
                result: ctx.env.to_js_value(&update)?,
                issues: napi_issues,
                diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
            }])
        },
    )
}

#[napi(object)]
struct HmrIdentifiers {
    pub identifiers: Vec<RcStr>,
}

#[turbo_tasks::value(serialization = "none")]
struct HmrIdentifiersWithIssues {
    identifiers: ReadRef<Vec<RcStr>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
async fn get_hmr_identifiers_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Result<Vc<HmrIdentifiersWithIssues>> {
    let hmr_identifiers_op = project_container_hmr_identifiers_operation(container);
    let hmr_identifiers = hmr_identifiers_op.read_strongly_consistent().await?;
    let issues = get_issues(hmr_identifiers_op).await?;
    let diagnostics = get_diagnostics(hmr_identifiers_op).await?;
    let effects = Arc::new(get_effects(hmr_identifiers_op).await?);
    Ok(HmrIdentifiersWithIssues {
        identifiers: hmr_identifiers,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::function(operation)]
fn project_container_hmr_identifiers_operation(
    container: ResolvedVc<ProjectContainer>,
) -> Vc<Vec<RcStr>> {
    container.hmr_identifiers()
}

#[tracing::instrument(level = "info", name = "get HMR identifiers", skip_all)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_hmr_identifiers_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let container = project.container;
    subscribe(
        project.turbopack_ctx.clone(),
        func,
        move || async move {
            let hmr_identifiers_with_issues_op =
                get_hmr_identifiers_with_issues_operation(container);
            let HmrIdentifiersWithIssues {
                identifiers,
                issues,
                diagnostics,
                effects,
            } = &*hmr_identifiers_with_issues_op
                .read_strongly_consistent()
                .await?;
            effects.apply().await?;

            Ok((identifiers.clone(), issues.clone(), diagnostics.clone()))
        },
        move |ctx| {
            let (identifiers, issues, diagnostics) = ctx.value;

            Ok(vec![TurbopackResult {
                result: HmrIdentifiers {
                    identifiers: ReadRef::into_owned(identifiers),
                },
                issues: issues
                    .iter()
                    .map(|issue| NapiIssue::from(&**issue))
                    .collect(),
                diagnostics: diagnostics
                    .iter()
                    .map(|d| NapiDiagnostic::from(d))
                    .collect(),
            }])
        },
    )
}

pub enum UpdateMessage {
    Start,
    End(UpdateInfo),
}

#[napi(object)]
struct NapiUpdateMessage {
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

#[napi(object)]
struct NapiUpdateInfo {
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
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    aggregation_ms: u32,
    func: JsFunction,
) -> napi::Result<()> {
    let func: ThreadsafeFunction<UpdateMessage> = func.create_threadsafe_function(0, |ctx| {
        let message = ctx.value;
        Ok(vec![NapiUpdateMessage::from(message)])
    })?;
    tokio::spawn(async move {
        let tt = project.turbopack_ctx.turbo_tasks();
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
    Ok(())
}

/// Subscribes to all compilation events that are not cached like timing and progress information.
#[napi]
pub fn project_compilation_events_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    func: JsFunction,
    event_types: Option<Vec<String>>,
) -> napi::Result<()> {
    let tsfn: ThreadsafeFunction<Arc<dyn CompilationEvent>> =
        func.create_threadsafe_function(0, |ctx| {
            let event: Arc<dyn CompilationEvent> = ctx.value;

            let env = ctx.env;
            let mut obj = env.create_object()?;
            obj.set_named_property("typeName", event.type_name())?;
            obj.set_named_property("severity", event.severity().to_string())?;
            obj.set_named_property("message", event.message())?;

            let external = env.create_external(event, None);
            obj.set_named_property("eventData", external)?;

            Ok(vec![obj])
        })?;

    tokio::spawn(async move {
        let tt = project.turbopack_ctx.turbo_tasks();
        let mut receiver = tt.subscribe_to_compilation_events(event_types);
        while let Some(msg) = receiver.recv().await {
            let status = tsfn.call(Ok(msg), ThreadsafeFunctionCallMode::Blocking);

            if status != Status::Ok {
                break;
            }
        }
    });

    Ok(())
}

#[napi(object)]
#[derive(
    Clone,
    Debug,
    Deserialize,
    Eq,
    Hash,
    NonLocalValue,
    OperationValue,
    PartialEq,
    Serialize,
    TaskInput,
    TraceRawVcs,
)]
pub struct StackFrame {
    pub is_server: bool,
    pub is_internal: Option<bool>,
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

#[turbo_tasks::function]
pub async fn get_source_map_rope(
    container: Vc<ProjectContainer>,
    source_url: RcStr,
) -> Result<Vc<OptionStringifiedSourceMap>> {
    let (file_path_sys, module) = match Url::parse(&source_url) {
        Ok(url) => match url.scheme() {
            "file" => {
                let path = match url.to_file_path() {
                    Ok(path) => path.to_string_lossy().into(),
                    Err(_) => {
                        bail!("Failed to convert file URL to file path: {url}");
                    }
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
        Err(_) => (source_url.to_string(), None),
    };

    let chunk_base_unix =
        match file_path_sys.strip_prefix(container.project().dist_dir_absolute().await?.as_str()) {
            Some(relative_path) => sys_to_unix(relative_path),
            None => {
                // File doesn't exist within the dist dir
                return Ok(OptionStringifiedSourceMap::none());
            }
        };

    let server_path = container
        .project()
        .node_root()
        .await?
        .join(&chunk_base_unix)?;

    let client_path = container
        .project()
        .client_relative_path()
        .await?
        .join(&chunk_base_unix)?;

    let mut map = container.get_source_map(server_path, module.clone());

    if map.await?.is_none() {
        // If the chunk doesn't exist as a server chunk, try a client chunk.
        // TODO: Properly tag all server chunks and use the `isServer` query param.
        // Currently, this is inaccurate as it does not cover RSC server
        // chunks.
        map = container.get_source_map(client_path, module);
        if map.await?.is_none() {
            bail!("chunk/module '{}' is missing a sourcemap", source_url);
        }
    }

    Ok(map)
}

#[turbo_tasks::function(operation)]
pub fn get_source_map_rope_operation(
    container: ResolvedVc<ProjectContainer>,
    file_path: RcStr,
) -> Vc<OptionStringifiedSourceMap> {
    get_source_map_rope(*container, file_path)
}

#[turbo_tasks::function(operation)]
pub async fn project_trace_source_operation(
    container: ResolvedVc<ProjectContainer>,
    frame: StackFrame,
    current_directory_file_url: RcStr,
) -> Result<Vc<OptionStackFrame>> {
    let Some(map) =
        &*SourceMap::new_from_rope_cached(get_source_map_rope(*container, frame.file)).await?
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

    let (original_file, line, column, method_name) = match token {
        Token::Original(token) => (
            match urlencoding::decode(&token.original_file)? {
                Cow::Borrowed(_) => token.original_file,
                Cow::Owned(original_file) => RcStr::from(original_file),
            },
            // JS stack frames are 1-indexed, source map tokens are 0-indexed
            Some(token.original_line + 1),
            Some(token.original_column + 1),
            token.name,
        ),
        Token::Synthetic(token) => {
            let Some(original_file) = token.guessed_original_file else {
                return Ok(Vc::cell(None));
            };
            (original_file, None, None, None)
        }
    };

    let project_root_uri =
        uri_from_file(container.project().project_root_path().owned().await?, None).await? + "/";
    let (file, original_file, is_internal) =
        if let Some(source_file) = original_file.strip_prefix(&project_root_uri) {
            // Client code uses file://
            (
                RcStr::from(
                    get_relative_path_to(&current_directory_file_url, &original_file)
                        // TODO(sokra) remove this to include a ./ here to make it a relative path
                        .trim_start_matches("./"),
                ),
                Some(RcStr::from(source_file)),
                false,
            )
        } else if let Some(source_file) = original_file.strip_prefix(&*SOURCE_MAP_PREFIX_PROJECT) {
            // Server code uses turbopack:///[project]
            // TODO should this also be file://?
            (
                RcStr::from(
                    get_relative_path_to(
                        &current_directory_file_url,
                        &format!("{project_root_uri}{source_file}"),
                    )
                    // TODO(sokra) remove this to include a ./ here to make it a relative path
                    .trim_start_matches("./"),
                ),
                Some(RcStr::from(source_file)),
                false,
            )
        } else if let Some(source_file) = original_file.strip_prefix(&*SOURCE_MAP_PREFIX) {
            // All other code like turbopack:///[turbopack] is internal code
            // TODO(veil): Should the protocol be preserved?
            (RcStr::from(source_file), None, true)
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
        is_internal: Some(is_internal),
    })))
}

#[tracing::instrument(level = "info", name = "apply SourceMap to stack frame", skip_all)]
#[napi]
pub async fn project_trace_source(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    frame: StackFrame,
    current_directory_file_url: String,
) -> napi::Result<Option<StackFrame>> {
    let container = project.container;
    let ctx = &project.turbopack_ctx;
    ctx.turbo_tasks()
        .run(async move {
            let traced_frame = project_trace_source_operation(
                container,
                frame,
                RcStr::from(current_directory_file_url),
            )
            .read_strongly_consistent()
            .await?;
            Ok(ReadRef::into_owned(traced_frame))
        })
        // HACK: Don't use `TurbopackInternalError`, this function is race-condition prone (the
        // source files may have changed or been deleted), so these probably aren't internal errors?
        // Ideally we should differentiate.
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e.into()).to_string()))
}

#[tracing::instrument(level = "info", name = "get source content for asset", skip_all)]
#[napi]
pub async fn project_get_source_for_asset(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    file_path: RcStr,
) -> napi::Result<Option<String>> {
    let container = project.container;
    let ctx = &project.turbopack_ctx;
    ctx.turbo_tasks()
        .run(async move {
            let source_content = &*container
                .project()
                .project_path()
                .await?
                .fs()
                .root()
                .await?
                .join(&file_path)?
                .read()
                .await?;

            let FileContent::Content(source_content) = source_content else {
                bail!("Cannot find source for asset {}", file_path);
            };

            Ok(Some(source_content.content().to_str()?.into_owned()))
        })
        // HACK: Don't use `TurbopackInternalError`, this function is race-condition prone (the
        // source files may have changed or been deleted), so these probably aren't internal errors?
        // Ideally we should differentiate.
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e.into()).to_string()))
}

#[tracing::instrument(level = "info", name = "get SourceMap for asset", skip_all)]
#[napi]
pub async fn project_get_source_map(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    file_path: RcStr,
) -> napi::Result<Option<String>> {
    let container = project.container;
    let ctx = &project.turbopack_ctx;
    ctx.turbo_tasks()
        .run(async move {
            let Some(map) = &*get_source_map_rope_operation(container, file_path)
                .read_strongly_consistent()
                .await?
            else {
                return Ok(None);
            };
            Ok(Some(map.to_str()?.to_string()))
        })
        // HACK: Don't use `TurbopackInternalError`, this function is race-condition prone (the
        // source files may have changed or been deleted), so these probably aren't internal errors?
        // Ideally we should differentiate.
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e.into()).to_string()))
}

#[napi]
pub fn project_get_source_map_sync(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    file_path: RcStr,
) -> napi::Result<Option<String>> {
    within_runtime_if_available(|| {
        tokio::runtime::Handle::current().block_on(project_get_source_map(project, file_path))
    })
}
