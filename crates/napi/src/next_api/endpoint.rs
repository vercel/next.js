use std::{ops::Deref, sync::Arc};

use anyhow::Result;
use futures_util::TryFutureExt;
use napi::{JsFunction, bindgen_prelude::External};
use next_api::{
    module_graph_snapshot::{ModuleGraphSnapshot, get_module_graph_snapshot},
    operation::OptionEndpoint,
    paths::ServerPath,
    route::{
        Endpoint, EndpointOutputPaths, endpoint_client_changed_operation,
        endpoint_server_changed_operation, endpoint_write_to_disk_operation,
    },
};
use tracing::Instrument;
use turbo_tasks::{
    Completion, Effects, OperationVc, ReadRef, TryFlatJoinIterExt, TryJoinIterExt, Vc,
};
use turbopack_core::{diagnostics::PlainDiagnostic, error::PrettyPrintError, issue::PlainIssue};

use super::utils::{
    DetachedVc, NapiDiagnostic, NapiIssue, RootTask, TurbopackResult,
    strongly_consistent_catch_collectables, subscribe,
};
use crate::next_api::module_graph::NapiModuleGraphSnapshot;

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

impl From<Option<EndpointOutputPaths>> for NapiWrittenEndpoint {
    fn from(written_endpoint: Option<EndpointOutputPaths>) -> Self {
        match written_endpoint {
            Some(EndpointOutputPaths::NodeJs {
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

#[napi(object)]
pub struct NapiModuleGraphSnapshots {
    pub module_graphs: Vec<NapiModuleGraphSnapshot>,
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

#[napi]
#[tracing::instrument(skip_all)]
pub async fn endpoint_write_to_disk(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
) -> napi::Result<TurbopackResult<NapiWrittenEndpoint>> {
    let ctx = endpoint.turbopack_ctx();
    let endpoint_op = ***endpoint;
    let (written, issues, diags) = endpoint
        .turbopack_ctx()
        .turbo_tasks()
        .run_once(async move {
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
        .or_else(|e| ctx.throw_turbopack_internal_result(&e))
        .await?;
    Ok(TurbopackResult {
        result: NapiWrittenEndpoint::from(written.map(ReadRef::into_owned)),
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
        diagnostics: diags.iter().map(|d| NapiDiagnostic::from(d)).collect(),
    })
}

#[turbo_tasks::value(serialization = "none")]
struct ModuleGraphsWithIssues {
    module_graphs: Option<ReadRef<ModuleGraphSnapshots>>,
    issues: Arc<Vec<ReadRef<PlainIssue>>>,
    diagnostics: Arc<Vec<ReadRef<PlainDiagnostic>>>,
    effects: Arc<Effects>,
}

#[turbo_tasks::function(operation)]
async fn get_module_graphs_with_issues_operation(
    endpoint_op: OperationVc<OptionEndpoint>,
) -> Result<Vc<ModuleGraphsWithIssues>> {
    let module_graphs_op = get_module_graphs_operation(endpoint_op);
    let (module_graphs, issues, diagnostics, effects) =
        strongly_consistent_catch_collectables(module_graphs_op).await?;
    Ok(ModuleGraphsWithIssues {
        module_graphs,
        issues,
        diagnostics,
        effects,
    }
    .cell())
}

#[turbo_tasks::value(transparent)]
struct ModuleGraphSnapshots(Vec<ReadRef<ModuleGraphSnapshot>>);

#[turbo_tasks::function(operation)]
async fn get_module_graphs_operation(
    endpoint_op: OperationVc<OptionEndpoint>,
) -> Result<Vc<ModuleGraphSnapshots>> {
    let Some(endpoint) = *endpoint_op.connect().await? else {
        return Ok(Vc::cell(vec![]));
    };
    let graphs = endpoint.module_graphs().await?;
    let entries = endpoint.entries().await?;
    let entry_modules = entries.iter().flat_map(|e| e.entries()).collect::<Vec<_>>();
    let snapshots = graphs
        .iter()
        .map(async |&graph| {
            let module_graph = graph.await?;
            let entry_modules = entry_modules
                .iter()
                .map(async |&m| Ok(module_graph.has_entry(m).await?.then_some(m)))
                .try_flat_join()
                .await?;
            Ok((*graph, entry_modules))
        })
        .try_join()
        .await?
        .into_iter()
        .map(|(graph, entry_modules)| (graph, Vc::cell(entry_modules)))
        .collect::<Vec<_>>()
        .into_iter()
        .map(async |(graph, entry_modules)| {
            get_module_graph_snapshot(graph, Some(entry_modules)).await
        })
        .try_join()
        .await?;
    Ok(Vc::cell(snapshots))
}

#[napi]
pub async fn endpoint_module_graphs(
    #[napi(ts_arg_type = "{ __napiType: \"Endpoint\" }")] endpoint: External<ExternalEndpoint>,
) -> napi::Result<TurbopackResult<NapiModuleGraphSnapshots>> {
    let endpoint_op: OperationVc<OptionEndpoint> = ***endpoint;
    let (module_graphs, issues, diagnostics) = endpoint
        .turbopack_ctx()
        .turbo_tasks()
        .run_once(async move {
            let module_graphs_op = get_module_graphs_with_issues_operation(endpoint_op);
            let ModuleGraphsWithIssues {
                module_graphs,
                issues,
                diagnostics,
                effects: _,
            } = &*module_graphs_op.connect().await?;
            Ok((module_graphs.clone(), issues.clone(), diagnostics.clone()))
        })
        .await
        .map_err(|e| napi::Error::from_reason(PrettyPrintError(&e).to_string()))?;

    Ok(TurbopackResult {
        result: NapiModuleGraphSnapshots {
            module_graphs: module_graphs
                .into_iter()
                .flat_map(|m| m.into_iter())
                .map(|m| NapiModuleGraphSnapshot::from(&**m))
                .collect(),
        },
        issues: issues.iter().map(|i| NapiIssue::from(&**i)).collect(),
        diagnostics: diagnostics
            .iter()
            .map(|d| NapiDiagnostic::from(d))
            .collect(),
    })
}

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
