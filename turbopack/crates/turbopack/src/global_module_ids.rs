use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use smallvec::SmallVec;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{ChunkableModule, ChunkingType, module_id_strategies::GlobalModuleIdStrategy},
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, RefData},
};
use turbopack_ecmascript::async_chunk::module::AsyncLoaderModule;

#[turbo_tasks::function]
pub async fn get_global_module_id_strategy(
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<GlobalModuleIdStrategy>> {
    let span = tracing::info_span!("compute module id map");
    async move {
        let module_graph = module_graph.read_graphs().await?;
        let graphs = &module_graph.graphs;

        // All modules in the graph
        let module_idents = graphs
            .iter()
            .flat_map(|graph| graph.iter_nodes())
            .map(|m| m.module.ident());

        // And additionally, all the modules that are inserted by chunking (i.e. async loaders)
        let mut async_idents = vec![];
        module_graph.traverse_all_edges_unordered(|parent, current| {
            if let (
                _,
                &RefData {
                    chunking_type: ChunkingType::Async,
                    ..
                },
            ) = parent
            {
                let module = ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(current.module)
                    .context("expected chunkable module for async reference")?;
                async_idents.push(AsyncLoaderModule::asset_ident_for(*module));
            }
            Ok(())
        })?;

        let mut module_id_map = module_idents
            .chain(async_idents.into_iter())
            .map(|ident| async move {
                let ident = ident.to_resolved().await?;
                let ident_str = ident.to_string().await?;
                let hash = hash_xxh3_hash64(&ident_str);
                Ok((ident, (ident_str, hash)))
            })
            .try_join()
            .await?
            .into_iter()
            .collect::<FxHashMap<_, _>>();

        finalize_module_ids(&mut module_id_map);

        Ok(GlobalModuleIdStrategy {
            module_id_map: module_id_map
                .into_iter()
                .map(|(ident, (_, hash))| (ident, hash))
                .collect(),
        }
        .cell())
    }
    .instrument(span)
    .await
}

const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

/// Shorten hashes and handle any collisions.
fn finalize_module_ids(
    merged_module_ids: &mut FxHashMap<ResolvedVc<AssetIdent>, (ReadRef<RcStr>, u64)>,
) {
    // 5% fill rate, as done in Webpack
    // https://github.com/webpack/webpack/blob/27cf3e59f5f289dfc4d76b7a1df2edbc4e651589/lib/ids/IdHelpers.js#L366-L405
    let optimal_range = merged_module_ids.len() * 20;
    let digit_mask = std::cmp::min(
        10u64.pow((optimal_range as f64).log10().ceil() as u32),
        JS_MAX_SAFE_INTEGER,
    );

    let mut used_ids =
        FxHashMap::<u64, SmallVec<[(ResolvedVc<AssetIdent>, ReadRef<RcStr>); 1]>>::default();

    // Run in multiple passes, to not depend on the order of the `merged_module_ids` (i.e. the order
    // of imports). Hashes could still change if modules are added or removed.

    // Find pass: shorten hashes, potentially causing (more) collisions
    for (ident, (ident_str, full_hash)) in merged_module_ids.iter_mut() {
        let first_pass_hash = *full_hash % digit_mask;
        used_ids
            .entry(first_pass_hash)
            .or_default()
            .push((*ident, ident_str.clone()));
        *full_hash = first_pass_hash;
    }

    // Filter conflicts
    let mut conflicting_hashes = used_ids
        .iter()
        .filter(|(_, list)| list.len() > 1)
        .map(|(hash, _)| *hash)
        .collect::<Vec<_>>();
    conflicting_hashes.sort();

    // Second pass over the conflicts to resolve them
    for hash in conflicting_hashes.into_iter() {
        let list = used_ids.get_mut(&hash).unwrap();
        // Take the vector but keep the (empty) entry, so that the "contains_key" check below works
        let mut list = std::mem::take(list);
        list.sort_by(|a, b| a.1.cmp(&b.1));

        // Skip the first one, one module can keep the original hash
        for (ident, _) in list.into_iter().skip(1) {
            let hash = &mut merged_module_ids.get_mut(&ident).unwrap().1;

            // the original algorithm since all that runs in deterministic order now
            let mut i = 1;
            let mut trimmed_hash;
            loop {
                // If the id is already used, find the next available hash.
                trimmed_hash = hash_xxh3_hash64((*hash, i)) % digit_mask;
                if !used_ids.contains_key(&trimmed_hash) {
                    break;
                }
                i += 1;
            }
            // At this point, we don't care about the values anymore, just the keys
            used_ids.entry(trimmed_hash).or_default();
            *hash = trimmed_hash;
        }
    }
}
