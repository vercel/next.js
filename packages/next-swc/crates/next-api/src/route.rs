use indexmap::IndexMap;
use turbo_tasks::{Completion, Vc};

use crate::server_paths::ServerPath;

#[turbo_tasks::value(shared)]
#[derive(Copy, Clone, Debug)]
pub enum Route {
    Page {
        html_endpoint: Vc<Box<dyn Endpoint>>,
        data_endpoint: Vc<Box<dyn Endpoint>>,
    },
    PageApi {
        endpoint: Vc<Box<dyn Endpoint>>,
    },
    AppPage {
        html_endpoint: Vc<Box<dyn Endpoint>>,
        rsc_endpoint: Vc<Box<dyn Endpoint>>,
    },
    AppRoute {
        endpoint: Vc<Box<dyn Endpoint>>,
    },
    Conflict,
}

#[turbo_tasks::value_trait]
pub trait Endpoint {
    fn write_to_disk(self: Vc<Self>) -> Vc<WrittenEndpoint>;
    fn server_changed(self: Vc<Self>) -> Vc<Completion>;
    fn client_changed(self: Vc<Self>) -> Vc<Completion>;
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub enum WrittenEndpoint {
    NodeJs {
        /// Relative to the root_path
        server_entry_path: String,
        server_paths: Vec<ServerPath>,
    },
    Edge {
        server_paths: Vec<ServerPath>,
    },
}

/// The routes as map from pathname to route. (pathname includes the leading
/// slash)
#[turbo_tasks::value(transparent)]
pub struct Routes(IndexMap<String, Route>);
