use std::fmt::Display;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Completion, FxIndexMap, FxIndexSet, NonLocalValue, OperationVc, ResolvedVc, TryFlatJoinIterExt,
    TryJoinIterExt, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbopack_core::{
    module_graph::{GraphEntries, ModuleGraph},
    output::{OptionOutputAsset, OutputAssets},
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

#[turbo_tasks::value(transparent)]
pub struct ModuleGraphs(Vec<ResolvedVc<ModuleGraph>>);

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
    #[turbo_tasks::function]
    fn module_graphs(self: Vc<Self>) -> Vc<ModuleGraphs>;
    #[turbo_tasks::function]
    fn polyfill_asset(self: Vc<Self>) -> Vc<OptionOutputAsset> {
        Vc::cell(None)
    }
}

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
pub enum EndpointGroupKey {
    Instrumentation,
    InstrumentationEdge,
    Middleware,
    PagesError,
    PagesApp,
    PagesDocument,
    Route(RcStr),
}

impl Display for EndpointGroupKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EndpointGroupKey::Instrumentation => write!(f, "instrumentation"),
            EndpointGroupKey::InstrumentationEdge => write!(f, "instrumentation-edge"),
            EndpointGroupKey::Middleware => write!(f, "middleware"),
            EndpointGroupKey::PagesError => write!(f, "_error"),
            EndpointGroupKey::PagesApp => write!(f, "_app"),
            EndpointGroupKey::PagesDocument => write!(f, "_document"),
            EndpointGroupKey::Route(route) => write!(f, "/{}", route),
        }
    }
}

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
pub struct EndpointGroup {
    pub primary: Vec<ResolvedVc<Box<dyn Endpoint>>>,
    pub additional: Vec<ResolvedVc<Box<dyn Endpoint>>>,
}

impl EndpointGroup {
    pub fn from(endpoint: ResolvedVc<Box<dyn Endpoint>>) -> Self {
        Self {
            primary: vec![endpoint],
            additional: vec![],
        }
    }

    pub fn output_assets(&self) -> Vc<OutputAssets> {
        output_of_endpoints(self.primary.iter().map(|endpoint| **endpoint).collect())
    }

    pub fn module_graphs(&self) -> Vc<ModuleGraphs> {
        module_graphs_of_endpoints(self.primary.iter().map(|endpoint| **endpoint).collect())
    }
}

#[turbo_tasks::function]
async fn output_of_endpoints(endpoints: Vec<Vc<Box<dyn Endpoint>>>) -> Result<Vc<OutputAssets>> {
    let assets = endpoints
        .iter()
        .map(async |endpoint| Ok(*endpoint.output().await?.output_assets))
        .try_join()
        .await?;
    Ok(OutputAssets::concat(assets))
}

#[turbo_tasks::function]
async fn module_graphs_of_endpoints(
    endpoints: Vec<Vc<Box<dyn Endpoint>>>,
) -> Result<Vc<ModuleGraphs>> {
    let module_graphs = endpoints
        .iter()
        .map(async |endpoint| Ok(endpoint.module_graphs().await?.into_iter()))
        .try_flat_join()
        .await?
        .into_iter()
        .copied()
        .collect::<FxIndexSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    Ok(Vc::cell(module_graphs))
}

#[turbo_tasks::value(transparent)]
pub struct EndpointGroups(Vec<(EndpointGroupKey, EndpointGroup)>);

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
