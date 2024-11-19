use std::{ops::Deref, sync::Arc};

use anyhow::Result;
use napi::{bindgen_prelude::External, JsFunction};
use next_api::{
    paths::ServerPath,
    route::{Endpoint, WrittenEndpoint},
};
use tracing::Instrument;
use turbo_tasks::{get_effects, Completion, Effects, ReadRef, Vc, VcValueType};
use turbopack_core::{
    diagnostics::PlainDiagnostic,
    error::PrettyPrintError,
    issue::{IssueSeverity, PlainIssue},
};

use super::utils::{
    get_diagnostics, get_issues, subscribe, NapiDiagnostic, NapiIssue, RootTask, TurbopackResult,
    VcArc,
};

#[napi(object)]
#[derive(Default)]
pub struct NapiEndpointConfig {}

#[napi(object)]
#[derive(Default)]
pub struct NapiServerPath {
    pub path: String,
    pub content_hash: String,
}

impl From<ServerPath> for NapiServerPath {
    fn from(server_path: ServerPath) -> Self {
        Self {
            path: server_path.path,
            content_hash: format!("{:x}", server_path.content_hash),
        }
    }
}

#[napi(object)]
#[derive(Default)]
pub struct NapiWrittenEndpoint {
    pub r#type: String,
    pub entry_path: Option<String>,
    pub client_paths: Vec<String>,
    pub server_paths: Vec<NapiServerPath>,
    pub config: NapiEndpointConfig,
}

impl From<Option<WrittenEndpoint>> for NapiWrittenEndpoint {
    fn from(written_endpoint: Option<WrittenEndpoint>) -> Self {
        match written_endpoint {
            Some(WrittenEndpoint::NodeJs {
                server_entry_path,
                server_paths,
                client_paths,
            }) => Self {
                r#type: "nodejs".to_string(),
                entry_path: Some(server_entry_path),
                client_paths: client_paths.into_iter().map(From::from).collect(),
                server_paths: server_paths.into_iter().map(From::from).collect(),
                ..Default::default()
            },
            Some(WrittenEndpoint::Edge {
                server_paths,
                client_paths,
            }) => Self {
                r#type: "edge".to_string(),
                client_paths: client_paths.into_iter().map(From::from).collect(),
                server_paths: server_paths.into_iter().map(From::from).collect(),
                ..Default::default()
            },
            None => Self {
                r#type: "none".to_string(),
                ..Default::default()
            },
        }
    }
}

// NOTE(alexkirsz) We go through an extra layer of indirection here because of
// two factors:
// 1. rustc currently has a bug where using a dyn trait as a type argument to
//    some async functions (in this case `endpoint_write_to_disk`) can cause
//    higher-ranked lifetime errors. See https://github.com/rust-lang/rust/issues/102211
// 2. the type_complexity clippy lint.
pub struct ExternalEndpoint(pub VcArc<Vc<Box<dyn Endpoint>>>);

