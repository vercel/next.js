use std::{borrow::Cow, io::Write, path::PathBuf, sync::Arc, thread, time::Duration};

use anyhow::{Context, Result, anyhow, bail};
use napi::{
    JsFunction, Status,
    bindgen_prelude::{External, within_runtime_if_available},
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
};
use next_api::{
    entrypoints::Entrypoints,
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
use tokio::{io::AsyncWriteExt, time::Instant};
use tracing::Instrument;
use tracing_subscriber::{Registry, layer::SubscriberExt, util::SubscriberInitExt};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Completion, Effects, FxIndexSet, NonLocalValue, OperationValue, OperationVc, ReadRef,
    ResolvedVc, TaskInput, TransientInstance, TryJoinIterExt, UpdateInfo, Vc, get_effects,
    message_queue::{CompilationEvent, Severity, TimingEvent},
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    DiskFileSystem, FileContent, FileSystem, FileSystemPath, get_relative_path_to,
    util::uri_from_file,
};
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

use super::{
    endpoint::ExternalEndpoint,
    utils::{
        NapiDiagnostic, NapiIssue, NextTurboTasks, RootTask, TurbopackResult, VcArc,
        create_turbo_tasks, get_diagnostics, get_issues, subscribe,
    },
};
use crate::{register, util::DhatProfilerGuard};

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
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: RcStr,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: RcStr,

    /// next.config's distDir. Project initialization occurs eariler than
    /// deserializing next.config, so passing it as separate option.
    pub dist_dir: RcStr,

    /// Filesystem watcher options.
    pub watch: NapiWatchOptions,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: RcStr,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: RcStr,

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
}

/// [NapiProjectOptions] with all fields optional.
#[napi(object)]
pub struct NapiPartialProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: Option<RcStr>,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: Option<RcStr>,

    /// next.config's distDir. Project initialization occurs eariler than
    /// deserializing next.config, so passing it as separate option.
    pub dist_dir: Option<Option<RcStr>>,

    /// Filesystem watcher options.
    pub watch: Option<NapiWatchOptions>,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: Option<RcStr>,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: Option<RcStr>,

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
    pub client: Vec<NapiEnvVar>,
    pub edge: Vec<NapiEnvVar>,
    pub nodejs: Vec<NapiEnvVar>,
}

#[napi(object)]
pub struct NapiTurboEngineOptions {
    /// Use the new backend with persistent caching enabled.
    pub persistent_caching: Option<bool>,
    /// An upper bound of memory that turbopack will attempt to stay under.
    pub memory_limit: Option<f64>,
    /// Track dependencies between tasks. If false, any change during build will error.
    pub dependency_tracking: Option<bool>,
    /// Whether the project is running in a CI environment.
    pub is_ci: Option<bool>,
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
            js_config: val.js_config,
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
            js_config: val.js_config,
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
    turbo_tasks: NextTurboTasks,
    container: ResolvedVc<ProjectContainer>,
    exit_receiver: tokio::sync::Mutex<Option<ExitReceiver>>,
}

