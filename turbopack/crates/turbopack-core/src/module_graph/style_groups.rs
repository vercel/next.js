//! # CSS Style Groups — Shared Chunk Batching
//!
//! CSS modules must not be duplicated across chunks: each module is emitted exactly once, and every
//! route that needs it references the same shared chunk. The simplest strategy — one chunk per
//! module — is correct but causes many HTTP requests. This module groups multiple CSS modules into
//! shared chunks to reduce request count while preserving the CSS cascade order that each route
//! expects.
//!
//! ## Algorithm overview
//!
//! 1. **Collect per-route orderings.** For each chunk group (≈ route), DFS-postorder traverse the
//!    module graph to get the CSS modules in cascade order.
//!
//! 2. **Compute dependencies.** Module X is a dependency of Y when X appears before Y in *every*
//!    chunk group where both are present.
//!
//! 3. **Greedy batching.** Process modules in `(index_sum, ident)` order. For each unprocessed
//!    "seed," start a new batch and greedily absorb neighbouring candidates, subject to:
//!    - a per-chunk **size budget** (`max_chunk_size`),
//!    - dependency ordering (no dependent already in the batch),
//!    - **global-CSS leak prevention** (global styles must not appear in routes that don't import
//!      them), and
//!    - the **contiguity check**: for every route containing both the candidate and an existing
//!      batch member, no unprocessed non-batch module may sit in the gap between them. This is the
//!      key invariant that prevents shared chunks from breaking per-route cascade order.
//!
//! 4. **Emit.** Each batch of ≥ 2 modules becomes a single shared CSS chunk. Modules not assigned
//!    to any batch get their own individual chunk.
//!
//! ## Overserving is expected
//!
//! The greedy algorithm can absorb a module into a batch even when that module does not appear in
//! every route that the batch covers. For example, if route A has `[shared1, unique_a, shared2]`
//! and route B has `[shared1, unique_b, shared2]`, the algorithm may produce a single batch
//! `{shared1, unique_a, unique_b, shared2}`. Route A then receives `unique_b`'s CSS even though
//! it doesn't import it, and vice versa.
//!
//! This is intentional. For **isolated / scoped CSS** (CSS Modules), the unused classes are never
//! referenced in the DOM, so the extra bytes have no visual effect — they only cost bandwidth.
//! The trade-off is worthwhile because merging reduces the number of HTTP requests, which has a
//! larger impact on page-load performance than a modest increase in CSS payload size.
//!
//! **Global CSS** is handled differently: the global-CSS leak checks (see step 3) prevent a global
//! stylesheet from being served to routes that don't import it, because global styles *would*
//! affect rendering.
//!
//! ## Comparison with module merging
//!
//! The JS module-merging algorithm ([`super::merged_modules`]) solves a similar problem but uses a
//! stricter bitmap-based approach: only modules with *identical* entry-point reachability are
//! merged. This avoids overserving entirely but produces more, smaller groups. The CSS algorithm
//! uses a greedier strategy because (a) scoped CSS overserving is benign, (b) fewer chunks
//! meaningfully reduces request count, and (c) a longest-common-prefix reconciliation approach
//! (like module merging uses) would fail to merge modules separated by route-unique modules —
//! exactly the scenario this algorithm is designed to handle.

use std::cmp::Reverse;

use anyhow::Result;
use bincode::{Decode, Encode};
use indexmap::map::Entry;
use roaring::RoaringBitmap;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, ValueToString,
    Vc, trace::TraceRawVcs,
};

use crate::{
    chunk::{
        ChunkItem, ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkType,
        ChunkableModule, ChunkingContext, chunk_item_batch::attach_async_info_to_chunkable_module,
    },
    module::{Module, StyleModule, StyleType},
    module_graph::{
        GraphTraversalAction, ModuleGraph, module_batch::ModuleOrBatch,
        module_batches::ModuleBatchesGraphEdge,
    },
};

