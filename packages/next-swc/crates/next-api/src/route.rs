use indexmap::IndexMap;
use turbo_tasks::{Completion, Vc};

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
    fn changed(self: Vc<Self>) -> Vc<Completion>;
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct WrittenEndpoint {
    /// Relative to the root_path
    pub server_entry_path: String,
    /// Relative to the root_path
    pub server_paths: Vec<String>,
}

/// The routes as map from pathname to route. (pathname includes the leading
/// slash)
#[turbo_tasks::value(transparent)]
pub struct Routes(IndexMap<String, Route>);
