use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Completion, FxIndexMap, NonLocalValue, OperationVc, ResolvedVc, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack_core::{
    module_graph::{GraphEntries, ModuleGraph},
    output::OutputAssets,
};

use crate::{operation::OptionEndpoint, paths::ServerPath, project::Project};

#[derive(
    TraceRawVcs,
    Serialize,
    Deserialize,
    PartialEq,
    Eq,
    ValueDebugFormat,
    Clone,
    Debug,
    NonLocalValue,
)]
pub struct AppPageRoute {
    pub original_name: RcStr,
    pub html_endpoint: ResolvedVc<Box<dyn Endpoint>>,
    pub rsc_endpoint: ResolvedVc<Box<dyn Endpoint>>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum Route {
    Page {
        html_endpoint: ResolvedVc<Box<dyn Endpoint>>,
        data_endpoint: Option<ResolvedVc<Box<dyn Endpoint>>>,
    },
    PageApi {
        endpoint: ResolvedVc<Box<dyn Endpoint>>,
    },
    AppPage(Vec<AppPageRoute>),
    AppRoute {
        original_name: RcStr,
        endpoint: ResolvedVc<Box<dyn Endpoint>>,
    },
    Conflict,
}

#[turbo_tasks::value_trait]
pub trait Endpoint {
    #[turbo_tasks::function]
    fn output(self: Vc<Self>) -> Vc<EndpointOutput>;
    // fn write_to_disk(self: Vc<Self>) -> Vc<EndpointOutputPaths>;
    #[turbo_tasks::function]
    fn server_changed(self: Vc<Self>) -> Vc<Completion>;
    #[turbo_tasks::function]
    fn client_changed(self: Vc<Self>) -> Vc<Completion>;
    /// The entry modules for the modules graph.
    #[turbo_tasks::function]
    fn entries(self: Vc<Self>) -> Vc<GraphEntries>;
    /// Additional entry modules for the module graph.
    /// This may read the module graph and return additional modules.
    #[turbo_tasks::function]
    fn additional_entries(self: Vc<Self>, _graph: Vc<ModuleGraph>) -> Vc<GraphEntries> {
        GraphEntries::empty()
    }
}

#[turbo_tasks::value(transparent)]
pub struct Endpoints(Vec<ResolvedVc<Box<dyn Endpoint>>>);

#[turbo_tasks::function]
pub async fn endpoint_write_to_disk(
    endpoint: ResolvedVc<Box<dyn Endpoint>>,
) -> Result<Vc<EndpointOutputPaths>> {
    let output_op = output_assets_operation(endpoint);
    let EndpointOutput {
        project,
        output_paths,
        ..
    } = *output_op.connect().await?;

    project
        .emit_all_output_assets(endpoint_output_assets_operation(output_op))
        .as_side_effect()
        .await?;

    Ok(*output_paths)
}

#[turbo_tasks::function(operation)]
fn output_assets_operation(endpoint: ResolvedVc<Box<dyn Endpoint>>) -> Vc<EndpointOutput> {
    endpoint.output()
}

#[turbo_tasks::function(operation)]
async fn endpoint_output_assets_operation(
    output: OperationVc<EndpointOutput>,
) -> Result<Vc<OutputAssets>> {
    Ok(*output.connect().await?.output_assets)
}

#[turbo_tasks::function(operation)]
pub async fn endpoint_write_to_disk_operation(
    endpoint: OperationVc<OptionEndpoint>,
) -> Result<Vc<EndpointOutputPaths>> {
    Ok(if let Some(endpoint) = *endpoint.connect().await? {
        endpoint_write_to_disk(*endpoint)
    } else {
        EndpointOutputPaths::NotFound.cell()
    })
}

#[turbo_tasks::function(operation)]
pub async fn endpoint_server_changed_operation(
    endpoint: OperationVc<OptionEndpoint>,
) -> Result<Vc<Completion>> {
    Ok(if let Some(endpoint) = *endpoint.connect().await? {
        endpoint.server_changed()
    } else {
        Completion::new()
    })
}

#[turbo_tasks::function(operation)]
pub async fn endpoint_client_changed_operation(
    endpoint: OperationVc<OptionEndpoint>,
) -> Result<Vc<Completion>> {
    Ok(if let Some(endpoint) = *endpoint.connect().await? {
        endpoint.client_changed()
    } else {
        Completion::new()
    })
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub struct EndpointOutput {
    pub output_assets: ResolvedVc<OutputAssets>,
    pub output_paths: ResolvedVc<EndpointOutputPaths>,
    pub project: ResolvedVc<Project>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum EndpointOutputPaths {
    NodeJs {
        /// Relative to the root_path
        server_entry_path: RcStr,
        server_paths: Vec<ServerPath>,
        client_paths: Vec<RcStr>,
    },
    Edge {
        server_paths: Vec<ServerPath>,
        client_paths: Vec<RcStr>,
    },
    NotFound,
}

/// The routes as map from pathname to route. (pathname includes the leading
/// slash)
#[turbo_tasks::value(transparent)]
pub struct Routes(FxIndexMap<RcStr, Route>);
