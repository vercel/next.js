use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::CompletionVc;

#[turbo_tasks::value(shared)]
#[derive(Copy, Clone, Debug)]
pub enum Route {
    Page {
        html_endpoint: EndpointVc,
        data_endpoint: EndpointVc,
    },
    PageApi {
        endpoint: EndpointVc,
    },
    AppPage {
        html_endpoint: EndpointVc,
        rsc_endpoint: EndpointVc,
    },
    AppRoute {
        endpoint: EndpointVc,
    },
    Conflict,
}

#[turbo_tasks::value_trait]
pub trait Endpoint {
    fn write_to_disk(&self) -> WrittenEndpointVc;
    fn changed(&self) -> CompletionVc;
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