#[napi(ts_return_type = "Promise<{ __napiType: \"Project\" }>")]
pub async fn project_new(
    options: NapiProjectOptions,
    turbo_engine_options: NapiTurboEngineOptions,
) -> napi::Result<External<ProjectInstance>> {
    register();
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
        // ensure `trace` is set to *something* so that the `tokio-console` feature works, otherwise
        // you just get empty output from `tokio-console`, which can be confusing.
        trace = Some("overview".to_owned());
    }

    if let Some(mut trace) = trace {
        // Trace presets
        match trace.as_str() {
            "overview" | "1" => {
                trace = TRACING_NEXT_OVERVIEW_TARGETS.join(",");
            }
            "next" => {
                trace = TRACING_NEXT_TARGETS.join(",");
            }
            "turbopack" => {
                trace = TRACING_NEXT_TURBOPACK_TARGETS.join(",");
            }
            "turbo-tasks" => {
                trace = TRACING_NEXT_TURBO_TASKS_TARGETS.join(",");
            }
            _ => {}
        }

        let subscriber = Registry::default();

        if cfg!(feature = "tokio-console") {
            trace = format!("{trace},tokio=trace,runtime=trace");
        }
        #[cfg(feature = "tokio-console")]
        let subscriber = subscriber.with(console_subscriber::spawn());

        let subscriber = subscriber.with(FilterLayer::try_new(&trace).unwrap());

        let internal_dir = PathBuf::from(&options.project_path).join(&options.dist_dir);
        std::fs::create_dir_all(&internal_dir)
            .context("Unable to create .next directory")
            .unwrap();
        let trace_file = internal_dir.join("trace-turbopack");
        let trace_writer = std::fs::File::create(trace_file.clone()).unwrap();
        let (trace_writer, trace_writer_guard) = TraceWriter::new(trace_writer);
        let subscriber = subscriber.with(RawTraceLayer::new(trace_writer));

        exit.on_exit(async move {
            tokio::task::spawn_blocking(move || drop(trace_writer_guard))
                .await
                .unwrap();
        });

        let trace_server = std::env::var("NEXT_TURBOPACK_TRACE_SERVER").ok();
        if trace_server.is_some() {
            thread::spawn(move || {
                turbopack_trace_server::start_turbopack_trace_server(trace_file);
            });
            println!("Turbopack trace server started. View trace at https://trace.nextjs.org");
        }

        subscriber.init();
    }

    let memory_limit = turbo_engine_options
        .memory_limit
        .map(|m| m as usize)
        .unwrap_or(usize::MAX);
    let persistent_caching = turbo_engine_options.persistent_caching.unwrap_or_default();
    let dependency_tracking = turbo_engine_options.dependency_tracking.unwrap_or(true);
    let is_ci = turbo_engine_options.is_ci.unwrap_or(false);
    let turbo_tasks = create_turbo_tasks(
        PathBuf::from(&options.dist_dir),
        persistent_caching,
        memory_limit,
        dependency_tracking,
        is_ci,
    )?;

    let stats_path = std::env::var_os("NEXT_TURBOPACK_TASK_STATISTICS");
    if let Some(stats_path) = stats_path {
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
    let container = turbo_tasks
        .run_once(async move {
            let project = ProjectContainer::new(rcstr!("next.js"), options.dev);
            let project = project.to_resolved().await?;
            project.initialize(options).await?;
            Ok(project)
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    let tasks_ref = turbo_tasks.clone();
    turbo_tasks.spawn_once_task(async move {
        benchmark_file_io(tasks_ref, container.project().node_root())
            .await
            .inspect_err(|err| tracing::warn!(%err, "failed to benchmark file IO"))
    });
    Ok(External::new_with_size_hint(
        ProjectInstance {
            turbo_tasks,
            container,
            exit_receiver: tokio::sync::Mutex::new(Some(exit_receiver)),
        },
        100,
    ))
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
#[tracing::instrument(skip(turbo_tasks))]
async fn benchmark_file_io(
    turbo_tasks: NextTurboTasks,
    directory: Vc<FileSystemPath>,
) -> Result<Vc<Completion>> {
    // try to get the real file path on disk so that we can use it with tokio
    let fs = Vc::try_resolve_downcast_type::<DiskFileSystem>(directory.fs())
        .await?
        .context(anyhow!(
            "expected node_root to be a DiskFileSystem, cannot benchmark"
        ))?
        .await?;

    let directory = fs.to_sys_path(directory).await?;
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
    async move {
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
    .instrument(tracing::info_span!("benchmark file IO (measurement)"))
    .await?;

    let duration = Instant::now().duration_since(start);
    if duration > SLOW_FILESYSTEM_THRESHOLD {
        println!(
            "Slow filesystem detected. The benchmark took {}ms. If {} is a network drive, \
             consider moving it to a local folder. If you have an antivirus enabled, consider \
             excluding your project directory.",
            duration.as_millis(),
            directory.to_string_lossy(),
        );

        turbo_tasks.send_compilation_event(Arc::new(SlowFilesystemEvent {
            directory: directory.to_string_lossy().into(),
            duration_ms: duration.as_millis(),
        }));
    }

    Ok(Completion::new())
}

#[napi]
pub async fn project_update(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    options: NapiPartialProjectOptions,
) -> napi::Result<()> {
    let turbo_tasks = project.turbo_tasks.clone();
    let options = options.into();
    let container = project.container;
    turbo_tasks
        .run_once(async move {
            container.update(options).await?;
            Ok(())
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    Ok(())
}

/// Invalidates the persistent cache so that it will be deleted next time that a turbopack project
/// is created with persistent caching enabled.
#[napi]
pub async fn project_invalidate_persistent_cache(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
) -> napi::Result<()> {
    tokio::task::spawn_blocking(move || project.turbo_tasks.invalidate_persistent_cache())
        .await
        .context("panicked while invalidating persistent cache")??;
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
#[napi]
pub async fn project_shutdown(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
) {
    project.turbo_tasks.stop_and_wait().await;
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
    fn from_route(pathname: String, value: RouteOperation, turbo_tasks: &NextTurboTasks) -> Self {
        let convert_endpoint = |endpoint: OperationVc<OptionEndpoint>| {
            Some(External::new(ExternalEndpoint(VcArc::new(
                turbo_tasks.clone(),
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
}

impl NapiMiddleware {
    fn from_middleware(value: &MiddlewareOperation, turbo_tasks: &NextTurboTasks) -> Result<Self> {
        Ok(NapiMiddleware {
            endpoint: External::new(ExternalEndpoint(VcArc::new(
                turbo_tasks.clone(),
                value.endpoint,
            ))),
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
        turbo_tasks: &NextTurboTasks,
    ) -> Result<Self> {
        Ok(NapiInstrumentation {
            node_js: External::new(ExternalEndpoint(VcArc::new(
                turbo_tasks.clone(),
                value.node_js,
            ))),
            edge: External::new(ExternalEndpoint(VcArc::new(
                turbo_tasks.clone(),
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
        turbo_tasks: &NextTurboTasks,
    ) -> Result<Self> {
        let routes = entrypoints
            .routes
            .iter()
            .map(|(k, v)| NapiRoute::from_route(k.to_string(), v.clone(), turbo_tasks))
            .collect();
        let middleware = entrypoints
            .middleware
            .as_ref()
            .map(|m| NapiMiddleware::from_middleware(m, turbo_tasks))
            .transpose()?;
        let instrumentation = entrypoints
            .instrumentation
            .as_ref()
            .map(|i| NapiInstrumentation::from_instrumentation(i, turbo_tasks))
            .transpose()?;
        let pages_document_endpoint = External::new(ExternalEndpoint(VcArc::new(
            turbo_tasks.clone(),
            entrypoints.pages_document_endpoint,
        )));
        let pages_app_endpoint = External::new(ExternalEndpoint(VcArc::new(
            turbo_tasks.clone(),
            entrypoints.pages_app_endpoint,
        )));
        let pages_error_endpoint = External::new(ExternalEndpoint(VcArc::new(
            turbo_tasks.clone(),
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
    entrypoints: ReadRef<EntrypointsOperation>,
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
    let entrypoints = entrypoints_operation.read_strongly_consistent().await?;
    let issues = get_issues(entrypoints_operation).await?;
    let diagnostics = get_diagnostics(entrypoints_operation).await?;
    let effects = Arc::new(get_effects(entrypoints_operation).await?);
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
    entrypoints: Option<ReadRef<Entrypoints>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[napi]
pub async fn project_write_all_entrypoints_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    app_dir_only: bool,
) -> napi::Result<TurbopackResult<NapiEntrypoints>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let compilation_event_sender = turbo_tasks.clone();

    let (entrypoints, issues, diags) = turbo_tasks
        .run_once(async move {
            let entrypoints_with_issues_op =
                get_all_written_entrypoints_with_issues_operation(project.container, app_dir_only);

            // Read and compile the files
            let EntrypointsWithIssues {
                entrypoints,
                issues,
                diagnostics,
                effects,
            } = &*entrypoints_with_issues_op
                .read_strongly_consistent()
                .await?;

            // Start timing writing the files to disk
            let now = Instant::now();

            // Write the files to disk
            effects.apply().await?;

            // Send a compilation event to indicate that the files have been written to disk
            compilation_event_sender.send_compilation_event(Arc::new(TimingEvent::new(
                "Finished writing to disk".to_owned(),
                now.elapsed(),
            )));

            Ok((entrypoints.clone(), issues.clone(), diagnostics.clone()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(TurbopackResult {
        result: NapiEntrypoints::from_entrypoints_op(&entrypoints, &turbo_tasks)?,
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
        diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
    })
}

#[turbo_tasks::function(operation)]
async fn get_all_written_entrypoints_with_issues_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<EntrypointsWithIssues>> {
    let entrypoints_operation = EntrypointsOperation::new(all_entrypoints_write_to_disk_operation(
        container,
        app_dir_only,
    ));
    let entrypoints = entrypoints_operation.read_strongly_consistent().await?;
    let issues = get_issues(entrypoints_operation).await?;
    let diagnostics = get_diagnostics(entrypoints_operation).await?;
    let effects = Arc::new(get_effects(entrypoints_operation).await?);
    Ok(EntrypointsWithIssues {
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
    let _ = project
        .project()
        .emit_all_output_assets(output_assets_operation(project, app_dir_only))
        .resolve()
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

    let mut output_assets: FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>> = FxIndexSet::default();
    for assets in endpoint_assets {
        output_assets.extend(assets.iter());
    }

    Ok(Vc::cell(output_assets.into_iter().collect()))
}

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_entrypoints_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let container = project.container;
    subscribe(
        turbo_tasks.clone(),
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

            Ok(vec![TurbopackResult {
                result: NapiEntrypoints::from_entrypoints_op(&entrypoints, &turbo_tasks)?,
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

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_hmr_events(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    identifier: RcStr,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let project = project.container;
    let session = TransientInstance::new(());
    subscribe(
        turbo_tasks.clone(),
        func,
        {
            let outer_identifier = identifier.clone();
            let session = session.clone();
            move || {
                let identifier: RcStr = outer_identifier.clone();
                let session = session.clone();
                async move {
                    let project = project.project().to_resolved().await?;
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
                .instrument(tracing::info_span!(
                    "HMR subscription",
                    identifier = %outer_identifier
                ))
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

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_hmr_identifiers_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let container = project.container;
    subscribe(
        turbo_tasks.clone(),
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
    let turbo_tasks = project.turbo_tasks.clone();
    tokio::spawn(async move {
        loop {
            let update_info = turbo_tasks
                .aggregated_update_info(Duration::ZERO, Duration::ZERO)
                .await;

            func.call(
                Ok(UpdateMessage::Start),
                ThreadsafeFunctionCallMode::NonBlocking,
            );

            let update_info = match update_info {
                Some(update_info) => update_info,
                None => {
                    turbo_tasks
                        .get_or_wait_aggregated_update_info(Duration::from_millis(
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
    let turbo_tasks = project.turbo_tasks.clone();
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
        let mut receiver = turbo_tasks.get_compilation_events_stream(event_types);
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
    file_path: RcStr,
) -> Result<Vc<OptionStringifiedSourceMap>> {
    let (file, module) = match Url::parse(&file_path) {
        Ok(url) => match url.scheme() {
            "file" => {
                let path = urlencoding::decode(url.path())?.to_string();
                let module = url.query_pairs().find(|(k, _)| k == "id");
                (
                    path,
                    match module {
                        Some(module) => Some(urlencoding::decode(&module.1)?.into_owned().into()),
                        None => None,
                    },
                )
            }
            _ => bail!("Unknown url scheme"),
        },
        Err(_) => (file_path.to_string(), None),
    };

    let Some(chunk_base) = file.strip_prefix(
        &(format!(
            "{}/{}/",
            container.project().await?.project_path,
            container.project().dist_dir().await?
        )),
    ) else {
        // File doesn't exist within the dist dir
        return Ok(OptionStringifiedSourceMap::none());
    };

    let server_path = container.project().node_root().join(chunk_base.into());

    let client_path = container
        .project()
        .client_relative_path()
        .join(chunk_base.into());

    let mut map = container.get_source_map(server_path, module.clone());

    if map.await?.is_none() {
        // If the chunk doesn't exist as a server chunk, try a client chunk.
        // TODO: Properly tag all server chunks and use the `isServer` query param.
        // Currently, this is inaccurate as it does not cover RSC server
        // chunks.
        map = container.get_source_map(client_path, module);
        if map.await?.is_none() {
            bail!("chunk/module '{}' is missing a sourcemap", file_path);
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

    let token = map
        .lookup_token(
            line.saturating_sub(1),
            frame.column.unwrap_or(1).saturating_sub(1),
        )
        .await?;

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
        uri_from_file(container.project().project_root_path(), None).await? + "/";
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

#[napi]
pub async fn project_trace_source(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    frame: StackFrame,
    current_directory_file_url: String,
) -> napi::Result<Option<StackFrame>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let container = project.container;
    let traced_frame = turbo_tasks
        .run_once(async move {
            project_trace_source_operation(
                container,
                frame,
                RcStr::from(current_directory_file_url),
            )
            .read_strongly_consistent()
            .await
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    Ok(ReadRef::into_owned(traced_frame))
}

#[napi]
pub async fn project_get_source_for_asset(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    file_path: RcStr,
) -> napi::Result<Option<String>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let source = turbo_tasks
        .run_once(async move {
            let source_content = &*project
                .container
                .project()
                .project_path()
                .fs()
                .root()
                .join(file_path.clone())
                .read()
                .await?;

            let FileContent::Content(source_content) = source_content else {
                bail!("Cannot find source for asset {}", file_path);
            };

            Ok(Some(source_content.content().to_str()?.into_owned()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(source)
}

#[napi]
pub async fn project_get_source_map(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    file_path: RcStr,
) -> napi::Result<Option<String>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let container = project.container;

    let source_map = turbo_tasks
        .run_once(async move {
            let Some(map) = &*get_source_map_rope_operation(container, file_path)
                .read_strongly_consistent()
                .await?
            else {
                return Ok(None);
            };
            Ok(Some(map.to_str()?.to_string()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(source_map)
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
