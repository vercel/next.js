use std::collections::{HashMap, HashSet};

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    RcStr, ValueToString, Vc,
};
use turbopack_binding::{
    turbo::tasks_hash::hash_xxh3_hash64,
    turbopack::core::{
        changed::get_referenced_modules,
        chunk::{
            global_information::{GlobalInformation, OptionGlobalInformation},
            ModuleId,
        },
        ident::AssetIdent,
        module::Module,
    },
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

async fn process_module(
    module: Vc<Box<dyn Module>>,
    id_map: &mut HashMap<AssetIdent, ModuleId>,
    used_ids: &mut HashSet<u64>,
) -> Result<()> {
    let ident = module.ident();

    let hash = hash_xxh3_hash64(ident.to_string().await?);
    let mut masked_hash = hash & 0xF;
    let mut mask = 0xF;
    while used_ids.contains(&masked_hash) {
        if mask == 0xFFFFFFFFFFFFFFFF {
            return Err(anyhow::anyhow!("This is a... 64-bit hash collision?"));
        }
        mask = (mask << 4) | 0xF;
        masked_hash = hash & mask;
    }

    let hashed_module_id = ModuleId::String(masked_hash.to_string().into());

    dbg!(
        "process_module",
        ident.await?.clone_value(),
        &hashed_module_id,
        mask
    );

    id_map.insert(ident.await?.clone_value(), hashed_module_id);
    used_ids.insert(masked_hash);

    Ok(())
}

async fn build_module_id_map(project: Vc<Project>) -> Result<HashMap<AssetIdent, ModuleId>> {
    let mut module_id_map: HashMap<AssetIdent, ModuleId> = HashMap::new();
    let mut used_ids: HashSet<u64> = HashSet::new();

    let entrypoints = project.entrypoints().await?;
    let mut root_modules = vec![
        entrypoints.pages_error_endpoint.root_module(),
        entrypoints.pages_app_endpoint.root_module(),
        entrypoints.pages_document_endpoint.root_module(),
    ];

    for (_, route) in entrypoints.routes.iter() {
        match route {
            Route::Page {
                html_endpoint,
                data_endpoint: _,
            } => {
                root_modules.push(html_endpoint.root_module());
            }
            Route::PageApi { ref endpoint } => {
                root_modules.push(endpoint.root_module());
            }
            Route::AppPage(routes) => {
                for route in routes {
                    root_modules.push(route.html_endpoint.root_module());
                }
            }
            Route::AppRoute {
                original_name: _,
                endpoint,
            } => {
                root_modules.push(endpoint.root_module());
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
