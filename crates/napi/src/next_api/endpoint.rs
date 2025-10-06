use std::{ops::Deref, sync::Arc};

use anyhow::Result;
use futures_util::TryFutureExt;
use napi::{JsFunction, bindgen_prelude::External};
use next_api::{
    operation::OptionEndpoint,
    paths::ServerPath,
    route::{
        EndpointOutputPaths, endpoint_client_changed_operation, endpoint_server_changed_operation,
        endpoint_write_to_disk_operation,
    },
};
use tracing::Instrument;
use turbo_tasks::{Completion, Effects, OperationVc, ReadRef, Vc};
use turbopack_core::{diagnostics::PlainDiagnostic, issue::PlainIssue};

use super::utils::{
    DetachedVc, NapiDiagnostic, NapiIssue, RootTask, TurbopackResult,
    strongly_consistent_catch_collectables, subscribe,
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
            path: server_path.path.into_owned(),
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

impl From<Option<EndpointOutputPaths>> for NapiWrittenEndpoint {
    fn from(written_endpoint: Option<EndpointOutputPaths>) -> Self {
        match written_endpoint {
            Some(EndpointOutputPaths::NodeJs {
                server_entry_path,
                server_paths,
                client_paths,
            }) => Self {
                r#type: "nodejs".to_string(),
                entry_path: Some(server_entry_path.into_owned()),
                client_paths: client_paths.into_iter().map(From::from).collect(),
                server_paths: server_paths.into_iter().map(From::from).collect(),
                ..Default::default()
            },
            Some(EndpointOutputPaths::Edge {
                server_paths,
                client_paths,
            }) => Self {
                r#type: "edge".to_string(),
                client_paths: client_paths.into_iter().map(From::from).collect(),
                server_paths: server_paths.into_iter().map(From::from).collect(),
                ..Default::default()
            },
            Some(EndpointOutputPaths::NotFound) | None => Self {
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
pub struct ExternalEndpoint(pub DetachedVc<OptionEndpoint>);

impl Deref for ExternalEndpoint {
    type Target = DetachedVc<OptionEndpoint>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[turbo_tasks::value(serialization = "none")]
struct WrittenEndpointWithIssues {
    written: Option<ReadRef<EndpointOutputPaths>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
async fn get_written_endpoint_with_issues_operation(
    endpoint_op: OperationVc<OptionEndpoint>,
) -> Result<Vc<WrittenEndpointWithIssues>> {
    let write_to_disk_op = endpoint_write_to_disk_operation(endpoint_op);
    let (written, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(write_to_disk_op).await?;
    Ok(WrittenEndpointWithIssues {
        written,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[tracing::instrument(level = "info", name = "write endpoint to disk", skip_all)]
#[napi]
pub async fn endpoint_write_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
) -> napi::Result<TurbopackResult<NapiWrittenEndpoint>> {
    let ctx = endpoint.turbopack_ctx();
    let endpoint_op = ***endpoint;
    let (written, issues, diags) = endpoint
        .turbopack_ctx()
        .turbo_tasks()
        .run(async move {
            let written_entrypoint_with_issues_op =
                get_written_endpoint_with_issues_operation(endpoint_op);
            let WrittenEndpointWithIssues {
                written,
                issues,
                diagnostics,
                effects,
            } = &*written_entrypoint_with_issues_op
                .read_strongly_consistent()
                .await?;
            effects.apply().await?;

            Ok((written.clone(), issues.clone(), diagnostics.clone()))
        })
        .or_else(|e| ctx.throw_turbopack_internal_result(&e.into()))
        .await?;
    Ok(TurbopackResult {
        result: NapiWrittenEndpoint::from(written.map(ReadRef::into_owned)),
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
        diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
    })
}

#[tracing::instrument(level = "info", name = "get server-side endpoint changes", skip_all)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn endpoint_server_changed_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
    issues: bool,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbopack_ctx = endpoint.turbopack_ctx().clone();
    let endpoint = ***endpoint;
    subscribe(
        turbopack_ctx,
        func,
        move || {
            async move {
                let issues_and_diags_op = subscribe_issues_and_diags_operation(endpoint, issues);
                let result = issues_and_diags_op.read_strongly_consistent().await?;
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

#[turbo_tasks::function(operation)]
async fn subscribe_issues_and_diags_operation(
    endpoint_op: OperationVc<OptionEndpoint>,
    should_include_issues: bool,
) -> Result<Vc<EndpointIssuesAndDiags>> {
    let changed_op = endpoint_server_changed_operation(endpoint_op);

    if should_include_issues {
        let (changed_value, issues, diagnostics, effects) =
            strongly_consistent_catch_collectables(changed_op).await?;
        Ok(EndpointIssuesAndDiags {
            changed: changed_value,
            issues,
            diagnostics,
            effects,
        }
        .cell())
    } else {
        let changed_value = changed_op.read_strongly_consistent().await?;
        Ok(EndpointIssuesAndDiags {
            changed: Some(changed_value),
            issues: Arc::new(vec![]),
            diagnostics: Arc::new(vec![]),
            effects: Arc::new(Effects::default()),
        }
        .cell())
    }
}

#[tracing::instrument(level = "info", name = "get client-side endpoint changes", skip_all)]
#[napi(ts_return_type = "{ __napiType: \"RootTask\" }")]
pub fn endpoint_client_changed_subscribe(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
    func: JsFunction,
) -> napi::Result<External<RootTask>> {
    let turbopack_ctx = endpoint.turbopack_ctx().clone();
    let endpoint_op = ***endpoint;
    subscribe(
        turbopack_ctx,
        func,
        move || {
            async move {
                let changed_op = endpoint_client_changed_operation(endpoint_op);
                // We don't capture issues and diagnostics here since we don't want to be
                // notified when they change
                //
                // This must be a *read*, not just a resolve, because we need the root task created
                // by `subscribe` to re-run when the `Completion`'s value changes (via equality),
                // even if the cell id doesn't change.
                let _ = changed_op.read_strongly_consistent().await?;
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
