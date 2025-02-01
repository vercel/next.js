use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, FxIndexMap, NonLocalValue,
    OperationVc, ResolvedVc, Vc,
};
use turbopack_core::{module::Modules, module_graph::ModuleGraph, output::OutputAssets};

use crate::{paths::ServerPath, project::Project};

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
        data_endpoint: ResolvedVc<Box<dyn Endpoint>>,
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
    fn output(self: Vc<Self>) -> Vc<EndpointOutput>;
    // fn write_to_disk(self: Vc<Self>) -> Vc<EndpointOutputPaths>;
    fn server_changed(self: Vc<Self>) -> Vc<Completion>;
    fn client_changed(self: Vc<Self>) -> Vc<Completion>;
    /// The entry modules for the modules graph.
    fn root_modules(self: Vc<Self>) -> Vc<Modules>;
    /// Additional entry modules for the module graph.
    /// This may read the module graph and return additional modules.
    fn additional_root_modules(self: Vc<Self>, _graph: Vc<ModuleGraph>) -> Vc<Modules> {
        Modules::empty()
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

    let _ = project
        .emit_all_output_assets(endpoint_output_assets_operation(output_op))
        .resolve()
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
pub fn endpoint_write_to_disk_operation(
    endpoint: OperationVc<Box<dyn Endpoint>>,
) -> Vc<EndpointOutputPaths> {
    endpoint_write_to_disk(endpoint.connect())
}

#[turbo_tasks::function(operation)]
pub fn endpoint_server_changed_operation(
    endpoint: OperationVc<Box<dyn Endpoint>>,
) -> Vc<Completion> {
    endpoint.connect().server_changed()
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
        server_entry_path: String,
        server_paths: Vec<ServerPath>,
        client_paths: Vec<RcStr>,
    },
    Edge {
        server_paths: Vec<ServerPath>,
        client_paths: Vec<RcStr>,
    },
}

/// The routes as map from pathname to route. (pathname includes the leading
/// slash)
#[turbo_tasks::value(transparent)]
pub struct Routes(FxIndexMap<RcStr, Route>);
