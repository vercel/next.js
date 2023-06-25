use next_core::app_structure::Entrypoint;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Completion, Vc};

use crate::route::{Endpoint, Route, WrittenEndpoint};

#[turbo_tasks::function]
pub async fn app_entry_point_to_route(entrypoint: Entrypoint) -> Vc<Route> {
    match entrypoint {
        Entrypoint::AppPage { .. } => Route::AppPage {
            html_endpoint: Vc::upcast(
                AppPageEndpoint {
                    ty: AppPageEndpointType::Html,
                }
                .cell(),
            ),
            rsc_endpoint: Vc::upcast(
                AppPageEndpoint {
                    ty: AppPageEndpointType::Rsc,
                }
                .cell(),
            ),
        },
        Entrypoint::AppRoute { .. } => Route::AppRoute {
            endpoint: Vc::upcast(AppRouteEndpoint.cell()),
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
    fn write_to_disk(&self) -> Vc<WrittenEndpoint> {
        todo!()
    }

    #[turbo_tasks::function]
    fn changed(&self) -> Vc<Completion> {
        todo!()
    }
}

#[turbo_tasks::value]
struct AppRouteEndpoint;

#[turbo_tasks::value_impl]
impl Endpoint for AppRouteEndpoint {
    #[turbo_tasks::function]
    fn write_to_disk(&self) -> Vc<WrittenEndpoint> {
        todo!()
    }

    #[turbo_tasks::function]
    fn changed(&self) -> Vc<Completion> {
        todo!()
    }
}
