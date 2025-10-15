use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    CollectiblesSource, FxIndexMap, NonLocalValue, OperationValue, OperationVc, ResolvedVc,
    TaskInput, Vc, debug::ValueDebugFormat, get_effects, trace::TraceRawVcs,
};
use turbopack_core::{diagnostics::Diagnostic, issue::CollectibleIssuesExt};

use crate::{
    entrypoints::Entrypoints,
    route::{Endpoint, Route},
};

/// Based on [`Entrypoints`], but with [`OperationVc<Endpoint>`][OperationVc] for every endpoint.
///
/// This is used when constructing `ExternalEndpoint`s in the `napi` crate.
///
/// This is important as `OperationVc`s can be stored in the VersionedContentMap and can be exposed
/// to JS via napi.
///
/// This is needed to call `write_to_disk` which expects an `OperationVc<Endpoint>`.
#[turbo_tasks::value(shared)]
pub struct EntrypointsOperation {
    pub routes: FxIndexMap<RcStr, RouteOperation>,
    pub middleware: Option<MiddlewareOperation>,
    pub instrumentation: Option<InstrumentationOperation>,
    pub pages_document_endpoint: OperationVc<OptionEndpoint>,
    pub pages_app_endpoint: OperationVc<OptionEndpoint>,
    pub pages_error_endpoint: OperationVc<OptionEndpoint>,
}

/// Removes diagnostics, issues, and effects from the top-level `entrypoints` operation so that
/// they're not duplicated across many different individual entrypoints or routes.
#[turbo_tasks::function(operation)]
async fn entrypoints_without_collectibles_operation(
    entrypoints: OperationVc<Entrypoints>,
) -> Result<Vc<Entrypoints>> {
    let _ = entrypoints.resolve_strongly_consistent().await?;
    entrypoints.drop_collectibles::<Box<dyn Diagnostic>>();
    entrypoints.drop_issues();
    let _ = get_effects(entrypoints).await?;
    Ok(entrypoints.connect())
}

#[turbo_tasks::value_impl]
impl EntrypointsOperation {
    #[turbo_tasks::function(operation)]
    pub async fn new(entrypoints: OperationVc<Entrypoints>) -> Result<Vc<Self>> {
        let e = entrypoints.connect().await?;
        let entrypoints = entrypoints_without_collectibles_operation(entrypoints);
        Ok(Self {
            routes: e
                .routes
                .iter()
                .map(|(k, v)| (k.clone(), pick_route(entrypoints, k.clone(), v)))
                .collect(),
            middleware: e.middleware.as_ref().map(|m| MiddlewareOperation {
                endpoint: pick_endpoint(entrypoints, EndpointSelector::Middleware),
                is_proxy: m.is_proxy,
            }),
            instrumentation: e
                .instrumentation
                .as_ref()
                .map(|_| InstrumentationOperation {
                    node_js: pick_endpoint(entrypoints, EndpointSelector::InstrumentationNodeJs),
                    edge: pick_endpoint(entrypoints, EndpointSelector::InstrumentationEdge),
                }),
            pages_document_endpoint: pick_endpoint(entrypoints, EndpointSelector::PagesDocument),
            pages_app_endpoint: pick_endpoint(entrypoints, EndpointSelector::PagesApp),
            pages_error_endpoint: pick_endpoint(entrypoints, EndpointSelector::PagesError),
        }
        .cell())
    }
}

fn pick_route(entrypoints: OperationVc<Entrypoints>, key: RcStr, route: &Route) -> RouteOperation {
    match route {
        Route::Page { .. } => RouteOperation::Page {
            html_endpoint: pick_endpoint(entrypoints, EndpointSelector::RoutePageHtml(key.clone())),
            data_endpoint: pick_endpoint(entrypoints, EndpointSelector::RoutePageData(key)),
        },
        Route::PageApi { .. } => RouteOperation::PageApi {
            endpoint: pick_endpoint(entrypoints, EndpointSelector::RoutePageApi(key)),
        },
        Route::AppPage(pages) => RouteOperation::AppPage(
            pages
                .iter()
                .enumerate()
                .map(|(i, p)| AppPageRouteOperation {
                    original_name: p.original_name.clone(),
                    html_endpoint: pick_endpoint(
                        entrypoints,
                        EndpointSelector::RouteAppPageHtml(key.clone(), i),
                    ),
                    rsc_endpoint: pick_endpoint(
                        entrypoints,
                        EndpointSelector::RouteAppPageRsc(key.clone(), i),
                    ),
                })
                .collect(),
        ),
        Route::AppRoute { original_name, .. } => RouteOperation::AppRoute {
            original_name: original_name.clone(),
            endpoint: pick_endpoint(entrypoints, EndpointSelector::RouteAppRoute(key)),
        },
        Route::Conflict => RouteOperation::Conflict,
    }
}

