use std::{collections::HashSet, hash::BuildHasherDefault};

use anyhow::{Context, Result};
use rustc_hash::FxHasher;
use tracing::Instrument;
use turbo_tasks::{FxIndexMap, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{module_id_strategies::GlobalModuleIdStrategy, ChunkableModule, ChunkingType},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
};
use turbopack_ecmascript::async_chunk::module::AsyncLoaderModule;

#[turbo_tasks::function]
pub async fn get_global_module_id_strategy(
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<GlobalModuleIdStrategy>> {
    let span = tracing::info_span!("compute module id map");
    async move {
        let module_graph = module_graph.await?;
        let graphs = module_graph.graphs.iter().try_join().await?;

        // All modules in the graph
        let module_idents = graphs
            .iter()
            .flat_map(|graph| graph.iter_nodes())
            .map(|m| m.module.ident());

        // And additionally, all the modules that are inserted by chunking (i.e. async loaders)
        let mut async_idents = vec![];
        module_graph
            .traverse_all_edges_unordered(|parent, current| {
                if let (_, &ChunkingType::Async) = parent {
                    let module =
                        ResolvedVc::try_sidecast_sync::<Box<dyn ChunkableModule>>(current.module)
                            .context("expected chunkable module for async reference")?;
                    async_idents.push(AsyncLoaderModule::asset_ident_for(*module));
                }
                Ok(())
            })
            .await?;

        // {
        //     let mut x = FxIndexMap::default();
        //     for module in module_idents.iter() {
        //         let ident = module.ident().to_resolved().await?;
        //         let ident_str = ident.to_string().await?;
        //         if let Some((module2, ident2)) = x.get(&ident_str) {
        //             let module_ref =
        //                 ResolvedVc::try_downcast_type_sync::<EcmascriptModuleAsset>(*module)
        //                     .unwrap()
        //                     .await?;
        //             let module2_ref =
        //                 ResolvedVc::try_downcast_type_sync::<EcmascriptModuleAsset>(*module2)
        //                     .unwrap()
        //                     .await?;
        //             println!(
        //                 "Duplicate module id: {:?}\n{:?} {:?} {:#?}\n{:?} {:?} {:#?}",
        //                 ident_str, module, ident, module_ref, module2, ident2, module2_ref
        //             );
        //         }
        //         x.insert(ident_str, (*module, ident));
        //     }
        // }

        let mut module_id_map = module_idents
            .chain(async_idents.into_iter())
            .map(|ident| async move {
                let ident = ident.to_resolved().await?;
                Ok((ident, hash_xxh3_hash64(&ident.to_string().await?)))
            })
            .try_join()
            .await?
            .into_iter()
            .collect::<FxIndexMap<_, _>>();

        finalize_module_ids(&mut module_id_map);

        Ok(GlobalModuleIdStrategy { module_id_map }.cell())
    }
    .instrument(span)
    .await
}

const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

/// Shorten hashes and handle any collisions.
fn finalize_module_ids(merged_module_ids: &mut FxIndexMap<ResolvedVc<AssetIdent>, u64>) {
    // 5% fill rate, as done in Webpack
    // https://github.com/webpack/webpack/blob/27cf3e59f5f289dfc4d76b7a1df2edbc4e651589/lib/ids/IdHelpers.js#L366-L405
    let optimal_range = merged_module_ids.len() * 20;
    let digit_mask = std::cmp::min(
        10u64.pow((optimal_range as f64).log10().ceil() as u32),
        JS_MAX_SAFE_INTEGER,
    );

    let mut used_ids = HashSet::with_hasher(BuildHasherDefault::<FxHasher>::default());
    for full_hash in merged_module_ids.values_mut() {
        let mut trimmed_hash = *full_hash % digit_mask;
        let mut i = 1;
        while used_ids.contains(&trimmed_hash) {
            // If the id is already used, seek to find another available id.
            trimmed_hash = hash_xxh3_hash64(*full_hash + i) % digit_mask;
            i += 1;
        }
        used_ids.insert(trimmed_hash);
        *full_hash = trimmed_hash;
    }
}