#[derive(
    TaskInput, Debug, Clone, PartialEq, Eq, Hash, NonLocalValue, TraceRawVcs, Encode, Decode,
)]
pub struct StyleGroupsConfig {
    pub max_chunk_size: usize,
}

/// Styling must not be duplicated in the application. The simplest way to achieve this is to put
/// every styling chunk item into a separate chunk. That works, but isn't efficient since it would
/// cause a lot of requests. Instead we multiple chunk items are groups together and placed in a
/// single shared chunk. `StyleGroups` specifies how chunk items are grouped together.
#[turbo_tasks::value]
pub struct StyleGroups {
    /// The key chunk item is contained in the value chunk item batch. All chunk items that are not
    /// contained in this map are placed in a separate chunk per chunk item.
    #[bincode(with = "turbo_bincode::indexmap")]
    pub shared_chunk_items:
        FxIndexMap<ChunkItemWithAsyncModuleInfo, ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>>,
}

/// Information about a CSS module and its presence across chunk groups.
///
/// Each CSS module can appear in multiple chunk groups (e.g., different routes/pages).
/// This struct tracks where the module appears and its properties for the batching algorithm.
#[derive(Debug)]
struct ModuleInfo {
    /// The type of style (e.g., GlobalStyle, ModuleStyle).
    style_type: StyleType,
    /// The module identifier, used as a tiebreaker for deterministic ordering.
    ident: RcStr,
    /// Maps chunk group index to the module's position within that chunk group's postorder.
    ///
    /// - Key: The index of a chunk group that contains this module
    /// - Value: The position (index) of this module in that chunk group's postorder traversal
    ///
    /// For example, if a module appears in chunk groups 0 and 2:
    /// - `{0: 5, 2: 3}` means it's at position 5 in chunk group 0, position 3 in chunk group 2
    ///
    /// This is used to:
    /// 1. Determine which chunk groups a module belongs to (via `.keys()`)
    /// 2. Look up a module's position in a specific chunk group (via `.get()`)
    /// 3. Compute dependencies (module A depends on B if A appears after B in all shared groups)
    ///
    /// Uses FxIndexMap for deterministic iteration order (insertion order).
    /// Since chunk groups are processed sequentially (0, 1, 2, ...), insertion order
    /// equals sorted order. This is important because iteration order affects which
    /// modules are selected for batching, and non-deterministic order can cause CSS
    /// ordering bugs. See GitHub issue #89523.
    chunk_group_indices: FxIndexMap<usize, usize>,
    /// Sum of all position indices across chunk groups, used as a heuristic for sorting modules.
    ///
    /// The greedy batching algorithm seeds new batches from the front of the sorted module list,
    /// so we want modules that appear early in the cascade to be processed first. `index_sum` is
    /// a cheap approximation of this: lower values bias toward modules near the top of their
    /// routes' cascade order.
    ///
    /// This is imperfect — it conflates "early position" with "few chunk groups." A module at
    /// position 0 in 1 route (`index_sum=0`) sorts before a module at position 1 in 30 routes
    /// (`index_sum=30`), even though the latter is arguably more important to process early.
    /// Ideally we'd sort by something like (average position, number of chunk groups), but
    /// there's no obvious way to combine those into a single key.
    index_sum: usize,
    /// The byte size of this module's CSS output, used for chunk size budgeting.
    size_bytes: usize,
    /// The chunk item representation of this module, populated after initial processing.
    chunk_item: Option<ChunkItemWithAsyncModuleInfo>,
}

impl ModuleInfo {
    fn new(style_type: StyleType, ident: RcStr) -> Self {
        Self {
            style_type,
            ident,
            chunk_group_indices: Default::default(),
            index_sum: 0,
            size_bytes: 0,
            chunk_item: None,
        }
    }
}

/// State for a single chunk group during style batching.
///
/// A chunk group corresponds to a route/page and contains all CSS modules
/// needed by that route in their correct cascade order (postorder DFS traversal).
struct ChunkGroupState {
    /// CSS modules in this chunk group, in postorder traversal order.
    /// The order here determines the correct CSS cascade order.
    styles: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
}

