use std::sync::Arc;

use anyhow::Result;
use napi::{bindgen_prelude::External, JsFunction};
use next_api::{
    project::{Middleware, ProjectContainer, ProjectOptions},
    route::{Endpoint, Route},
};
use turbo_tasks::{TurboTasks, Vc};
use turbopack_binding::{
    turbo::tasks_memory::MemoryBackend, turbopack::core::error::PrettyPrintError,
};

use super::{
    endpoint::ExternalEndpoint,
    utils::{serde_enum_to_string, subscribe, NapiDiagnostic, NapiIssue, RootTask, VcArc},
};
use crate::register;

#[napi(object)]
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

    /// Whether to watch he filesystem for file changes.
    pub watch: bool,

    /// The contents of next.config.js, serialized to JSON.
    pub next_config: String,

    /// A map of environment variables to use when compiling code.
    pub env: Vec<NapiEnvVar>,

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
            env: val
                .env
                .into_iter()
                .map(|NapiEnvVar { name, value }| (name, value))
                .collect(),
        }
    }
}

#[napi(ts_return_type = "{ __napiType: \"Project\" }")]
pub async fn project_new(
    options: NapiProjectOptions,
) -> napi::Result<External<VcArc<Vc<ProjectContainer>>>> {
    register();
    let turbo_tasks = TurboTasks::new(MemoryBackend::new(
        options
            .memory_limit
            .map(|m| m as usize)
            .unwrap_or(usize::MAX),
    ));
    let options = options.into();
    let project = turbo_tasks
        .run_once(async move {
            let project = ProjectContainer::new(options).resolve().await?;
            // get errors early
            project.project().await?;
            Ok(project)
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    Ok(External::new_with_size_hint(
        VcArc::new(turbo_tasks, project),
        100,
    ))
}

#[napi(ts_return_type = "{ __napiType: \"Project\" }")]
pub async fn project_update(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<
        VcArc<Vc<ProjectContainer>>,
    >,
    options: NapiProjectOptions,
) -> napi::Result<()> {
    if options.memory_limit.is_some() {
        return Err(napi::Error::from_reason(
            "memory_limit cannot be changed after project creation".to_string(),
        ));
    }
    let turbo_tasks = project.turbo_tasks().clone();
    let options = options.into();
    let project = **project;
    turbo_tasks
        .run_once(async move {
            project.update(options).await?;
            // get errors early
            project.project().await?;
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
    pub endpoint: External<VcArc<Vc<Box<dyn Endpoint>>>>,
    pub runtime: String,
    pub matcher: Option<Vec<String>>,
}

impl NapiMiddleware {
    fn from_middleware(
        value: &Middleware,
        turbo_tasks: &Arc<TurboTasks<MemoryBackend>>,
    ) -> Result<Self> {
        Ok(NapiMiddleware {
            endpoint: External::new(VcArc::new(turbo_tasks.clone(), value.endpoint)),
            runtime: serde_enum_to_string(&value.config.runtime)?,
            matcher: value.config.matcher.clone(),
        })
    }
}

#[napi(object)]
struct NapiEntrypoints {
    pub routes: Vec<NapiRoute>,
    pub middleware: Option<NapiMiddleware>,
    pub issues: Vec<NapiIssue>,
    pub diagnostics: Vec<NapiDiagnostic>,
}

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn project_entrypoints_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Project\" }")] project: External<
        VcArc<Vc<ProjectContainer>>,
    >,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = project.turbo_tasks().clone();
    let project = **project;
    subscribe(
        turbo_tasks.clone(),
        func,
        move || async move {
            let entrypoints = project.project().entrypoints();
            let entrypoints = entrypoints.strongly_consistent().await?;
            // TODO peek_issues and diagnostics
            Ok(entrypoints)
        },
        move |ctx| {
            let entrypoints = ctx.value;
            Ok(vec![NapiEntrypoints {
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
                issues: vec![],
                diagnostics: vec![],
            }])
        },
    )
}
