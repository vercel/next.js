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

use std::{
    sync::{
        LazyLock,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Result;
use indexmap::map::Entry;
use petgraph::graph::NodeIndex;
use rustc_hash::FxHashSet;
use tracing::{Instrument, instrument};
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::{
        ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkType,
        ChunkableModule, ChunkingContext, chunk_item_batch::attach_async_info_to_chunkable_module,
    },
    module::{Module, StyleModule, StyleType},
    module_graph::{
        GraphTraversalAction, ModuleGraph,
        module_batch::ModuleOrBatch,
        module_batches::ModuleBatchesGraphEdge,
        style_groups::{StyleGroups, StyleItemInfo, make_style_groups},
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

/// A module that has been classified as a style module during the chunk-group walk. Carries both
/// the chunkable view (for size + chunk-item resolution) and the style view (for `style_type`),
/// so [`resolve_module_data`] doesn't need to repeat the sidecast.
struct StyleModuleRef {
    chunkable: ResolvedVc<Box<dyn ChunkableModule>>,
    style: ResolvedVc<Box<dyn StyleModule>>,
}

/// Per-discovered-chunkable-module classification: `Some((id, style))` for CSS modules and
/// `None` for non-CSS modules.
type ClassifiedModule = Option<(usize, ResolvedVc<Box<dyn StyleModule>>)>;

/// Build [`StyleGroups`] using the graph-analysis algorithm. See the module-level docs for
/// details.
#[instrument(skip(module_graph, chunking_context))]
pub async fn compute_style_groups_graph(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    request_cost: f32,
    module_factor_cost: f32,
    max_chunk_size: u64,
) -> Result<Vc<StyleGroups>> {
    // 1. Walk every chunk group post-order and collect, for each group, the ordered list of CSS
    //    modules. Module ids are densely allocated as we encounter modules for the first time.
    let (chunk_groups, modules_in_order) = collect_chunk_groups(module_graph, chunking_context)
        .instrument(tracing::trace_span!("collect_chunk_groups"))
        .await?;

    if modules_in_order.is_empty() {
        return Ok(make_style_groups(FxIndexMap::default()));
    }

    // 2. Resolve each module's `ChunkItemWithAsyncModuleInfo` and byte size in parallel.
    let module_data = resolve_module_data(module_graph, chunking_context, &modules_in_order)
        .instrument(tracing::trace_span!("resolve_module_data"))
        .await?;

    let module_sizes: Vec<u64> = module_data.iter().map(|m| m.size).collect();
    let module_style_types: Vec<StyleType> = module_data.iter().map(|m| m.style_type).collect();

    // 3. Run the synchronous chunking pipeline.
    let mut graph = tracing::trace_span!("create_graph")
        .in_scope(|| algorithm::create_graph(&chunk_groups, modules_in_order.len()));
    tracing::trace_span!("make_acyclic").in_scope(|| algorithm::make_acyclic(&mut graph));
    let global_order = tracing::trace_span!("linearize").in_scope(|| algorithm::linearize(&graph));
    let chunks = tracing::trace_span!("split_into_chunks").in_scope(|| {
        algorithm::split_into_chunks(
            &global_order,
            &chunk_groups,
            &module_sizes,
            &module_style_types,
            request_cost,
            module_factor_cost,
            max_chunk_size,
        )
    });

    // Optional debug dump controlled by `TURBOPACK_DEBUG_CSS_CHUNKING`. Failures here are
    // logged and otherwise swallowed so a debug toggle never breaks the build.
    if *DEBUG_DUMP_ENABLED
        && let Err(err) = write_debug_dump(
            &chunk_groups,
            &modules_in_order,
            &module_data,
            &global_order,
            &chunks,
        )
        .instrument(tracing::trace_span!("debug_dump"))
        .await
    {
        eprintln!("TURBOPACK_DEBUG_CSS_CHUNKING: failed to write debug dump: {err:?}");
    }

    // 4. Assemble the result. Each multi-item chunk becomes a `ChunkItemBatch`; singletons get a
    //    `batch = None` entry so the production sort still places them at the right `order`.
    assemble_style_groups(&chunks, &module_data)
        .instrument(tracing::trace_span!("assemble"))
        .await
}

static DEBUG_DUMP_ENABLED: LazyLock<bool> =
    LazyLock::new(|| match std::env::var("TURBOPACK_DEBUG_CSS_CHUNKING") {
        Ok(v) => !v.is_empty() && v != "0" && !v.eq_ignore_ascii_case("false"),
        Err(_) => false,
    });

/// Serialize a split cost metric for the debug dump. `serde_json` renders non-finite floats as
/// `null`, which would be indistinguishable from the genuine `None` of the last chunk, so the
/// non-finite cases are emitted as strings instead.
fn cost_to_json(cost: Option<f32>) -> serde_json::Value {
    match cost {
        None => serde_json::Value::Null,
        Some(c) if c.is_finite() => serde_json::json!(c),
        Some(c) if c == f32::NEG_INFINITY => serde_json::json!("-Infinity"),
        Some(c) if c == f32::INFINITY => serde_json::json!("Infinity"),
        Some(_) => serde_json::json!("NaN"),
    }
}

/// Write a JSON snapshot of the inputs and outputs of the graph-based CSS chunker to the
/// current working directory. Each invocation produces a uniquely named file so concurrent or
/// repeated computations don't overwrite each other.
async fn write_debug_dump(
    chunk_groups: &[Vec<usize>],
    modules: &[StyleModuleRef],
    module_data: &[ModuleData],
    global_order: &[NodeIndex],
    chunks: &[(Vec<usize>, Option<f32>)],
) -> Result<()> {
    // Resolve `ident_string()` for every module up front. Done in parallel to keep this off the
    // critical path even on graphs with thousands of CSS modules.
    let ident_strings: Vec<String> = modules
        .iter()
        .map(async |m| -> Result<String> {
            Ok(m.chunkable.ident_string().await?.as_str().to_owned())
        })
        .try_join()
        .await?;

    let ident = |id: usize| ident_strings[id].as_str();

    let chunk_groups_json: Vec<Vec<&str>> = chunk_groups
        .iter()
        .map(|g| g.iter().map(|&id| ident(id)).collect())
        .collect();

    // Each chunk carries the cost-delta of merging it with the following chunk (`None`/`null` for
    // the last chunk). A finite value is the surviving split metric; `"Infinity"` marks a boundary
    // a hard constraint forbade merging across.
    let mut chunks_json: Vec<serde_json::Value> = chunks
        .iter()
        .flat_map(|(chunk, merge_cost_to_next)| {
            [
                serde_json::json!(chunk.iter().map(|&id| ident(id)).collect::<Vec<_>>()),
                serde_json::json!(cost_to_json(*merge_cost_to_next)),
            ]
        })
        .collect();

    // last chunk has no merge cost
    chunks_json.pop();

    let global_order_flat_json: Vec<&str> = global_order.iter().map(|n| ident(n.index())).collect();

    let modules_json: Vec<serde_json::Value> = modules
        .iter()
        .enumerate()
        .map(|(i, _)| {
            serde_json::json!({
                "ident": ident(i),
                "size": module_data[i].size,
                "style_type": match module_data[i].style_type {
                    StyleType::GlobalStyle => "GlobalStyle",
                    StyleType::IsolatedStyle => "IsolatedStyle",
                },
            })
        })
        .collect();

    let dump = serde_json::json!({
        "chunk_groups": chunk_groups_json,
        "global_order": global_order_flat_json,
        "chunks": chunks_json,
        "modules": modules_json,
    });

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path =
        std::env::current_dir()?.join(format!("turbopack-css-chunking-debug-{now_ms}-{seq}.json"));

    let bytes = serde_json::to_vec_pretty(&dump)?;
    std::fs::write(&path, &bytes)?;
    eprintln!(
        "TURBOPACK_DEBUG_CSS_CHUNKING: wrote {} bytes to {}",
        bytes.len(),
        path.display()
    );
    Ok(())
}

async fn assemble_style_groups(
    chunks: &[(Vec<usize>, Option<f32>)],
    module_data: &[ModuleData],
) -> Result<Vc<StyleGroups>> {
    let mut shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo> =
        FxIndexMap::default();
    let mut order_counter: u32 = 0;
    let mut push =
        |map: &mut FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo>,
         chunk_item: ChunkItemWithAsyncModuleInfo,
         batch: Option<ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>>| {
            map.insert(
                chunk_item,
                StyleItemInfo {
                    order: Some(order_counter),
                    batch,
                },
            );
            order_counter += 1;
        };

    for (chunk, _cost) in chunks {
        if chunk.is_empty() {
            continue;
        }
        if chunk.len() == 1 {
            push(
                &mut shared_chunk_items,
                module_data[chunk[0]].chunk_item,
                None,
            );
            continue;
        }

        let chunk_items: Vec<_> = chunk.iter().map(|&id| module_data[id].chunk_item).collect();
        let batch = ChunkItemBatchWithAsyncModuleInfo::new(chunk_items.clone())
            .to_resolved()
            .await?;
        for chunk_item in chunk_items {
            push(&mut shared_chunk_items, chunk_item, Some(batch));
        }
    }

    // `linearize` operates on a DAG and processes every node, so every module the algorithm saw
    // must already have been emitted. Catch a future regression of that invariant in dev builds.
    debug_assert!(
        module_data
            .iter()
            .all(|data| shared_chunk_items.contains_key(&data.chunk_item)),
        "linearize dropped a module: every module reached by the chunk-group walk must appear in \
         the final chunk-item map",
    );

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
) -> Result<(Vec<Vec<usize>>, Vec<StyleModuleRef>)> {
    let chunk_group_info = module_graph.chunk_group_info().await?;
    let batches_graph = module_graph
        .module_batches(chunking_context.batching_config())
        .await?;
    // Per discovered chunkable module: `Some((id, sidecast_style))` for CSS modules and `None`
    // for non-CSS modules (which still occupy an entry so we don't repeat the classification).
    // Ids are densely packed in `0..modules_in_order.len()` — assigned via a separate counter
    // because the underlying `IndexMap`'s insertion order also includes non-CSS entries.
    let mut module_id_map: FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, ClassifiedModule> =
        FxIndexMap::default();
    let mut next_css_id: usize = 0;
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

        // Collect CSS module ids for this group, classifying modules on first sight. `seen`
        // dedups within a single group in O(1); the parallel `ids` Vec preserves insertion
        // order.
        let mut ids: Vec<usize> = Vec::new();
        let mut seen: FxHashSet<usize> = FxHashSet::default();
        let mut handle_module = async |module| -> Result<()> {
            let id_slot = match module_id_map.entry(module) {
                Entry::Occupied(e) => *e.get(),
                Entry::Vacant(e) => {
                    let assigned =
                        ResolvedVc::try_sidecast::<Box<dyn StyleModule>>(module).map(|style| {
                            let id = next_css_id;
                            next_css_id += 1;
                            (id, style)
                        });
                    e.insert(assigned);
                    assigned
                }
            };
            if let Some((id, _)) = id_slot
                && seen.insert(id)
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

    // Compact the id space: drop entries for non-CSS modules and keep CSS modules in insertion
    // order. The sidecast `StyleModule` is carried through so [`resolve_module_data`] doesn't
    // need to redo it.
    let modules_in_order: Vec<StyleModuleRef> = module_id_map
        .iter()
        .filter_map(|(&chunkable, slot)| slot.map(|(_, style)| StyleModuleRef { chunkable, style }))
        .collect();
    Ok((chunk_groups, modules_in_order))
}

/// Resolve each module's chunk item and byte size in parallel. The returned vec is parallel to
/// `modules`.
async fn resolve_module_data(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    modules: &[StyleModuleRef],
) -> Result<Vec<ModuleData>> {
    let async_module_info = module_graph.async_module_info();
    modules
        .iter()
        .map(async |m| -> Result<ModuleData> {
            let style_type = *m.style.style_type().await?;
            let chunk_item = attach_async_info_to_chunkable_module(
                m.chunkable,
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
