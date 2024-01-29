use std::{path::PathBuf, sync::Arc, time::Duration};

use anyhow::{anyhow, bail, Context, Result};
use napi::{
    bindgen_prelude::External,
    threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode},
    JsFunction, Status,
};
use next_api::{
    entrypoints::Entrypoints,
    project::{
        DefineEnv, Instrumentation, Middleware, PartialProjectOptions, Project, ProjectContainer,
        ProjectOptions,
    },
    route::{Endpoint, Route},
};
use next_core::tracing_presets::{
    TRACING_NEXT_OVERVIEW_TARGETS, TRACING_NEXT_TARGETS, TRACING_NEXT_TURBOPACK_TARGETS,
    TRACING_NEXT_TURBO_TASKS_TARGETS,
};
use tracing::Instrument;
use tracing_subscriber::{
    prelude::__tracing_subscriber_SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry,
};
use turbo_tasks::{ReadRef, TransientInstance, TurboTasks, UpdateInfo, Vc};
use turbopack_binding::{
    turbo::{
        tasks_fs::{FileContent, FileSystem},
        tasks_memory::MemoryBackend,
    },
    turbopack::{
        core::{
            diagnostics::PlainDiagnostic,
            error::PrettyPrintError,
            issue::PlainIssue,
            source_map::{GenerateSourceMap, Token},
            version::{PartialUpdate, TotalUpdate, Update, VersionState},
        },
        ecmascript_hmr_protocol::{ClientUpdateInstruction, ResourceIdentifier},
        trace_utils::{
            exit::ExitGuard,
            raw_trace::RawTraceLayer,
            trace_writer::{TraceWriter, TraceWriterGuard},
        },
    },
};
use url::Url;

use super::{
    endpoint::ExternalEndpoint,
    utils::{
        get_diagnostics, get_issues, subscribe, NapiDiagnostic, NapiIssue, RootTask,
        TurbopackResult, VcArc,
    },
};
use crate::register;

#[napi(object)]
#[derive(Clone, Debug)]
pub struct NapiEnvVar {
    pub name: String,
    pub value: String,
}

#[napi(object)]
pub struct NapiProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: String,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: String,

    /// next.config's distDir. Project initialization occurs eariler than
    /// deserializing next.config, so passing it as separate option.
    pub dist_dir: Option<String>,

    /// Whether to watch he filesystem for file changes.
    pub watch: bool,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: String,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: String,

    /// A map of environment variables to use when compiling code.
    pub env: Vec<NapiEnvVar>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: NapiDefineEnv,

    /// The address of the dev server.
    pub server_addr: String,
}

/// [NapiProjectOptions] with all fields optional.
#[napi(object)]
pub struct NapiPartialProjectOptions {
    /// A root path from which all files must be nested under. Trying to access
    /// a file outside this root will fail. Think of this as a chroot.
    pub root_path: Option<String>,

    /// A path inside the root_path which contains the app/pages directories.
    pub project_path: Option<String>,

    /// next.config's distDir. Project initialization occurs eariler than
    /// deserializing next.config, so passing it as separate option.
    pub dist_dir: Option<Option<String>>,

    /// Whether to watch he filesystem for file changes.
    pub watch: Option<bool>,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: Option<String>,

    /// The contents of ts/config read by load-jsconfig, serialized to JSON.
    pub js_config: Option<String>,

    /// A map of environment variables to use when compiling code.
    pub env: Option<Vec<NapiEnvVar>>,

    /// A map of environment variables which should get injected at compile
    /// time.
    pub define_env: Option<NapiDefineEnv>,

    /// The address of the dev server.
    pub server_addr: Option<String>,
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
    /// An upper bound of memory that turbopack will attempt to stay under.
    pub memory_limit: Option<f64>,
}

impl From<NapiProjectOptions> for ProjectOptions {
    fn from(val: NapiProjectOptions) -> Self {
        ProjectOptions {
            root_path: val.root_path,
            project_path: val.project_path,
            watch: val.watch,
            next_config: val.next_config,
            js_config: val.js_config,
            env: val
                .env
                .into_iter()
                .map(|var| (var.name, var.value))
                .collect(),
            define_env: val.define_env.into(),
            server_addr: val.server_addr,
        }
    }
}