/// Pure-data version of [`ModuleInfo`] for the batching algorithm. Free of Vc types so it can be
/// used in unit tests without a turbo-tasks runtime.
#[derive(Debug)]
struct BatchingModuleInfo {
    style_type: StyleType,
    ident: RcStr,
    chunk_group_indices: FxIndexMap<usize, usize>,
    size_bytes: usize,
}

/// Result of the pure batching algorithm. Each batch is a `Vec<usize>` of module keys that should
/// share a single CSS chunk. Only multi-module batches are included.
struct BatchingResult {
    batches: Vec<Vec<usize>>,
}

/// Pure algorithmic core of the style-groups batching algorithm.
///
/// This function contains the dependency computation and greedy batching loop extracted from
/// [`compute_style_groups`]. It operates on plain indices instead of Vc types, making it testable
/// without a turbo-tasks runtime.
///
/// # Parameters
/// - `module_info`: Ordered map from module key (usize) to module metadata. Must already be sorted
///   by (index_sum ascending, ident tiebreak). Keys are opaque identifiers.
/// - `chunk_group_styles`: For each chunk group, the ordered list of module keys in CSS cascade
///   order (postorder DFS).
/// - `max_chunk_size`: Maximum byte size for a single shared chunk.
fn compute_style_batches(
    module_info: &FxIndexMap<usize, BatchingModuleInfo>,
    chunk_group_styles: &[FxIndexSet<usize>],
    max_chunk_size: usize,
) -> BatchingResult {
    // --- Compute the dependencies of each module ---
    // X is a dependency of Y if X appears before Y in *every* chunk group that Y belongs to.
    // We compute this by intersecting the set of preceding modules across all chunk groups
    // for each module. The intersection shrinks at each step, keeping the sets small in
    // practice.
    let mut module_dependencies: FxHashMap<usize, FxHashSet<usize>> = FxHashMap::default();
    for (&module_key, info) in module_info {
        let mut deps: Option<FxHashSet<usize>> = None;
        for (&cg_idx, &pos) in &info.chunk_group_indices {
            let preceding: FxHashSet<usize> = chunk_group_styles[cg_idx].as_slice()[..pos]
                .iter()
                .copied()
                .collect();
            match &mut deps {
                None => {
                    deps = Some(preceding);
                }
                Some(d) => {
                    // intersect the previously collected deps and the new ones
                    d.retain(|x| preceding.contains(x));
                }
            }
        }
        if let Some(mut deps) = deps
            && !deps.is_empty()
        {
            deps.shrink_to_fit();
            module_dependencies.insert(module_key, deps);
        }
    }

    // --- Greedy batching loop ---
    let mut chunk_group_requests: Vec<usize> = chunk_group_styles.iter().map(|s| s.len()).collect();

    let mut processed = RoaringBitmap::new();

    let mut batches: Vec<Vec<usize>> = Vec::new();

    for (&module_key, _) in module_info.iter() {
        if processed.contains(module_key as u32) {
            continue;
        }
        processed.insert(module_key as u32);

        let info = &module_info[&module_key];
        let mut global_mode = info.style_type == StyleType::GlobalStyle;

        // The furthest position of any batch member seen so far in each chunk group.
        // Only chunk groups containing at least one batch member are present.
        // The watermark only ever moves forward (we use max on update) so that the
        // contiguity gap check [watermark+1, m_pos) correctly reflects the full
        // extent of the batch in each route.
        let mut all_chunk_states = info.chunk_group_indices.clone();

        // The set of modules that go into the new chunk, in insertion order.
        // Insertion order matters because it determines CSS cascade order within the chunk.
        let mut new_batch: FxIndexSet<usize> = [module_key].into_iter().collect();

        // The current size of the new chunk
        let mut current_size = info.size_bytes;

        // A pool of potential modules where the next module is selected from.
        // It's filled from the next module of the selected modules in every chunk group.
        let mut potential_next = all_chunk_states
            .iter()
            .filter_map(|(&cg_idx, &pos)| {
                let following = &chunk_group_styles[cg_idx].as_slice()[pos + 1..];
                following
                    .iter()
                    .find(|&m| !processed.contains(*m as u32))
                    .copied()
            })
            .collect::<FxHashSet<_>>();

        // Try to add modules to the chunk until a break condition is met
        'outer: loop {
            // We try to select a module that reduces request count and
            // has the highest number of requests
            let mut candidates: Vec<(usize, &BatchingModuleInfo, usize)> = potential_next
                .iter()
                .copied()
                .filter_map(|m| {
                    let mi = &module_info[&m];
                    // Filter out modules that would exceed the size budget
                    if current_size + mi.size_bytes > max_chunk_size {
                        return None;
                    }
                    // Filter out modules that would violate dependency ordering:
                    // if anything already in the batch depends on m, then m must
                    // come before it, but the batch is unordered so we can't
                    // guarantee that.
                    if new_batch.iter().any(|&b| {
                        module_dependencies
                            .get(&b)
                            .is_some_and(|deps| deps.contains(&m))
                    }) {
                        return None;
                    }
                    let max_req = mi
                        .chunk_group_indices
                        .keys()
                        .filter(|&cg| all_chunk_states.contains_key(cg))
                        .map(|&cg| chunk_group_requests[cg])
                        .max()
                        .unwrap();
                    Some((m, mi, max_req))
                })
                .collect();
            candidates.sort_unstable_by_key(|(_, mi, req)| (Reverse(*req), &mi.ident));

            // Try every potential module
            for (m, mi, _) in candidates {
                // Global CSS must not leak into unrelated chunks
                let is_global = mi.style_type == StyleType::GlobalStyle;
                if is_global
                    && global_mode
                    && all_chunk_states.len() != mi.chunk_group_indices.len()
                {
                    // Fast check: chunk groups need to be identical
                    continue;
                }
                if global_mode
                    && mi
                        .chunk_group_indices
                        .keys()
                        .any(|cg| !all_chunk_states.contains_key(cg))
                {
                    // Global CSS in new_chunk_items would leak into new chunk_group
                    continue;
                }
                if is_global
                    && all_chunk_states
                        .keys()
                        .any(|cg| !mi.chunk_group_indices.contains_key(cg))
                {
                    // Global CSS would leak into existing chunk_group
                    continue;
                }
                // Contiguity check: for every route that contains both the
                // candidate and at least one existing batch member, ensure no
                // unprocessed non-batch module sits between the watermark and
                // the candidate. Without this, a shared chunk can break CSS
                // cascade order when routes interleave shared and unique modules.
                {
                    let mut contiguous = true;
                    'contiguity: for (&r_idx, &m_pos) in &mi.chunk_group_indices {
                        let Some(&watermark) = all_chunk_states.get(&r_idx) else {
                            continue;
                        };
                        let (lo, hi) = if watermark < m_pos {
                            (watermark + 1, m_pos)
                        } else if m_pos < watermark {
                            (m_pos + 1, watermark)
                        } else {
                            continue;
                        };
                        for &between in chunk_group_styles[r_idx].as_slice()[lo..hi].iter().rev() {
                            if new_batch.contains(&between) {
                                continue;
                            }
                            if processed.contains(between as u32) {
                                continue;
                            }
                            contiguous = false;
                            break 'contiguity;
                        }
                    }
                    if !contiguous {
                        continue;
                    }
                }
                potential_next.remove(&m);
                current_size += mi.size_bytes;
                if is_global {
                    global_mode = true;
                }
                for &cg_idx in mi.chunk_group_indices.keys() {
                    if all_chunk_states.contains_key(&cg_idx) {
                        // Only decrement when this chunk group is already tracked by the
                        // batch — absorbing into a new chunk group doesn't reduce its
                        // request count.
                        chunk_group_requests[cg_idx] -= 1;
                    }

                    let pos = chunk_group_styles[cg_idx].get_index_of(&m).unwrap();
                    // Use max so the watermark only ever moves forward, preserving its
                    // semantic as "furthest extent of the batch in this route."
                    all_chunk_states
                        .entry(cg_idx)
                        .and_modify(|w| *w = (*w).max(pos))
                        .or_insert(pos);
                    let following = &chunk_group_styles[cg_idx].as_slice()[pos + 1..];
                    if let Some(&next) = following
                        .iter()
                        .find(|&x| !processed.contains(*x as u32) && !new_batch.contains(x))
                    {
                        potential_next.insert(next);
                    }
                }

                new_batch.insert(m);
                processed.insert(m as u32);
                continue 'outer;
            }
            break;
        }

        if new_batch.len() > 1 {
            batches.push(new_batch.into_iter().collect());
        }
    }

    BatchingResult { batches }
}

