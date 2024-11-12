use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, OperationVc, RcStr, Vc};

use crate::{
    entrypoints::Entrypoints,
    route::{Endpoint, Route},
};

/// A derived type of Entrypoints, but with OperationVc<Endpoint> for every endpoint.
///
/// This is needed to call `write_to_disk` which expects an `OperationVc<Endpoint>`.
/// This is important as OperationVcs can be stored in the VersionedContentMap and can be exposed to
/// JS via napi.
#[turbo_tasks::value(shared)]
pub struct EntrypointsOperation {
    pub routes: IndexMap<RcStr, RouteOperation>,
    pub middleware: Option<MiddlewareOperation>,
    pub instrumentation: Option<InstrumentationOperation>,
    pub pages_document_endpoint: OperationVc<Box<dyn Endpoint>>,
    pub pages_app_endpoint: OperationVc<Box<dyn Endpoint>>,
    pub pages_error_endpoint: OperationVc<Box<dyn Endpoint>>,
}

#[turbo_tasks::value_impl]
impl EntrypointsOperation {
    #[turbo_tasks::function]
    pub async fn new(entrypoints: OperationVc<Entrypoints>) -> Result<Vc<Self>> {
        let e = entrypoints.connect().await?;
        Ok(Self {
            routes: e
                .routes
                .iter()
                .map(|(k, v)| (k.clone(), wrap_route(v, entrypoints)))
                .collect(),
            middleware: e.middleware.as_ref().map(|m| MiddlewareOperation {
                endpoint: wrap(m.endpoint, entrypoints),
            }),
            instrumentation: e
                .instrumentation
                .as_ref()
                .map(|i| InstrumentationOperation {
                    node_js: wrap(i.node_js, entrypoints),
                    edge: wrap(i.edge, entrypoints),
                }),
            pages_document_endpoint: wrap(e.pages_document_endpoint, entrypoints),
            pages_app_endpoint: wrap(e.pages_app_endpoint, entrypoints),
            pages_error_endpoint: wrap(e.pages_error_endpoint, entrypoints),
        }
        .cell())
    }
}

fn wrap_route(route: &Route, entrypoints: OperationVc<Entrypoints>) -> RouteOperation {
    match route {
        Route::Page {
            html_endpoint,
            data_endpoint,
        } => RouteOperation::Page {
            html_endpoint: wrap(*html_endpoint, entrypoints),
            data_endpoint: wrap(*data_endpoint, entrypoints),
        },
        Route::PageApi { endpoint } => RouteOperation::PageApi {
            endpoint: wrap(*endpoint, entrypoints),
        },
        Route::AppPage(pages) => RouteOperation::AppPage(
            pages
                .iter()
                .map(|p| AppPageRouteOperation {
                    original_name: p.original_name.clone(),
                    html_endpoint: wrap(p.html_endpoint, entrypoints),
                    rsc_endpoint: wrap(p.rsc_endpoint, entrypoints),
                })
                .collect(),
        ),
        Route::AppRoute {
            original_name,
            endpoint,
        } => RouteOperation::AppRoute {
            original_name: original_name.clone(),
            endpoint: wrap(*endpoint, entrypoints),
        },
        Route::Conflict => RouteOperation::Conflict,
    }
}

#[turbo_tasks::function]
fn wrap_endpoint(
    endpoint: Vc<Box<dyn Endpoint>>,
    op: OperationVc<Entrypoints>,
) -> Vc<Box<dyn Endpoint>> {
    let _ = op.connect();
    endpoint
}

fn wrap(
    endpoint: Vc<Box<dyn Endpoint>>,
    op: OperationVc<Entrypoints>,
) -> OperationVc<Box<dyn Endpoint>> {
    OperationVc::new(wrap_endpoint(endpoint, op))
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat)]
pub struct InstrumentationOperation {
    pub node_js: OperationVc<Box<dyn Endpoint>>,
    pub edge: OperationVc<Box<dyn Endpoint>>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat)]
pub struct MiddlewareOperation {
    pub endpoint: OperationVc<Box<dyn Endpoint>>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum RouteOperation {
    Page {
        html_endpoint: OperationVc<Box<dyn Endpoint>>,
        data_endpoint: OperationVc<Box<dyn Endpoint>>,
    },
    PageApi {
        endpoint: OperationVc<Box<dyn Endpoint>>,
    },
    AppPage(Vec<AppPageRouteOperation>),
    AppRoute {
        original_name: String,
        endpoint: OperationVc<Box<dyn Endpoint>>,
    },
    Conflict,
}

#[derive(TraceRawVcs, Serialize, Deserialize, PartialEq, Eq, ValueDebugFormat, Clone, Debug)]
pub struct AppPageRouteOperation {
    pub original_name: String,
    pub html_endpoint: OperationVc<Box<dyn Endpoint>>,
    pub rsc_endpoint: OperationVc<Box<dyn Endpoint>>,
}