#[derive(
    Debug,
    Clone,
    TaskInput,
    Serialize,
    Deserialize,
    TraceRawVcs,
    PartialEq,
    Eq,
    Hash,
    ValueDebugFormat,
    NonLocalValue,
    OperationValue,
)]
enum EndpointSelector {
    RoutePageHtml(RcStr),
    RoutePageData(RcStr),
    RoutePageApi(RcStr),
    RouteAppPageHtml(RcStr, usize),
    RouteAppPageRsc(RcStr, usize),
    RouteAppRoute(RcStr),
    InstrumentationNodeJs,
    InstrumentationEdge,
    Middleware,
    PagesDocument,
    PagesApp,
    PagesError,
}

#[turbo_tasks::value(transparent)]
pub struct OptionEndpoint(Option<ResolvedVc<Box<dyn Endpoint>>>);

/// Given a selector and the `Entrypoints` operation that it comes from, connect the operation and
/// return an `OperationVc` containing the selected value. The returned operation will keep the
/// entire `Entrypoints` operation alive.
#[turbo_tasks::function(operation)]
async fn pick_endpoint(
    op: OperationVc<Entrypoints>,
    selector: EndpointSelector,
) -> Result<Vc<OptionEndpoint>> {
    let endpoints = op.connect().strongly_consistent().await?;
    let endpoint = match selector {
        EndpointSelector::InstrumentationNodeJs => {
            endpoints.instrumentation.as_ref().map(|i| i.node_js)
        }
        EndpointSelector::InstrumentationEdge => endpoints.instrumentation.as_ref().map(|i| i.edge),
        EndpointSelector::Middleware => endpoints.middleware.as_ref().map(|m| m.endpoint),
        EndpointSelector::PagesDocument => Some(endpoints.pages_document_endpoint),
        EndpointSelector::PagesApp => Some(endpoints.pages_app_endpoint),
        EndpointSelector::PagesError => Some(endpoints.pages_error_endpoint),
        EndpointSelector::RoutePageHtml(name) => {
            if let Some(Route::Page { html_endpoint, .. }) = endpoints.routes.get(&name) {
                Some(*html_endpoint)
            } else {
                None
            }
        }
        EndpointSelector::RoutePageData(name) => {
            if let Some(Route::Page { data_endpoint, .. }) = endpoints.routes.get(&name) {
                *data_endpoint
            } else {
                None
            }
        }
        EndpointSelector::RoutePageApi(name) => {
            if let Some(Route::PageApi { endpoint }) = endpoints.routes.get(&name) {
                Some(*endpoint)
            } else {
                None
            }
        }
        EndpointSelector::RouteAppPageHtml(name, i) => {
            if let Some(Route::AppPage(pages)) = endpoints.routes.get(&name) {
                pages.get(i).as_ref().map(|p| p.html_endpoint)
            } else {
                None
            }
        }
        EndpointSelector::RouteAppPageRsc(name, i) => {
            if let Some(Route::AppPage(pages)) = endpoints.routes.get(&name) {
                pages.get(i).as_ref().map(|p| p.rsc_endpoint)
            } else {
                None
            }
        }
        EndpointSelector::RouteAppRoute(name) => {
            if let Some(Route::AppRoute { endpoint, .. }) = endpoints.routes.get(&name) {
                Some(*endpoint)
            } else {
                None
            }
        }
    };
    Ok(Vc::cell(endpoint))
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct InstrumentationOperation {
    pub node_js: OperationVc<OptionEndpoint>,
    pub edge: OperationVc<OptionEndpoint>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct MiddlewareOperation {
    pub endpoint: OperationVc<OptionEndpoint>,
    pub is_proxy: bool,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub enum RouteOperation {
    Page {
        html_endpoint: OperationVc<OptionEndpoint>,
        data_endpoint: OperationVc<OptionEndpoint>,
    },
    PageApi {
        endpoint: OperationVc<OptionEndpoint>,
    },
    AppPage(Vec<AppPageRouteOperation>),
    AppRoute {
        original_name: RcStr,
        endpoint: OperationVc<OptionEndpoint>,
    },
    Conflict,
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
pub struct AppPageRouteOperation {
    pub original_name: RcStr,
    pub html_endpoint: OperationVc<OptionEndpoint>,
    pub rsc_endpoint: OperationVc<OptionEndpoint>,
}