pub async fn compute_style_groups(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    config: &StyleGroupsConfig,
) -> Result<Vc<StyleGroups>> {
    let chunk_group_info = module_graph.chunk_group_info().await?;
    let batches_graph = module_graph
        .module_batches(chunking_context.batching_config())
        .await?;
    let async_module_info = module_graph.async_module_info();
    let mut module_info_map: FxIndexMap<ResolvedVc<Box<dyn ChunkableModule>>, Option<ModuleInfo>> =
        FxIndexMap::default();

    // Compute the style modules in each chunk group
    let mut chunk_group_state = Vec::new();
    let mut idx = 0;
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

        let mut styles = FxIndexSet::default();
        let mut handle_module = async |module| {
            match module_info_map.entry(module) {
                Entry::Occupied(mut e) => {
                    if let Some(info) = e.get_mut() {
                        info.chunk_group_indices.insert(idx, styles.len());
                        info.index_sum += styles.len();
                        styles.insert(module);
                    }
                }
                Entry::Vacant(e) => {
                    if let Some(style_module) =
                        ResolvedVc::try_sidecast::<Box<dyn StyleModule>>(module)
                    {
                        let style_type = *style_module.style_type().await?;
                        let mut info =
                            ModuleInfo::new(style_type, module.ident().to_string().owned().await?);
                        info.chunk_group_indices.insert(idx, styles.len());
                        info.index_sum += styles.len();
                        styles.insert(module);
                        e.insert(Some(info));
                    } else {
                        e.insert(None);
                    }
                }
            }
            anyhow::Ok(())
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

        if !styles.is_empty() {
            chunk_group_state.push(ChunkGroupState { styles });
            idx += 1;
        }
    }

    module_info_map.retain(|_, info| info.is_some());

    module_info_map.sort_unstable_by(|_, a, _, b| {
        let a = a.as_ref().unwrap();
        let b = b.as_ref().unwrap();
        a.index_sum
            .cmp(&b.index_sum)
            .then_with(|| a.ident.cmp(&b.ident))
    });

    // Compute the chunk item and size of each module
    let chunk_item_and_sizes = module_info_map
        .keys()
        .map(async |&module| {
            let chunk_item = attach_async_info_to_chunkable_module(
                module,
                async_module_info,
                module_graph,
                chunking_context,
            )
            .await?;
            let ty = chunk_item.chunk_item.ty();
            let size = *ty
                .chunk_item_size(chunking_context, *chunk_item.chunk_item, None)
                .await?;
            Ok((chunk_item, size))
        })
        .try_join()
        .await?;
    module_info_map
        .iter_mut()
        .zip(chunk_item_and_sizes)
        .for_each(|((_, info), (chunk_item, size))| {
            let info = info.as_mut().unwrap();
            info.size_bytes = size;
            info.chunk_item = Some(chunk_item);
        });

    // Build the pure-data inputs for the batching algorithm.
    // Each module gets a usize key (its index in the sorted module_info_map).
    let idx_to_vc: Vec<ResolvedVc<Box<dyn ChunkableModule>>> =
        module_info_map.keys().copied().collect();
    let vc_to_idx: FxHashMap<ResolvedVc<Box<dyn ChunkableModule>>, usize> = idx_to_vc
        .iter()
        .enumerate()
        .map(|(i, &vc)| (vc, i))
        .collect();

    let batching_module_info: FxIndexMap<usize, BatchingModuleInfo> = module_info_map
        .iter()
        .enumerate()
        .map(|(i, (_, info))| {
            let info = info.as_ref().unwrap();
            (
                i,
                BatchingModuleInfo {
                    style_type: info.style_type,
                    ident: info.ident.clone(),
                    chunk_group_indices: info.chunk_group_indices.clone(),
                    size_bytes: info.size_bytes,
                },
            )
        })
        .collect();

    let batching_chunk_group_styles: Vec<FxIndexSet<usize>> = chunk_group_state
        .iter()
        .map(|cgs| cgs.styles.iter().map(|vc| vc_to_idx[vc]).collect())
        .collect();

    // Run the pure batching algorithm
    let result = compute_style_batches(
        &batching_module_info,
        &batching_chunk_group_styles,
        config.max_chunk_size,
    );

    // Convert batches back to ChunkItemBatchWithAsyncModuleInfo
    let mut shared_chunk_items = FxIndexMap::default();
    for batch_keys in &result.batches {
        let chunk_items: Vec<ChunkItemWithAsyncModuleInfo> = batch_keys
            .iter()
            .map(|&k| {
                module_info_map[&idx_to_vc[k]]
                    .as_ref()
                    .unwrap()
                    .chunk_item
                    .as_ref()
                    .unwrap()
                    .clone()
            })
            .collect();
        let style_group = ChunkItemBatchWithAsyncModuleInfo::new(chunk_items.clone())
            .to_resolved()
            .await?;
        for chunk_item in chunk_items {
            shared_chunk_items.insert(chunk_item, style_group);
        }
    }

    Ok(StyleGroups { shared_chunk_items }.cell())
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use turbo_rcstr::RcStr;
    use turbo_tasks::{FxIndexMap, FxIndexSet};

    use super::{BatchingModuleInfo, compute_style_batches};
    use crate::module::StyleType;

    const ISO: StyleType = StyleType::IsolatedStyle;
    const GLOBAL: StyleType = StyleType::GlobalStyle;

    /// A named module definition for test inputs.
    struct Module {
        name: &'static str,
        style_type: StyleType,
        size_bytes: usize,
    }

    fn iso(name: &'static str, size_bytes: usize) -> Module {
        Module {
            name,
            style_type: ISO,
            size_bytes,
        }
    }

    fn global(name: &'static str, size_bytes: usize) -> Module {
        Module {
            name,
            style_type: GLOBAL,
            size_bytes,
        }
    }

    /// Test inputs ready for `compute_style_batches`, with name↔index mappings.
    struct TestInputs {
        module_info: FxIndexMap<usize, BatchingModuleInfo>,
        chunk_group_styles: Vec<FxIndexSet<usize>>,
        idx_to_name: HashMap<usize, &'static str>,
    }

    impl TestInputs {
        fn batches(&self, max_chunk_size: usize) -> Vec<Vec<&'static str>> {
            let result =
                compute_style_batches(&self.module_info, &self.chunk_group_styles, max_chunk_size);
            result
                .batches
                .iter()
                .map(|batch| batch.iter().map(|&idx| self.idx_to_name[&idx]).collect())
                .collect()
        }
    }

    /// Build test inputs from named modules and named routes.
    ///
    /// `modules`: list of named module definitions.
    /// `routes`: list of routes; each route is a list of module names in CSS cascade order.
    fn make_inputs(modules: &[Module], routes: &[&[&'static str]]) -> TestInputs {
        let name_to_idx: HashMap<&'static str, usize> = modules
            .iter()
            .enumerate()
            .map(|(i, m)| (m.name, i))
            .collect();
        let idx_to_name: HashMap<usize, &'static str> = modules
            .iter()
            .enumerate()
            .map(|(i, m)| (i, m.name))
            .collect();

        let mut module_info: FxIndexMap<usize, BatchingModuleInfo> = FxIndexMap::default();
        let mut index_sums: Vec<usize> = vec![0; modules.len()];

        for (i, m) in modules.iter().enumerate() {
            let mut cgi = FxIndexMap::default();
            for (cg_idx, route) in routes.iter().enumerate() {
                if let Some(pos) = route.iter().position(|&n| name_to_idx[n] == i) {
                    cgi.insert(cg_idx, pos);
                    index_sums[i] += pos;
                }
            }
            module_info.insert(
                i,
                BatchingModuleInfo {
                    style_type: m.style_type,
                    ident: RcStr::from(m.name),
                    chunk_group_indices: cgi,
                    size_bytes: m.size_bytes,
                },
            );
        }

        module_info.sort_by(|&ka, a, &kb, b| {
            index_sums[ka]
                .cmp(&index_sums[kb])
                .then_with(|| a.ident.cmp(&b.ident))
        });

        let chunk_group_styles: Vec<FxIndexSet<usize>> = routes
            .iter()
            .map(|r| r.iter().map(|&n| name_to_idx[n]).collect())
            .collect();

        TestInputs {
            module_info,
            chunk_group_styles,
            idx_to_name,
        }
    }

    #[test]
    fn basic_shared_modules() {
        let t = make_inputs(
            &[
                iso("common_a", 100),
                iso("common_b", 100),
                iso("only_0", 100),
                iso("only_1", 100),
            ],
            &[
                &["common_a", "common_b", "only_0"],
                &["common_a", "common_b", "only_1"],
            ],
        );

        assert_eq!(
            t.batches(1_000_000),
            vec![vec!["common_a", "common_b", "only_0", "only_1"]],
        );
        assert_eq!(t.batches(200), vec![vec!["common_a", "common_b"]],);
    }

    #[test]
    fn contiguity_with_intervening_modules() {
        let t = make_inputs(
            &[iso("A", 100), iso("B", 100), iso("C", 100), iso("D", 100)],
            &[&["A", "B", "C"], &["A", "D", "C"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["A", "B", "D", "C"]],);
        // Budget fits 2: A absorbs B. Then D+C form a second batch.
        assert_eq!(t.batches(250), vec![vec!["A", "B"], vec!["D", "C"]],);
    }

    #[test]
    fn interleaved_shared_and_unique() {
        let t = make_inputs(
            &[
                iso("shared1", 100),
                iso("unique_a", 100),
                iso("shared2", 100),
                iso("unique_a_final", 100),
                iso("unique_b", 100),
                iso("unique_b_final", 100),
            ],
            &[
                &["shared1", "unique_a", "shared2", "unique_a_final"],
                &["shared1", "unique_b", "shared2", "unique_b_final"],
            ],
        );

        assert_eq!(
            t.batches(1_000_000),
            vec![vec![
                "shared1",
                "unique_a",
                "unique_b",
                "shared2",
                "unique_a_final",
                "unique_b_final"
            ]],
        );
        // Budget fits 3: shared1 + 2 uniques, but shared2 is blocked by contiguity
        assert_eq!(
            t.batches(350),
            vec![vec!["shared1", "unique_a", "unique_b"]],
        );
    }

    #[test]
    fn global_css_no_leak() {
        let t = make_inputs(
            &[iso("mod_a", 100), global("g", 100)],
            &[&["mod_a", "g"], &["mod_a"]],
        );

        // Global CSS must not leak into route 1 which doesn't import it
        assert_eq!(t.batches(1_000_000), Vec::<Vec<&str>>::new());
    }

    #[test]
    fn global_css_batches_with_same_routes() {
        let t = make_inputs(
            &[global("g", 100), iso("mod_a", 100)],
            &[&["g", "mod_a"], &["g", "mod_a"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["g", "mod_a"]]);
    }

    #[test]
    fn size_budget() {
        let t = make_inputs(
            &[iso("A", 300), iso("B", 300), iso("C", 300)],
            &[&["A", "B", "C"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["A", "B", "C"]],);
        // A+B=600 fits in 700, but A+B+C=900 doesn't
        assert_eq!(t.batches(700), vec![vec!["A", "B"]],);
        // Each module alone exceeds budget — no batches
        assert_eq!(t.batches(200), Vec::<Vec<&str>>::new());
    }

    #[test]
    fn contiguity_absorbs_intervening() {
        let t = make_inputs(
            &[iso("A", 100), iso("B", 100), iso("C", 100)],
            &[&["A", "B", "C"], &["A", "C"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["A", "B", "C"]],);
        // Budget fits 2: A absorbs B, but C is blocked (contiguous in route 1 but
        // budget exhausted)
        assert_eq!(t.batches(250), vec![vec!["A", "B"]],);
    }

    #[test]
    fn three_routes_contiguity_blocked() {
        let t = make_inputs(
            &[iso("A", 100), iso("B", 100), iso("C", 100), iso("D", 100)],
            &[&["A", "B", "C"], &["A", "C"], &["A", "D", "C"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["A", "B", "D", "C"]],);
        // Budget fits 2: A absorbs B. Then D+C form a second batch.
        assert_eq!(t.batches(250), vec![vec!["A", "B"], vec!["D", "C"]],);
    }

    #[test]
    fn reverse_direction_contiguity() {
        let t = make_inputs(
            &[iso("A", 100), iso("B", 100), iso("X", 100)],
            &[&["A", "B"], &["B", "X", "A"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["B", "X", "A"]],);
        // Budget fits 2: B absorbs X, but A is blocked by size
        assert_eq!(t.batches(250), vec![vec!["B", "X"]],);
    }

    #[test]
    fn newly_introduced_route_contiguity() {
        let t = make_inputs(
            &[
                iso("P", 100),
                iso("Q", 100),
                iso("W", 10_000),
                iso("R", 100),
            ],
            &[&["Q", "W", "R"], &["P", "Q", "R"]],
        );

        // W is too large to absorb, so R can't join {P, Q} — W blocks the gap in route 0
        assert_eq!(t.batches(500), vec![vec!["P", "Q"]],);
        // With unlimited budget, W gets absorbed and R becomes contiguous
        assert_eq!(t.batches(1_000_000), vec![vec!["P", "Q", "W", "R"]],);
    }

    #[test]
    fn newly_introduced_route_clear_gap() {
        let t = make_inputs(
            &[iso("P", 100), iso("Q", 100), iso("R", 100)],
            &[&["Q", "R"], &["P", "Q", "R"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["P", "Q", "R"]],);
        assert_eq!(t.batches(250), vec![vec!["P", "Q"]],);
    }

    #[test]
    fn dependency_ordering_prevents_batching() {
        // Route: [A, B] — A is a dependency of B (A appears before B in all shared routes).
        // B cannot be added to a batch that already contains A's dependent, because that
        // would violate cascade order. Here B depends on A, so A is added first as seed,
        // then B is a candidate. B's dependents don't include A (A depends on nothing),
        // so B can join. But if we reverse: [B, A] in two routes where the dependency
        // is B→A, the dependent check fires.
        //
        // Route 0: [X, Y]   Route 1: [X, Z, Y]
        // X is dep of Y. Z is dep of Y. X is dep of Z.
        // If X is seed and absorbs Z, then Y's dependents include Z which is in batch → blocked.
        let t = make_inputs(
            &[iso("X", 100), iso("Y", 100), iso("Z", 100)],
            &[&["X", "Y"], &["X", "Z", "Y"]],
        );

        assert_eq!(t.batches(1_000_000), vec![vec!["X", "Z", "Y"]],);
        // Budget fits 2: X absorbs Z. Y is blocked because its dependency Z is in the batch
        // and Y depends on Z (Y must come after Z), but the dep check blocks adding Y when
        // Z is already present. Actually — the dep check prevents adding a module whose
        // *dependent* is already in the batch, not whose *dependency* is. Y has no dependents
        // in the batch. Let's verify:
        assert_eq!(t.batches(250), vec![vec!["X", "Z"]],);
    }
}
