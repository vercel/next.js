//! Graph-based CSS chunking algorithm.
//!
//! Selected by `experimental.cssChunking: "graph"` in Next.js. An alternative to the default
//! ("loose") algorithm in [`super::style_groups`].
//!
//! # Pipeline
//!
//! ```text
//! create_graph → make_acyclic → linearize → split_into_chunks → assemble batches
//! ```
//!
//! 1. **`create_graph`** — for each chunk group, the ordered list of CSS modules is converted into
//!    pairwise "later depends on earlier" edges in a directed weighted graph. Edge weights
//!    accumulate when the same `(from, to)` pair occurs in multiple groups.
//! 2. **`make_acyclic`** — co-occurrence almost always produces cycles. Each multi-node SCC has its
//!    lowest-weight edge cut until the graph is a DAG. Heavy edges represent strong co-occurrence
//!    and are preserved.
//! 3. **`linearize`** — Kahn-style topological sort with a tie-break: when several dependents
//!    become unblocked at once, the heaviest edge wins (and insertion order breaks ties among equal
//!    weights). This places strongly co-occurring modules adjacent in the global order.
//! 4. **`split_into_chunks`** — greedy bottom-up merger over the global order. At every active
//!    split point we score the merge as `cost(merged) - cost(left) - cost(right)` and take the
//!    most-negative score. We stop when no remaining merge would reduce cost.
//!
//! # Cost model
//!
//! Per chunk loaded by a chunk group:
//!
//! ```text
//! cost_per_group(chunk, group)
//!   = chunk_size
//!   + (chunk_size / group_total_size) * module_factor_cost
//!   + request_cost
//! ```
//!
//! where `chunk_size` is the sum of module byte sizes in the chunk and `group_total_size` is the
//! total CSS byte size of the chunk group. The total cost of a chunk is summed over the chunk
//! groups that load it (a group "loads" a chunk if it shares ≥ 1 module with it).
//!
//! # Constraints
//!
//! * `max_chunk_size` is enforced by treating any merge that would produce a multi-item chunk
//!   exceeding the cap as `+infinity` cost (single-item chunks larger than the cap are left alone).
//! * Global CSS (`StyleType::GlobalStyle`) must not leak into unrelated chunk groups: any merge
//!   that would put a global item into a chunk loaded by a chunk group not currently loading that
//!   item is treated as `+infinity` cost.

use anyhow::Result;
use turbo_tasks::{FxIndexMap, Vc};

use crate::{
    chunk::{ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkingContext},
    module::StyleType,
    module_graph::{
        ModuleGraph,
        style_groups::{
            StyleGroups, StyleGroupsAlgorithm, StyleGroupsConfig, StyleItemInfo,
            collect_style_modules_per_chunk_group,
        },
    },
};

mod algorithm;
mod subgraph_view;

#[cfg(test)]
mod tests;

/// Build [`StyleGroups`] using the graph-analysis algorithm. See the module-level docs for
/// details.
pub async fn compute_style_groups_graph(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    config: &StyleGroupsConfig,
) -> Result<Vc<StyleGroups>> {
    let StyleGroupsAlgorithm::Graph {
        request_cost,
        module_factor_cost,
    } = config.algorithm.clone()
    else {
        unreachable!("compute_style_groups_graph called with non-Graph algorithm");
    };

    let collection = collect_style_modules_per_chunk_group(module_graph, chunking_context).await?;

    // Map each chunk group to a sequence of module ids (here the index in `module_info_map`).
    let chunk_groups: Vec<Vec<usize>> = collection
        .chunk_group_state
        .iter()
        .map(|state| {
            state
                .styles
                .iter()
                .filter_map(|m| collection.module_info_map.get_index_of(m))
                .collect()
        })
        .collect();

    // Per-module byte size, indexed by the same id used in `chunk_groups`.
    let module_sizes: Vec<u64> = collection
        .module_info_map
        .values()
        .map(|info| info.as_ref().unwrap().size as u64)
        .collect();

    // Per-module style type, used to forbid cross-chunk-group leakage of global CSS.
    let module_style_types: Vec<StyleType> = collection
        .module_info_map
        .values()
        .map(|info| info.as_ref().unwrap().style_type)
        .collect();

    // Run the pipeline.
    let mut graph = algorithm::create_graph(&chunk_groups, collection.module_info_map.len());
    algorithm::make_acyclic(&mut graph);
    let global_order = algorithm::linearize(&graph);

    let chunks = algorithm::split_into_chunks(
        &global_order,
        &chunk_groups,
        &module_sizes,
        &module_style_types,
        request_cost,
        module_factor_cost,
        config.max_chunk_size as u64,
    );

    // Assemble the result.
    let mut shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo> =
        FxIndexMap::default();
    let mut order_counter: u32 = 0;
    let modules: Vec<_> = collection.module_info_map.keys().copied().collect();
    let chunk_item_for = |id: usize| -> ChunkItemWithAsyncModuleInfo {
        collection
            .module_info_map
            .get(&modules[id])
            .and_then(|i| i.as_ref())
            .expect("module must exist")
            .chunk_item
            .as_ref()
            .expect("chunk_item filled by collector")
            .clone()
    };

    for chunk in &chunks {
        if chunk.is_empty() {
            continue;
        }
        if chunk.len() == 1 {
            // Singleton chunk: emit no batch, just an order entry so the production sort lays
            // it down at the right position.
            shared_chunk_items.insert(
                chunk_item_for(chunk[0]),
                StyleItemInfo {
                    order: Some(order_counter),
                    batch: None,
                },
            );
            order_counter += 1;
            continue;
        }

        let chunk_items: Vec<_> = chunk.iter().map(|&id| chunk_item_for(id)).collect();
        let batch = ChunkItemBatchWithAsyncModuleInfo::new(chunk_items.clone())
            .to_resolved()
            .await?;
        for chunk_item in chunk_items {
            shared_chunk_items.insert(
                chunk_item,
                StyleItemInfo {
                    order: Some(order_counter),
                    batch: Some(batch),
                },
            );
            order_counter += 1;
        }
    }

    // Modules that the algorithm didn't reach (e.g. cycle nodes dropped by `linearize`) are
    // emitted as singletons with stable orders at the end. This shouldn't normally happen on
    // realistic inputs but keeps the output complete.
    for (id, module) in modules.iter().enumerate() {
        let info = collection
            .module_info_map
            .get(module)
            .and_then(|i| i.as_ref());
        let Some(info) = info else { continue };
        let chunk_item = info.chunk_item.as_ref().unwrap().clone();
        if shared_chunk_items.contains_key(&chunk_item) {
            continue;
        }
        let _ = id;
        shared_chunk_items.insert(
            chunk_item,
            StyleItemInfo {
                order: Some(order_counter),
                batch: None,
            },
        );
        order_counter += 1;
    }

    Ok(StyleGroups { shared_chunk_items }.cell())
}

// (no test re-exports needed; tests live in the algorithm submodule and access it directly)
