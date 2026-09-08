use anyhow::{Context, Result, bail};
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkingType, ModuleId,
        chunk_id_strategy::{ModuleIdFallback, ModuleIdStrategy},
    },
    ident::AssetIdent,
    module_graph::{ModuleGraph, RefData},
};
use turbopack_ecmascript::async_chunk::module::AsyncLoaderModule;

#[turbo_tasks::function]
pub async fn get_global_module_id_strategy(
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<ModuleIdStrategy>> {
    let span = tracing::info_span!("compute module id map");
    async move {
        let module_graph = module_graph.await?;

        // All modules in the graph and additionally, all the modules that are inserted by chunking
        // (i.e. async loaders). For graph modules we read the eagerly-resolved ident AND its
        // pre-resolved `ident_string` from the node, so we don't fan out a `to_string()` task per
        // module here (the production/CLI-build graphs that run this are built with
        // `include_ident_strings`). Async-loader idents are synthesized and not in the graph, so
        // their strings are still computed via `to_string()`.
        let mut modules = FxHashSet::default();
        let mut async_idents = vec![];
        module_graph.traverse_edges_unordered(|parent, current| {
            let ident = module_graph.module_ident_resolved(current)?;
            let ident_string = module_graph.module_ident_string_resolved(current)?;
            modules.insert((ident, ident_string));
            if let Some((
                _,
                &RefData {
                    chunking_type: ChunkingType::Async,
                    ..
                },
            )) = parent
            {
                let module = ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(current)
                    .context("expected chunkable module for async reference")?;
                async_idents.push(AsyncLoaderModule::asset_ident_for(*module));
            }
            Ok(())
        })?;

        // Resolve graph-module idents to `(ident, (ident_str, hash))`, reading the pre-resolved
        // `ident_string` from the node (the graph is built with `include_ident_strings`, else
        // `module_ident_string_resolved` bails — no silent per-module `to_string()` fallback).
        let graph_entries = modules
            .into_iter()
            .map(|(ident, ident_string)| async move {
                let ident_str = ident_string.await?;
                let hash = hash_xxh3_hash64(&ident_str);
                Ok((ident, (ident_str, hash)))
            })
            .try_join()
            .await?;
        // Async-loader idents are synthesized (not in the graph); compute their strings directly.
        let async_entries = async_idents
            .into_iter()
            .map(async |ident| {
                let ident = ident.to_resolved().await?;
                let ident_str = ident.to_string().await?;
                let hash = hash_xxh3_hash64(&ident_str);
                Ok((ident, (ident_str, hash)))
            })
            .try_join()
            .await?;

        let mut module_id_map = graph_entries
            .into_iter()
            .chain(async_entries)
            .collect::<FxHashMap<_, _>>();

        finalize_module_ids(&mut module_id_map);

        Ok(ModuleIdStrategy {
            module_id_map: Some(ResolvedVc::cell(
                module_id_map
                    .into_iter()
                    .map(|(ident, (_, hash))| {
                        const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;
                        if hash > JS_MAX_SAFE_INTEGER {
                            bail!("Numeric module id is too large: {}", hash);
                        }
                        Ok((ident, ModuleId::Number(hash)))
                    })
                    .collect::<Result<FxHashMap<_, _>>>()?,
            )),
            fallback: ModuleIdFallback::Error,
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
