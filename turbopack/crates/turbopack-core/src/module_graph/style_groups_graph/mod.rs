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
//! `request_cost` (in bytes — same unit as module sizes) charges for every CSS request a chunk
//! group makes. Larger values bias toward fewer, larger shared chunks.
//!
//! `module_factor_cost` controls how much the algorithm cares about small chunk groups:
//!
//! * `0` distributes overshipped bytes evenly across chunk groups.
//! * Higher values penalize overshipping in small chunk groups proportionally more, so small pages
//!   ship fewer unrelated styles at the expense of more requests overall.
//!
//! # Constraints
//!
//! * `max_chunk_size` is enforced by treating any merge that would produce a multi-item chunk
//!   exceeding the cap as `+infinity` cost (single-item chunks larger than the cap are left alone).
//! * Global CSS (`StyleType::GlobalStyle`) must not leak into unrelated chunk groups: any merge
//!   that would put a global item into a chunk loaded by a chunk group not currently loading that
//!   item is treated as `+infinity` cost.

use anyhow::Result;
use indexmap::map::Entry;
use rustc_hash::FxHashSet;
use tracing::Instrument;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::{
        ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkType,
        ChunkableModule, ChunkingContext, chunk_item_batch::attach_async_info_to_chunkable_module,
    },
    module::{StyleModule, StyleType},
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        module_batch::ModuleOrBatch,
        module_batches::ModuleBatchesGraphEdge,
        style_groups::{
            StyleGroups, StyleGroupsAlgorithm, StyleGroupsConfig, StyleItemInfo, make_style_groups,
        },
    },
};

mod algorithm;
mod subgraph_view;

#[cfg(test)]
mod tests;

/// Per-CSS-module data the graph algorithm needs. Built once during the per-chunk-group walk.
struct ModuleData {
    style_type: StyleType,
    /// Byte size of the module's chunk item.
    size: u64,
    chunk_item: ChunkItemWithAsyncModuleInfo,
}

/// Build [`StyleGroups`] using the graph-analysis algorithm. See the module-level docs for
/// details.
pub async fn compute_style_groups_graph(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    config: &StyleGroupsConfig,
) -> Result<Vc<StyleGroups>> {
    let StyleGroupsAlgorithm::Graph {
        request_cost,
        module_factor_cost_bits,
    } = config.algorithm
    else {
        unreachable!("compute_style_groups_graph called with non-Graph algorithm");
    };
    let module_factor_cost = f32::from_bits(module_factor_cost_bits as u32);
    // The cost model uses f32 throughout; convert at the boundary.
    let request_cost = request_cost as f32;

    // 1. Walk every chunk group post-order and collect, for each group, the ordered list of CSS
    //    modules. Module ids are densely allocated as we encounter modules for the first time.
    let (chunk_groups, modules_in_order) = collect_chunk_groups(module_graph, chunking_context)
        .instrument(tracing::trace_span!(
            "compute_style_groups_graph: collect_chunk_groups"
        ))
        .await?;

    if modules_in_order.is_empty() {
        return Ok(make_style_groups(FxIndexMap::default()));
    }

    // 2. Resolve each module's `ChunkItemWithAsyncModuleInfo` and byte size in parallel.
    let module_data = resolve_module_data(module_graph, chunking_context, &modules_in_order)
        .instrument(tracing::trace_span!(
            "compute_style_groups_graph: resolve_module_data"
        ))
        .await?;

    let module_sizes: Vec<u64> = module_data.iter().map(|m| m.size).collect();
    let module_style_types: Vec<StyleType> = module_data.iter().map(|m| m.style_type).collect();

    // 3. Run the chunking pipeline.
    let mut graph = tracing::trace_span!("compute_style_groups_graph: create_graph")
        .in_scope(|| algorithm::create_graph(&chunk_groups, modules_in_order.len()));
    tracing::trace_span!("compute_style_groups_graph: make_acyclic")
        .in_scope(|| algorithm::make_acyclic(&mut graph));
    let global_order = tracing::trace_span!("compute_style_groups_graph: linearize")
        .in_scope(|| algorithm::linearize(&graph));
    let chunks =
        tracing::trace_span!("compute_style_groups_graph: split_into_chunks").in_scope(|| {
            algorithm::split_into_chunks(
                &global_order,
                &chunk_groups,
                &module_sizes,
                &module_style_types,
                request_cost,
                module_factor_cost,
                config.max_chunk_size as u64,
            )
        });

    // 4. Assemble the result. Each multi-item chunk becomes a `ChunkItemBatch`; singletons get a
    //    `batch = None` entry so the production sort still places them at the right `order`.
    assemble_style_groups(&chunks, &module_data)
        .instrument(tracing::trace_span!("compute_style_groups_graph: assemble"))
        .await
}

