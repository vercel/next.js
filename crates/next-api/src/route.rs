use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, Completion, FxIndexMap, ResolvedVc, Vc,
};
use turbopack_core::module::Modules;

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

#[turbo_tasks::value(shared, local)]
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
        original_name: String,
        endpoint: ResolvedVc<Box<dyn Endpoint>>,
    },
    Conflict,
}

impl Route {
    pub async fn resolve(&mut self) -> Result<()> {
        if let Route::AppPage(routes) = self {
            for route in routes {
                route.resolve().await?;
            }
        }

        Ok(())
    }
}

#[turbo_tasks::value_trait(local)]
pub trait Endpoint {
    fn write_to_disk(self: Vc<Self>) -> Vc<WrittenEndpoint>;
    fn server_changed(self: Vc<Self>) -> Vc<Completion>;
    fn client_changed(self: Vc<Self>) -> Vc<Completion>;
    fn root_modules(self: Vc<Self>) -> Vc<Modules>;
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
#[turbo_tasks::value(transparent, local)]
pub struct Routes(FxIndexMap<RcStr, Route>);
