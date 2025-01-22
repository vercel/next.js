use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, FxIndexMap, NonLocalValue,
    OperationVc, ResolvedVc, Vc,
};
use turbopack_core::{module::Modules, module_graph::ModuleGraph};

use crate::paths::ServerPath;

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
    fn write_to_disk(self: Vc<Self>) -> Vc<WrittenEndpoint>;
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

#[turbo_tasks::function(operation)]
pub fn endpoint_write_to_disk_operation(
    endpoint: OperationVc<Box<dyn Endpoint>>,
) -> Vc<WrittenEndpoint> {
    endpoint.connect().write_to_disk()
}

#[turbo_tasks::function(operation)]
pub fn endpoint_server_changed_operation(
    endpoint: OperationVc<Box<dyn Endpoint>>,
) -> Vc<Completion> {
    endpoint.connect().server_changed()
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum WrittenEndpoint {
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