async fn assemble_style_groups(
    chunks: &[Vec<usize>],
    module_data: &[ModuleData],
) -> Result<Vc<StyleGroups>> {
    let mut shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo> =
        FxIndexMap::default();
    let mut order_counter: u32 = 0;
    let chunk_item_for = |id: usize| module_data[id].chunk_item.clone();

    for chunk in chunks {
        if chunk.is_empty() {
            continue;
        }
        if chunk.len() == 1 {
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

    // Modules that the algorithm didn't reach (e.g. nodes dropped by `linearize` because of a
    // remaining cycle) are emitted as singletons at the end so the result is still complete.
    for data in module_data {
        if !shared_chunk_items.contains_key(&data.chunk_item) {
            shared_chunk_items.insert(
                data.chunk_item.clone(),
                StyleItemInfo {
                    order: Some(order_counter),
                    batch: None,
                },
            );
            order_counter += 1;
        }
    }

    Ok(make_style_groups(shared_chunk_items))
}

/// Walk every chunk group post-order, returning `(chunk_groups, modules_in_order)` where:
/// * `chunk_groups[i]` is the list of CSS module ids loaded by chunk group `i` (after dedup of
///   empty groups),
/// * `modules_in_order` is the densely-numbered list of distinct CSS modules referenced by any
///   chunk group, in insertion order.
async fn collect_chunk_groups(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<(Vec<Vec<usize>>, Vec<ResolvedVc<Box<dyn ChunkableModule>>>)> {
    let chunk_group_info = module_graph.chunk_group_info().await?;
    let batches_graph = module_graph
        .module_batches(chunking_context.batching_config())
        .await?;
    let mut module_id_map: FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, Option<usize>> =
        FxIndexMap::default();
    let mut chunk_groups: Vec<Vec<usize>> = Vec::new();

    for (i, chunk_group) in chunk_group_info.chunk_groups.iter().enumerate() {
        let ordered_entries = batches_graph.get_ordered_entries(&chunk_group_info, i);
        let mut entries = Vec::with_capacity(chunk_group.entries_count());
        for entry in ordered_entries {
            entries.push(batches_graph.get_entry_index(entry).await?);
        }
        let mut visited = FxHashSet::default();
        let mut items_in_postorder = FxIndexSet::default();
        batches_graph.traverse_edges_from_entries_dfs(
            entries.iter().copied(),
            &mut (),
            |parent_info, module, _| {
                if let Some((_, ModuleBatchesGraphEdge { ty, .. })) = parent_info
                    && !ty.is_parallel()
                {
                    return Ok(GraphTraversalAction::Exclude);
                }
                if visited.insert(module) {
                    Ok(GraphTraversalAction::Continue)
                } else {
                    Ok(GraphTraversalAction::Exclude)
                }
            },
            |parent_info, item, _| {
                if let Some((_, ModuleBatchesGraphEdge { ty, .. })) = parent_info
                    && !ty.is_parallel()
                {
                    return;
                }
                items_in_postorder.insert(*item);
            },
        )?;

        // Collect CSS module ids for this group, classifying modules on first sight.
        let mut ids: Vec<usize> = Vec::new();
        let mut handle_module = async |module| -> Result<()> {
            let id_slot = match module_id_map.entry(module) {
                Entry::Occupied(e) => *e.get(),
                Entry::Vacant(e) => {
                    let assigned =
                        if ResolvedVc::try_sidecast::<Box<dyn StyleModule>>(module).is_some() {
                            Some(e.index())
                        } else {
                            None
                        };
                    e.insert(assigned);
                    assigned
                }
            };
            if let Some(id) = id_slot
                && !ids.contains(&id)
            {
                ids.push(id);
            }
            Ok(())
        };

        for item in items_in_postorder {
            match item {
                ModuleOrBatch::Batch(batch) => {
                    for &module in &batch.await?.modules {
                        handle_module(module).await?;
                    }
                }
                ModuleOrBatch::Module(module) => {
                    if let Some(chunkable_module) = ResolvedVc::try_downcast(module) {
                        handle_module(chunkable_module).await?;
                    }
                }
                ModuleOrBatch::None(_) => {}
            }
        }

        if !ids.is_empty() {
            chunk_groups.push(ids);
        }
    }

    // Compact the id space: drop entries for modules that never got a CSS id (`None`) and keep
    // the rest in insertion order. Returns the dense list of modules.
    let modules_in_order: Vec<_> = module_id_map
        .iter()
        .filter_map(|(m, id)| id.map(|_| *m))
        .collect();
    Ok((chunk_groups, modules_in_order))
}

/// Resolve each module's chunk item and byte size in parallel. The returned vec is parallel to
/// `modules`.
async fn resolve_module_data(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    modules: &[ResolvedVc<Box<dyn ChunkableModule>>],
) -> Result<Vec<ModuleData>> {
    let async_module_info = module_graph.async_module_info();
    modules
        .iter()
        .map(async |&module| -> Result<ModuleData> {
            let style_module = ResolvedVc::try_sidecast::<Box<dyn StyleModule>>(module)
                .expect("modules vec only contains modules previously classified as StyleModule");
            let style_type = *style_module.style_type().await?;
            let chunk_item = attach_async_info_to_chunkable_module(
                module,
                async_module_info,
                module_graph,
                chunking_context,
            )
            .await?;
            let size = *chunk_item
                .chunk_type
                .chunk_item_size(chunking_context, *chunk_item.chunk_item, None)
                .await?;
            Ok(ModuleData {
                style_type,
                size: size as u64,
                chunk_item,
            })
        })
        .try_join()
        .await
}
