use std::collections::{HashMap, HashSet};

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    Vc,
};
use turbopack_core::{
    changed::get_referenced_modules,
    chunk::{
        global_information::{process_module, GlobalInformation, OptionGlobalInformation},
        ModuleId,
    },
    ident::AssetIdent,
    module::Module,
};

use crate::{
    project::Project,
    route::{Endpoint, Route},
};

#[turbo_tasks::function]
pub async fn build_global_information(project: Vc<Project>) -> Result<Vc<OptionGlobalInformation>> {
    let global_information = GlobalInformation {
        module_id_map: build_module_id_map(project).await?,
    };
    Ok(Vc::cell(Some(global_information)))
}

async fn build_module_id_map(project: Vc<Project>) -> Result<HashMap<AssetIdent, ModuleId>> {
    let mut module_id_map: HashMap<AssetIdent, ModuleId> = HashMap::new();
    let mut used_ids: HashSet<u64> = HashSet::new();

    let entrypoints = project.entrypoints().await?;
    let mut root_modules: Vec<Vc<Box<dyn Module>>> = Vec::new();
    root_modules.extend(entrypoints.pages_error_endpoint.root_modules().await?);
    root_modules.extend(entrypoints.pages_app_endpoint.root_modules().await?);
    root_modules.extend(entrypoints.pages_document_endpoint.root_modules().await?);

    for (_, route) in entrypoints.routes.iter() {
        match route {
            Route::Page {
                html_endpoint,
                data_endpoint: _,
            } => {
                root_modules.extend(html_endpoint.root_modules().await?);
            }
            Route::PageApi { ref endpoint } => {
                root_modules.extend(endpoint.root_modules().await?);
            }
            Route::AppPage(routes) => {
                for route in routes {
                    root_modules.extend(route.html_endpoint.root_modules().await?);
                }
            }
            Route::AppRoute {
                original_name: _,
                endpoint,
            } => {
                root_modules.extend(endpoint.root_modules().await?);
            }
            Route::Conflict => {
                tracing::info!("WARN: conflict");
            }
        }
    }

    let modules_iter = AdjacencyMap::new()
        .skip_duplicates()
        .visit(root_modules.iter().copied(), get_referenced_modules)
        .await
        .completed()?
        .into_inner()
        .into_reverse_topological();

    for module in modules_iter {
        process_module(module, &mut module_id_map, &mut used_ids).await?;
    }

    Ok(module_id_map)
}
