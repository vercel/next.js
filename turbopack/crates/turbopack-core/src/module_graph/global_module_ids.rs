use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;

use crate::{
    chunk::{module_id_strategies::GlobalModuleIdStrategy, ChunkingType, ModuleId},
    module::Module,
    module_graph::ModuleGraph,
};

// this has to be idential to the modifier used in turbopack-ecmascript/src/async_chunk/module.rs
#[turbo_tasks::function]
pub fn async_loader_modifier() -> Vc<RcStr> {
    Vc::cell("async loader".into())
}

#[turbo_tasks::function]
pub async fn get_global_module_id_strategy(
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<GlobalModuleIdStrategy>> {
    let module_graph = module_graph.await?;
    let mut idents = module_graph
        .get_graphs()
        .await?
        .iter()
        .flat_map(|graph| graph.iter_nodes())
        .map(|m| m.module.ident())
        .collect::<Vec<_>>();

    // Additionally, add all the modules that are inserted by chunking (i.e. async loaders)
    module_graph
        .traverse_all_edges_unordered(|parent, current| {
            if let (_, &ChunkingType::Async) = parent {
                idents.push(
                    current
                        .module
                        .ident()
                        .with_modifier(async_loader_modifier()),
                );
            }
        })
        .await?;

    let module_id_map = idents
        .into_iter()
        .map(|ident| ident.to_string())
        .try_join()
        .await?
        .iter()
        .map(|module_ident| {
            let ident_str = module_ident.clone_value();
            let hash = hash_xxh3_hash64(&ident_str);
            (ident_str, hash)
        })
        .collect();

    let module_id_map = merge_preprocessed_module_ids(&module_id_map).await?;

    GlobalModuleIdStrategy::new(module_id_map).await
}

const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

pub async fn merge_preprocessed_module_ids(
    merged_module_ids: &FxIndexMap<RcStr, u64>,
) -> Result<FxIndexMap<RcStr, ModuleId>> {
    // 5% fill rate, as done in Webpack
    // https://github.com/webpack/webpack/blob/27cf3e59f5f289dfc4d76b7a1df2edbc4e651589/lib/ids/IdHelpers.js#L366-L405
    let optimal_range = merged_module_ids.len() * 20;
    let digit_mask = std::cmp::min(
        10u64.pow((optimal_range as f64).log10().ceil() as u32),
        JS_MAX_SAFE_INTEGER,
    );

    let mut module_id_map = FxIndexMap::default();
    let mut used_ids = FxIndexSet::default();

    for (module_ident, full_hash) in merged_module_ids.iter() {
        let mut trimmed_hash = full_hash % digit_mask;
        let mut i = 1;
        while used_ids.contains(&trimmed_hash) {
            // If the id is already used, seek to find another available id.
            trimmed_hash = hash_xxh3_hash64(full_hash + i) % digit_mask;
            i += 1;
        }
        used_ids.insert(trimmed_hash);
        module_id_map.insert(module_ident.clone(), ModuleId::Number(trimmed_hash));
    }

    Ok(module_id_map)
}