impl Deref for ExternalEndpoint {
    type Target = VcArc<Vc<Box<dyn Endpoint>>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// Await the source and return fatal issues if there are any, otherwise
// propagate any actual error results.
async fn strongly_consistent_catch_collectables<R: VcValueType + Send>(
    source: Vc<R>,
) -> Result<(
    Option<ReadRef<R>>,
    Arc<Vec<ReadRef<PlainIssue>>>,
    Arc<Vec<ReadRef<PlainDiagnostic>>>,
    Arc<Effects>,
)> {
    let result = source.strongly_consistent().await;
    let issues = get_issues(source).await?;
    let diagnostics = get_diagnostics(source).await?;
    let effects = Arc::new(get_effects(source).await?);

    let result = if result.is_err() && issues.iter().any(|i| i.severity <= IssueSeverity::Error) {
        None
    } else {
        Some(result?)
    };

    Ok((result, issues, diagnostics, effects))
}

#[turbo_tasks::value(serialization = "none")]
struct WrittenEndpointWithIssues {
    written: Option<ReadRef<WrittenEndpoint>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function]
async fn get_written_endpoint_with_issues(
    endpoint: Vc<Box<dyn Endpoint>>,
) -> Result<Vc<WrittenEndpointWithIssues>> {
    let write_to_disk = endpoint.write_to_disk();
    let (written, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(write_to_disk).await?;
    Ok(WrittenEndpointWithIssues {
        written,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[napi]
#[tracing::instrument(skip_all)]
pub async fn endpoint_write_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
) -> napi::Result<TurbopackResult<NapiWrittenEndpoint>> {
    let turbo_tasks = endpoint.turbo_tasks().clone();
    let endpoint = ***endpoint;
    let (written, issues, diags) = turbo_tasks
        .run_once(async move {
            let operation = get_written_endpoint_with_issues(endpoint);
            let WrittenEndpointWithIssues {
                written,
                issues,
                diagnostics,
                effects,
            } = &*operation.strongly_consistent().await?;
            effects.apply().await?;

            Ok((written.clone(), issues.clone(), diagnostics.clone()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;
    Ok(TurbopackResult {
        result: NapiWrittenEndpoint::from(written.map(|v| v.clone_value())),
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
        diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
    })
}

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn endpoint_server_changed_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
    issues: bool,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = endpoint.turbo_tasks().clone();
    let endpoint = ***endpoint;
    subscribe(
        turbo_tasks,
        func,
        move || {
            async move {
                let operation = subscribe_issues_and_diags(endpoint, issues);
                let result = operation.strongly_consistent().await?;
                result.effects.apply().await?;
                Ok(result)
            }
            .instrument(tracing::info_span!("server changes subscription"))
        },
        |ctx| {
            let EndpointIssuesAndDiags {
                changed: _,
                issues,
                diagnostics,
                effects: _,
            } = &*ctx.value;

            Ok(vec![TurbopackResult {
                result: (),
                issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
                diagnostics: diagnostics
                    .iter()
                    .map(|d| NapiDiagnostic::from(d))
                    .collect(),
            }])
        },
    )
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
struct EndpointIssuesAndDiags {
    changed: Option<ReadRef<Completion>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

impl PartialEq for EndpointIssuesAndDiags {
    fn eq(&self, other: &Self) -> bool {
        (match (&self.changed, &other.changed) {
            (Some(a), Some(b)) => ReadRef::ptr_eq(a, b),
            (None, None) => true,
            (None, Some(_)) | (Some(_), None) => false,
        }) && self.issues == other.issues
            && self.diagnostics == other.diagnostics
    }
}

impl Eq for EndpointIssuesAndDiags {}

#[turbo_tasks::function]
async fn subscribe_issues_and_diags(
    endpoint: Vc<Box<dyn Endpoint>>,
    should_include_issues: bool,
) -> Result<Vc<EndpointIssuesAndDiags>> {
    let changed = endpoint.server_changed();

    if should_include_issues {
        let (changed_value, issues, diagnostics, effects) =
            strongly_consistent_catch_collectables(changed).await?;
        Ok(EndpointIssuesAndDiags {
            changed: changed_value,
            issues,
            diagnostics,
            effects,
        }
        .cell())
    } else {
        let changed_value = changed.strongly_consistent().await?;
        Ok(EndpointIssuesAndDiags {
            changed: Some(changed_value),
            issues: Arc::new(vec![]),
            diagnostics: Arc::new(vec![]),
            effects: Arc::new(Effects::default()),
        }
        .cell())
    }
}

#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn endpoint_client_changed_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbo_tasks = endpoint.turbo_tasks().clone();
    let endpoint = ***endpoint;
    subscribe(
        turbo_tasks,
        func,
        move || {
            async move {
                let changed = endpoint.client_changed();
                // We don't capture issues and diagonistics here since we don't want to be
                // notified when they change
                changed.strongly_consistent().await?;
                Ok(())
            }
            .instrument(tracing::info_span!("client changes subscription"))
        },
        |_| {
            Ok(vec![TurbopackResult {
                result: (),
                issues: vec![],
                diagnostics: vec![],
            }])
        },
    )
}
