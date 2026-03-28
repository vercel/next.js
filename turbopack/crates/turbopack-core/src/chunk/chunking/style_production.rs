use std::{cmp::Reverse, collections::BinaryHeap};

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo,
        ChunkableModule, ChunkingConfig, ChunkingContext,
        chunking::{ChunkItemOrBatchWithInfo, SplitContext, make_chunk},
    },
    module_graph::{ModuleGraph, style_groups::StyleGroupsConfig},
};

/// An emission unit is either a shared style batch or a single non-shared chunk item.
/// The topological sort in `make_style_production_chunks` operates over these units.
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
enum EmissionUnit {
    Batch(ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>),
    Item(ChunkItemWithAsyncModuleInfo),
}

pub async fn make_style_production_chunks(
    chunk_items: Vec<&ChunkItemOrBatchWithInfo>,
    _batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    chunking_config: &ChunkingConfig,
    mut split_context: SplitContext<'_>,
) -> Result<()> {
    let span_outer = tracing::info_span!(
        "make style production chunks",
        chunk_items = chunk_items.len(),
    );
    async move {
        let style_groups = module_graph
            .style_groups(
                *chunking_context,
                StyleGroupsConfig {
                    max_chunk_size: chunking_config.max_merge_chunk_size,
                },
            )
            .await?;

        // `style_groups` has computed shared batches from the CSS chunk items across all
        // endpoints. We need to emit chunks for this endpoint in an order that respects the
        // CSS cascade: if module X must precede module Y, then X's emission unit (batch or
        // individual chunk) must be emitted before Y's.
        //
        // We cannot simply follow the DFS post-order of `chunk_items`, because a shared batch
        // groups members whose DFS positions may interleave with non-shared items. For example,
        // if DFS order is [A, B, C], {A, C} form a shared batch, and B is non-shared, emitting
        // at the last member gives [B, {A,C}] — wrong, because A must precede B.
        //
        // Instead, we:
        // 1. Build a module → EmissionUnit map for all CSS items in this endpoint.
        // 2. Translate the module-level dependency edges from `style_groups.module_dependents` into
        //    emission-unit edges.
        // 3. Topologically sort the emission units (Kahn's algorithm, DFS post-order as tiebreaker
        //    for determinism).
        // 4. Emit chunks in the sorted order.

        // --- Step 1: collect all ChunkItemWithAsyncModuleInfo for this endpoint ---
        // We also record each item's DFS position (index) so we can use it as a tiebreaker.
        let mut all_items: Vec<ChunkItemWithAsyncModuleInfo> = Vec::new();
        for chunk_item in &chunk_items {
            match chunk_item {
                ChunkItemOrBatchWithInfo::ChunkItem { chunk_item, .. } => {
                    all_items.push(chunk_item.clone());
                }
                ChunkItemOrBatchWithInfo::Batch { batch, .. } => {
                    for item in &batch.await?.chunk_items {
                        all_items.push(item.clone());
                    }
                }
            }
        }

        // --- Step 2: build module → EmissionUnit and module → DFS position maps ---
        // The DFS position is the index in `all_items` (already in DFS post-order).
        let mut module_to_unit: FxHashMap<ResolvedVc<Box<dyn ChunkableModule>>, EmissionUnit> =
            FxHashMap::default();
        // Track the earliest DFS position for each emission unit (for tiebreaking).
        let mut unit_min_pos: FxHashMap<EmissionUnit, usize> = FxHashMap::default();

        for (pos, item) in all_items.iter().enumerate() {
            let Some(module) = item.module else { continue };
            let unit = if let Some(&batch) = style_groups.shared_chunk_items.get(item) {
                EmissionUnit::Batch(batch)
            } else {
                EmissionUnit::Item(item.clone())
            };
            module_to_unit.insert(module, unit.clone());
            unit_min_pos
                .entry(unit)
                .and_modify(|p| *p = (*p).min(pos))
                .or_insert(pos);
        }

        // Collect the full set of emission units in this endpoint (in stable order for indexing).
        let units: Vec<EmissionUnit> = {
            let mut seen = FxHashSet::default();
            let mut ordered = Vec::new();
            for item in &all_items {
                let Some(module) = item.module else { continue };
                if let Some(unit) = module_to_unit.get(&module)
                    && seen.insert(unit.clone())
                {
                    ordered.push(unit.clone());
                }
            }
            ordered
        };
        let unit_index: FxHashMap<EmissionUnit, usize> = units
            .iter()
            .enumerate()
            .map(|(i, u)| (u.clone(), i))
            .collect::<FxHashMap<_, _>>();
        let n = units.len();

        // --- Step 3: build the emission-unit dependency graph ---
        // edge: src → dst means src must be emitted before dst.
        let mut adj: Vec<FxHashSet<usize>> = vec![FxHashSet::default(); n];
        let mut in_degree: Vec<usize> = vec![0; n];

        for (module, dependents) in &style_groups.module_dependents {
            let Some(src_unit) = module_to_unit.get(module) else {
                continue;
            };
            let src_idx = unit_index[src_unit];
            for dep_module in dependents {
                let Some(dst_unit) = module_to_unit.get(dep_module) else {
                    continue;
                };
                if src_unit == dst_unit {
                    continue; // same unit, no edge needed
                }
                let dst_idx = unit_index[dst_unit];
                if adj[src_idx].insert(dst_idx) {
                    in_degree[dst_idx] += 1;
                }
            }
        }

        // --- Step 4: Kahn's algorithm, using a min-heap on `unit_min_pos` as tiebreaker ---
        // The heap stores (min_pos, unit_index) so that among units with in-degree 0,
        // we always pick the one that appeared earliest in the DFS post-order.
        let mut heap: BinaryHeap<Reverse<(usize, usize)>> = BinaryHeap::new();
        for (i, unit) in units.iter().enumerate() {
            if in_degree[i] == 0 {
                let pos = unit_min_pos.get(unit).copied().unwrap_or(usize::MAX);
                heap.push(Reverse((pos, i)));
            }
        }

        let mut sorted: Vec<usize> = Vec::with_capacity(n);
        while let Some(Reverse((_, idx))) = heap.pop() {
            sorted.push(idx);
            for &neighbor in &adj[idx] {
                in_degree[neighbor] -= 1;
                if in_degree[neighbor] == 0 {
                    let pos = unit_min_pos
                        .get(&units[neighbor])
                        .copied()
                        .unwrap_or(usize::MAX);
                    heap.push(Reverse((pos, neighbor)));
                }
            }
        }

        debug_assert_eq!(
            sorted.len(),
            n,
            "Topological sort did not visit all emission units; cycle in CSS dependency graph?"
        );

        // --- Step 5: emit chunks in topological order ---
        for idx in sorted {
            match &units[idx] {
                EmissionUnit::Batch(batch) => {
                    make_chunk(
                        vec![&ChunkItemOrBatchWithInfo::Batch {
                            batch: *batch,
                            size: 0,
                        }],
                        vec![],
                        &mut String::new(),
                        &mut split_context,
                    )
                    .await?;
                }
                EmissionUnit::Item(chunk_item) => {
                    make_chunk(
                        vec![&ChunkItemOrBatchWithInfo::ChunkItem {
                            chunk_item: chunk_item.clone(),
                            size: 0,
                            asset_ident: rcstr!(""),
                        }],
                        vec![],
                        &mut String::new(),
                        &mut split_context,
                    )
                    .await?;
                }
            }
        }

        Ok(())
    }
    .instrument(span_outer)
    .await
}
