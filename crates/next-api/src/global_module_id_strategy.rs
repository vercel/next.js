use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::chunk::module_id_strategies::{GlobalModuleIdStrategy, ModuleIdStrategy};
use turbopack_ecmascript::global_module_id_strategy::{
    children_modules_idents, merge_preprocessed_module_ids, PreprocessedChildrenIdents,
};

use crate::{
    project::Project,
    route::{Endpoint, Route},
};

#[turbo_tasks::value]
pub struct GlobalModuleIdStrategyBuilder;

// NOTE(LichuAcu) To access all entrypoints, we need to access an instance of `Project`, but
// `Project` is not available in `turbopack-core`, so we need need this
// `GlobalModuleIdStrategyBuilder` in `next-api`.
#[turbo_tasks::value_impl]
impl GlobalModuleIdStrategyBuilder {
    #[turbo_tasks::function]
    pub async fn build(project: Vc<Project>) -> Result<Vc<Box<dyn ModuleIdStrategy>>> {
        let mut preprocessed_module_ids = Vec::new();

        preprocessed_module_ids.push(children_modules_idents(project.client_main_modules()));

        let entrypoints = project.entrypoints().await?;

        preprocessed_module_ids.push(preprocess_module_ids(*entrypoints.pages_error_endpoint));
        preprocessed_module_ids.push(preprocess_module_ids(*entrypoints.pages_app_endpoint));
        preprocessed_module_ids.push(preprocess_module_ids(*entrypoints.pages_document_endpoint));

        if let Some(middleware) = &entrypoints.middleware {
            preprocessed_module_ids.push(preprocess_module_ids(middleware.endpoint));
        }

        if let Some(instrumentation) = &entrypoints.instrumentation {
            let node_js = instrumentation.node_js;
            let edge = instrumentation.edge;
            preprocessed_module_ids.push(preprocess_module_ids(node_js));
            preprocessed_module_ids.push(preprocess_module_ids(edge));
        }

        for (_, route) in entrypoints.routes.iter() {
            match route {
                Route::Page {
                    html_endpoint,
                    data_endpoint,
                } => {
                    preprocessed_module_ids.push(preprocess_module_ids(**html_endpoint));
                    preprocessed_module_ids.push(preprocess_module_ids(**data_endpoint));
                }
                Route::PageApi { endpoint } => {
                    preprocessed_module_ids.push(preprocess_module_ids(**endpoint));
                }
                Route::AppPage(page_routes) => {
                    for page_route in page_routes {
                        preprocessed_module_ids
                            .push(preprocess_module_ids(page_route.html_endpoint));
                        preprocessed_module_ids
                            .push(preprocess_module_ids(page_route.rsc_endpoint));
                    }
                }
                Route::AppRoute {
                    original_name: _,
                    endpoint,
                } => {
                    preprocessed_module_ids.push(preprocess_module_ids(**endpoint));
                }
                Route::Conflict => {
                    tracing::info!("WARN: conflict");
                }
            }
        }

        let module_id_map = merge_preprocessed_module_ids(preprocessed_module_ids).await?;

        Ok(Vc::upcast(
            GlobalModuleIdStrategy::new(module_id_map).await?,
        ))
    }
}

// NOTE(LichuAcu) We can't move this function to `turbopack-core` because we need access to
// `Endpoint`, which is not available there.
#[turbo_tasks::function]
fn preprocess_module_ids(endpoint: Vc<Box<dyn Endpoint>>) -> Vc<PreprocessedChildrenIdents> {
    let root_modules = endpoint.root_modules();
    children_modules_idents(root_modules)
}
