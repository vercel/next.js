use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, Completion, Vc};

use crate::paths::ServerPath;

#[derive(TraceRawVcs, Serialize, Deserialize, PartialEq, Eq, ValueDebugFormat, Clone, Debug)]
pub struct AppPageRoute {
    pub original_name: String,
    pub html_endpoint: Vc<Box<dyn Endpoint>>,
    pub rsc_endpoint: Vc<Box<dyn Endpoint>>,
}

impl AppPageRoute {
    async fn resolve(&mut self) -> Result<()> {
        let Self {
            html_endpoint,
            rsc_endpoint,
            ..
        } = self;
        *html_endpoint = html_endpoint.resolve().await?;
        *rsc_endpoint = rsc_endpoint.resolve().await?;
        Ok(())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum Route {
    Page {
        html_endpoint: Vc<Box<dyn Endpoint>>,
        data_endpoint: Vc<Box<dyn Endpoint>>,
    },
    PageApi {
        endpoint: Vc<Box<dyn Endpoint>>,
    },
    AppPage(Vec<AppPageRoute>),
    AppRoute {
        original_name: String,
        endpoint: Vc<Box<dyn Endpoint>>,
    },
    Conflict,
}

impl Route {
    pub async fn resolve(&mut self) -> Result<()> {
        match self {
            Route::Page {
                html_endpoint,
                data_endpoint,
            } => {
                *html_endpoint = html_endpoint.resolve().await?;
                *data_endpoint = data_endpoint.resolve().await?;
            }
            Route::PageApi { endpoint } => {
                *endpoint = endpoint.resolve().await?;
            }
            Route::AppPage(routes) => {
                for route in routes {
                    route.resolve().await?;
                }
            }
            Route::AppRoute { endpoint, .. } => {
                *endpoint = endpoint.resolve().await?;
            }
            Route::Conflict => {}
        }
        Ok(())
    }
}

#[turbo_tasks::value_trait]
pub trait Endpoint {
    fn write_to_disk(self: Vc<Self>) -> Vc<WrittenEndpoint>;
    fn server_changed(self: Vc<Self>) -> Vc<Completion>;
    fn client_changed(self: Vc<Self>) -> Vc<Completion>;
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Clone)]
pub enum WrittenEndpoint {
    NodeJs {
        /// Relative to the root_path
        server_entry_path: String,
        server_paths: Vec<ServerPath>,
        client_paths: Vec<String>,
    },
    Edge {
        server_paths: Vec<ServerPath>,
        client_paths: Vec<String>,
    },
}

/// The routes as map from pathname to route. (pathname includes the leading
/// slash)
#[turbo_tasks::value(transparent)]
pub struct Routes(IndexMap<String, Route>);
