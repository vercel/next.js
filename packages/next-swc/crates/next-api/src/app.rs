use next_core::app_structure::Entrypoint;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, CompletionVc};

use crate::route::{Endpoint, EndpointVc, Route, RouteVc, WrittenEndpointVc};

#[turbo_tasks::function]
pub async fn app_entry_point_to_route(entrypoint: Entrypoint) -> RouteVc {
    match entrypoint {
        Entrypoint::AppPage { .. } => Route::AppPage {
            html_endpoint: AppPageEndpoint {
                ty: AppPageEndpointType::Html,
            }
            .cell()
            .into(),
            rsc_endpoint: AppPageEndpoint {
                ty: AppPageEndpointType::Rsc,
            }
            .cell()
            .into(),
        },
        Entrypoint::AppRoute { .. } => Route::AppRoute {
            endpoint: AppRouteEndpoint.cell().into(),
        },
    }
    .cell()
}

#[derive(Copy, Clone, Serialize, Deserialize, PartialEq, Eq, Debug, TraceRawVcs)]
enum AppPageEndpointType {
    Html,
    Rsc,
}

#[turbo_tasks::value]
struct AppPageEndpoint {
    ty: AppPageEndpointType,
}

#[turbo_tasks::value_impl]
impl Endpoint for AppPageEndpoint {
    #[turbo_tasks::function]
    fn write_to_disk(&self) -> WrittenEndpointVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn changed(&self) -> CompletionVc {
        todo!()
    }
}

#[turbo_tasks::value]
struct AppRouteEndpoint;

#[turbo_tasks::value_impl]
impl Endpoint for AppRouteEndpoint {
    #[turbo_tasks::function]
    fn write_to_disk(&self) -> WrittenEndpointVc {
        todo!()
    }

    #[turbo_tasks::function]
    fn changed(&self) -> CompletionVc {
        todo!()
    }
}