impl From<NapiPartialProjectOptions> for PartialProjectOptions {
    fn from(val: NapiPartialProjectOptions) -> Self {
        PartialProjectOptions {
            root_path: val.root_path,
            project_path: val.project_path,
            watch: val.watch,
            next_config: val.next_config,
            js_config: val.js_config,
            env: val
                .env
                .map(|env| env.into_iter().map(|var| (var.name, var.value)).collect()),
            define_env: val.define_env.map(|env| env.into()),
            server_addr: val.server_addr,
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
    turbo_tasks: Arc<TurboTasks<MemoryBackend>>,
    container: Vc<ProjectContainer>,
    #[allow(dead_code)]
    guard: Option<ExitGuard<TraceWriterGuard>>,
}

#[napi(ts_return_type = "{ __napiType: \"Project\" }")]
pub async fn project_new(
    options: NapiProjectOptions,
    turbo_engine_options: NapiTurboEngineOptions,
) -> napi::Result<External<ProjectInstance>> {
    register();

    let trace = std::env::var("NEXT_TURBOPACK_TRACING").ok();

    let guard = if let Some(mut trace) = trace {
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

        let subscriber = subscriber.with(EnvFilter::builder().parse(trace).unwrap());
        let dist_dir = options
            .dist_dir
            .as_ref()
            .map_or_else(|| ".next".to_string(), |d| d.to_string());

        let internal_dir = PathBuf::from(&options.project_path).join(dist_dir);
        std::fs::create_dir_all(&internal_dir)
            .context("Unable to create .next directory")
            .unwrap();
        let trace_file = internal_dir.join("trace.log");
        let trace_writer = std::fs::File::create(trace_file).unwrap();
        let (trace_writer, guard) = TraceWriter::new(trace_writer);
        let subscriber = subscriber.with(RawTraceLayer::new(trace_writer));

        let guard = ExitGuard::new(guard).unwrap();

        subscriber.init();

        Some(guard)
    } else {
        None
    };

    let turbo_tasks = TurboTasks::new(MemoryBackend::new(
        turbo_engine_options
            .memory_limit
            .map(|m| m as usize)
            .unwrap_or(usize::MAX),
    ));
    let options = options.into();
    let container = turbo_tasks
        .run_once(async move {
            let project = ProjectContainer::new(options);
            let project = project.resolve().await?;
            Ok(project)
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    Ok(External::new_with_size_hint(
        ProjectInstance {
            turbo_tasks,
            container,
            guard,
        },
        100,
    ))
}

#[napi(ts_return_type = "{ __napiType: \"Project\" }")]
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

#[napi(object)]
#[derive(Default)]
struct NapiRoute {
    /// The relative path from project_path to the route file
    pub pathname: String,

    /// The type of route, eg a Page or App
    pub r#type: &'static str,

    // Different representations of the endpoint
    pub endpoint: Option<External<ExternalEndpoint>>,
    pub html_endpoint: Option<External<ExternalEndpoint>>,
    pub rsc_endpoint: Option<External<ExternalEndpoint>>,
    pub data_endpoint: Option<External<ExternalEndpoint>>,
}

impl NapiRoute {
    fn from_route(
        pathname: String,
        value: Route,
        turbo_tasks: &Arc<TurboTasks<MemoryBackend>>,
    ) -> Self {
        let convert_endpoint = |endpoint: Vc<Box<dyn Endpoint>>| {
            Some(External::new(ExternalEndpoint(VcArc::new(
                turbo_tasks.clone(),
                endpoint,
            ))))
        };
        match value {
            Route::Page {
                html_endpoint,
                data_endpoint,
            } => NapiRoute {
                pathname,
                r#type: "page",
                html_endpoint: convert_endpoint(html_endpoint),
                data_endpoint: convert_endpoint(data_endpoint),
                ..Default::default()
            },
            Route::PageApi { endpoint } => NapiRoute {
                pathname,
                r#type: "page-api",
                endpoint: convert_endpoint(endpoint),
                ..Default::default()
            },
            Route::AppPage {
                html_endpoint,
                rsc_endpoint,
            } => NapiRoute {
                pathname,
                r#type: "app-page",
                html_endpoint: convert_endpoint(html_endpoint),
                rsc_endpoint: convert_endpoint(rsc_endpoint),
                ..Default::default()
            },
            Route::AppRoute { endpoint } => NapiRoute {
                pathname,
                r#type: "app-route",
                endpoint: convert_endpoint(endpoint),
                ..Default::default()
            },
            Route::Conflict => NapiRoute {
                pathname,
                r#type: "conflict",
                ..Default::default()
            },
        }
    }
}

#[napi(object)]
struct NapiMiddleware {
    pub endpoint: External<ExternalEndpoint>,
}

impl NapiMiddleware {
    fn from_middleware(
        value: &Middleware,
        turbo_tasks: &Arc<TurboTasks<MemoryBackend>>,
    ) -> Result<Self> {
        Ok(NapiMiddleware {
            endpoint: External::new(ExternalEndpoint(VcArc::new(
                turbo_tasks.clone(),
                value.endpoint,
            ))),
        })
    }
}

#[napi(object)]
struct NapiInstrumentation {
    pub node_js: External<ExternalEndpoint>,
    pub edge: External<ExternalEndpoint>,
}

impl NapiInstrumentation {
    fn from_instrumentation(
        value: &Instrumentation,
        turbo_tasks: &Arc<TurboTasks<MemoryBackend>>,
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
struct NapiEntrypoints {
    pub routes: Vec<NapiRoute>,
    pub middleware: Option<NapiMiddleware>,
    pub instrumentation: Option<NapiInstrumentation>,
    pub pages_document_endpoint: External<ExternalEndpoint>,
    pub pages_app_endpoint: External<ExternalEndpoint>,
    pub pages_error_endpoint: External<ExternalEndpoint>,
}

#[turbo_tasks::value(serialization = "none")]
struct EntrypointsWithIssues {
    entrypoints: ReadRef<Entrypoints>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
}

#[turbo_tasks::function]
async fn get_entrypoints_with_issues(
    container: Vc<ProjectContainer>,
) -> Result<Vc<EntrypointsWithIssues>> {
    let entrypoints_operation = container.entrypoints();
    let entrypoints = entrypoints_operation.strongly_consistent().await?;
    let issues = get_issues(entrypoints_operation).await?;
    let diagnostics = get_diagnostics(entrypoints_operation).await?;
    Ok(EntrypointsWithIssues {
        entrypoints,
        issues,
        diagnostics,
    }
    .cell())
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
                let EntrypointsWithIssues {
                    entrypoints,
                    issues,
                    diagnostics,
                } = &*get_entrypoints_with_issues(container)
                    .strongly_consistent()
                    .await?;
                Ok((entrypoints.clone(), issues.clone(), diagnostics.clone()))
            }
            .instrument(tracing::info_span!("entrypoints subscription"))
        },
        move |ctx| {
            let (entrypoints, issues, diags) = ctx.value;

            Ok(vec![TurbopackResult {
                result: NapiEntrypoints {
                    routes: entrypoints
                        .routes
                        .iter()
                        .map(|(pathname, &route)| {
                            NapiRoute::from_route(pathname.clone(), route, &turbo_tasks)
                        })
                        .collect::<Vec<_>>(),
                    middleware: entrypoints
                        .middleware
                        .as_ref()
                        .map(|m| NapiMiddleware::from_middleware(m, &turbo_tasks))
                        .transpose()?,
                    instrumentation: entrypoints
                        .instrumentation
                        .as_ref()
                        .map(|m| NapiInstrumentation::from_instrumentation(m, &turbo_tasks))
                        .transpose()?,
                    pages_document_endpoint: External::new(ExternalEndpoint(VcArc::new(
                        turbo_tasks.clone(),
                        entrypoints.pages_document_endpoint,
                    ))),
                    pages_app_endpoint: External::new(ExternalEndpoint(VcArc::new(
                        turbo_tasks.clone(),
                        entrypoints.pages_app_endpoint,
                    ))),
                    pages_error_endpoint: External::new(ExternalEndpoint(VcArc::new(
                        turbo_tasks.clone(),
                        entrypoints.pages_error_endpoint,
                    ))),
                },
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
}

#[turbo_tasks::function]
async fn hmr_update(
    project: Vc<Project>,
    identifier: String,
    state: Vc<VersionState>,
) -> Result<Vc<HmrUpdateWithIssues>> {
    let update_operation = project.hmr_update(identifier, state);
    let update = update_operation.strongly_consistent().await?;
    let issues = get_issues(update_operation).await?;
    let diagnostics = get_diagnostics(update_operation).await?;
    Ok(HmrUpdateWithIssues {
        update,
        issues,
        diagnostics,
    }
    .cell())
}

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_hmr_events(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    identifier: String,
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
                let identifier = outer_identifier.clone();
                let session = session.clone();
                async move {
                    let project = project.project().resolve().await?;
                    let state = project.hmr_version_state(identifier.clone(), session);
                    let update = hmr_update(project, identifier, state)
                        .strongly_consistent()
                        .await?;
                    let HmrUpdateWithIssues {
                        update,
                        issues,
                        diagnostics,
                    } = &*update;
                    match &**update {
                        Update::None => {}
                        Update::Total(TotalUpdate { to }) => {
                            state.set(to.clone()).await?;
                        }
                        Update::Partial(PartialUpdate { to, .. }) => {
                            state.set(to.clone()).await?;
                        }
                    }
                    Ok((update.clone(), issues.clone(), diagnostics.clone()))
                }
                .instrument(tracing::info_span!(
                    "HMR subscription",
                    identifier = outer_identifier
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
                .map(|issue| (&**issue).into())
                .collect::<Vec<_>>();

            let identifier = ResourceIdentifier {
                path: identifier.clone(),
                headers: None,
            };
            let update = match &*update {
                Update::Total(_) => ClientUpdateInstruction::restart(&identifier, &update_issues),
                Update::Partial(update) => ClientUpdateInstruction::partial(
                    &identifier,
                    &update.instruction,
                    &update_issues,
                ),
                Update::None => ClientUpdateInstruction::issues(&identifier, &update_issues),
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
    pub identifiers: Vec<String>,
}

#[turbo_tasks::value(serialization = "none")]
struct HmrIdentifiersWithIssues {
    identifiers: ReadRef<Vec<String>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
}

#[turbo_tasks::function]
async fn get_hmr_identifiers_with_issues(
    container: Vc<ProjectContainer>,
) -> Result<Vc<HmrIdentifiersWithIssues>> {
    let hmr_identifiers_operation = container.hmr_identifiers();
    let hmr_identifiers = hmr_identifiers_operation.strongly_consistent().await?;
    let issues = get_issues(hmr_identifiers_operation).await?;
    let diagnostics = get_diagnostics(hmr_identifiers_operation).await?;
    Ok(HmrIdentifiersWithIssues {
        identifiers: hmr_identifiers,
        issues,
        diagnostics,
    }
    .cell())
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
            let HmrIdentifiersWithIssues {
                identifiers,
                issues,
                diagnostics,
            } = &*get_hmr_identifiers_with_issues(container)
                .strongly_consistent()
                .await?;

            Ok((identifiers.clone(), issues.clone(), diagnostics.clone()))
        },
        move |ctx| {
            let (identifiers, issues, diagnostics) = ctx.value;

            Ok(vec![TurbopackResult {
                result: HmrIdentifiers {
                    identifiers: identifiers
                        .iter()
                        .map(|ident| ident.to_string())
                        .collect::<Vec<_>>(),
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

enum UpdateMessage {
    Start,
    End(UpdateInfo),
}

#[napi(object)]
struct NapiUpdateMessage {
    pub update_type: String,
    pub value: Option<NapiUpdateInfo>,
}

impl From<UpdateMessage> for NapiUpdateMessage {
    fn from(update_message: UpdateMessage) -> Self {
        match update_message {
            UpdateMessage::Start => NapiUpdateMessage {
                update_type: "start".to_string(),
                value: None,
            },
            UpdateMessage::End(info) => NapiUpdateMessage {
                update_type: "end".to_string(),
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
                eprintln!("{}", error);
                break;
            }
        }
    });
    Ok(())
}

#[turbo_tasks::value]
#[derive(Debug)]
#[napi(object)]
pub struct StackFrame {
    pub column: Option<u32>,
    pub file: String,
    pub is_server: bool,
    pub line: u32,
    pub method_name: Option<String>,
}

#[napi]
pub async fn project_trace_source(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    frame: StackFrame,
) -> napi::Result<Option<StackFrame>> {
    let turbo_tasks = project.turbo_tasks.clone();
    let traced_frame = turbo_tasks
        .run_once(async move {
            let file = match Url::parse(&frame.file) {
                Ok(url) => match url.scheme() {
                    "file" => urlencoding::decode(url.path())?.to_string(),
                    _ => bail!("Unknown url scheme"),
                },
                Err(_) => frame.file.to_string(),
            };

            let Some(chunk_base) = file.strip_prefix(
                &(format!(
                    "{}/{}/",
                    project.container.project().await?.project_path,
                    project.container.project().dist_dir().await?
                )),
            ) else {
                // File doesn't exist within the dist dir
                return Ok(None);
            };

            let path = if frame.is_server {
                project
                    .container
                    .project()
                    .node_root()
                    .join(chunk_base.to_owned())
            } else {
                project
                    .container
                    .project()
                    .client_relative_path()
                    .join(chunk_base.to_owned())
            };

            let Some(versioned) = Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(
                project.container.get_versioned_content(path),
            )
            .await?
            else {
                bail!("Could not GenerateSourceMap")
            };

            let map = versioned
                .generate_source_map()
                .await?
                .context("Chunk is missing a sourcemap")?;

            let token = map
                .lookup_token(frame.line as usize, frame.column.unwrap_or(0) as usize)
                .await?
                .clone_value()
                .context("Unable to trace token from sourcemap")?;

            let Token::Original(token) = token else {
                return Ok(None);
            };

            let Some(source_file) = token.original_file.strip_prefix("/turbopack/[project]/")
            else {
                bail!("Original file outside project")
            };

            Ok(Some(StackFrame {
                file: source_file.to_string(),
                method_name: token.name,
                line: token.original_line as u32,
                column: Some(token.original_column as u32),
                is_server: frame.is_server,
            }))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    Ok(traced_frame)
}

#[napi]
pub async fn project_get_source_for_asset(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<ProjectInstance>,
    file_path: String,
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
                .join(file_path.to_string())
                .read()
                .await?;

            let FileContent::Content(source_content) = source_content else {
                bail!("Cannot find source for asset {}", file_path);
            };

            Ok(Some(source_content.content().to_str()?.to_string()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(source)
}
