use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, get_effects, trace::TraceRawVcs, CollectiblesSource, FxIndexMap,
    NonLocalValue, OperationVc, ResolvedVc, Vc,
};
use turbopack_core::{diagnostics::Diagnostic, issue::IssueDescriptionExt};

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
    pub pages_document_endpoint: OperationVc<Box<dyn Endpoint>>,
    pub pages_app_endpoint: OperationVc<Box<dyn Endpoint>>,
    pub pages_error_endpoint: OperationVc<Box<dyn Endpoint>>,
}

/// HACK: Wraps an `OperationVc<Entrypoints>` inside of a second `OperationVc`.
#[turbo_tasks::function(operation)]
fn entrypoints_wrapper(entrypoints: OperationVc<Entrypoints>) -> Vc<Entrypoints> {
    entrypoints.connect()
}

/// Removes diagnostics, issues, and effects from the top-level `entrypoints` operation so that
/// they're not duplicated across many different individual entrypoints or routes.
#[turbo_tasks::function(operation)]
async fn entrypoints_without_collectibles_operation(
    entrypoints: OperationVc<Entrypoints>,
) -> Result<Vc<Entrypoints>> {
    let entrypoints = entrypoints_wrapper(entrypoints);
    let _ = entrypoints.take_collectibles::<Box<dyn Diagnostic>>();
    let _ = entrypoints.take_issues_with_path().await?;
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

/// Given a resolved `Endpoint` and the `Entrypoints` operation that it comes from, connect the
/// operation and return a `OperationVc` of the `Entrypoint`. This `Endpoint` operation will keep
/// the entire `Entrypoints` operation alive.
#[turbo_tasks::function(operation)]
fn wrap(
    endpoint: ResolvedVc<Box<dyn Endpoint>>,
    op: OperationVc<Entrypoints>,
) -> Vc<Box<dyn Endpoint>> {
    let _ = op.connect();
    *endpoint
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct InstrumentationOperation {
    pub node_js: OperationVc<Box<dyn Endpoint>>,
    pub edge: OperationVc<Box<dyn Endpoint>>,
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
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
        original_name: RcStr,
        endpoint: OperationVc<Box<dyn Endpoint>>,
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
    pub html_endpoint: OperationVc<Box<dyn Endpoint>>,
    pub rsc_endpoint: OperationVc<Box<dyn Endpoint>>,
}
