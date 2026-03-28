use std::cmp::Reverse;

use anyhow::Result;
use bincode::{Decode, Encode};
use indexmap::map::Entry;
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
    /// Sum of all position indices across chunk groups, used for sorting modules.
    /// Lower values mean the module tends to appear earlier in chunk groups.
    index_sum: usize,
    /// The byte size of this module's CSS output, used for chunk size budgeting.
    size: usize,
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
            size: 0,
            chunk_item: None,
        }
    }
}

/// State for a single chunk group during style batching.
///
/// A chunk group typically corresponds to a route/page and contains all CSS modules
/// needed by that route in their correct cascade order (postorder DFS traversal).
struct ChunkGroupState {
    /// CSS modules in this chunk group, in postorder traversal order.
    /// The order here determines the correct CSS cascade order.
    styles: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
}

/// Pure-data version of [`ModuleInfo`] for the batching algorithm. Free of Vc types so it can be
/// used in unit tests without a turbo-tasks runtime.
#[derive(Debug)]
pub(crate) struct BatchingModuleInfo {
    pub style_type: StyleType,
    pub ident: RcStr,
    pub chunk_group_indices: FxIndexMap<usize, usize>,
    pub size: usize,
}

/// Result of the pure batching algorithm. Each batch is a `Vec<usize>` of module keys that should
/// share a single CSS chunk. Only multi-module batches are included.
pub(crate) struct BatchingResult {
    pub batches: Vec<Vec<usize>>,
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
pub(crate) fn compute_style_batches(
    module_info: &FxIndexMap<usize, BatchingModuleInfo>,
    chunk_group_styles: &[FxIndexSet<usize>],
    max_chunk_size: usize,
) -> BatchingResult {
    // --- Compute the dependents of each module ---
    // A module X is a dependency of module Y if X appears before Y in ALL chunk groups where both
    // appear. We need to check all chunk groups, not just the shortest one.
    let mut module_dependents: FxHashMap<usize, FxHashSet<usize>> = FxHashMap::default();
    for (&module_key, info) in module_info {
        let mut dependents = FxHashSet::default();
        for (&cg_idx, &start_pos) in &info.chunk_group_indices {
            let following = &chunk_group_styles[cg_idx].as_slice()[start_pos + 1..];
            dependents.extend(following.iter().copied());
        }

        // module is a dependency of dependent when it's included in all chunk groups of
        // dependent with an index lower than the index of the dependent
        dependents.retain(|&dep_key| {
            let dep_info = &module_info[&dep_key];
            info.chunk_group_indices.len() >= dep_info.chunk_group_indices.len()
                && dep_info
                    .chunk_group_indices
                    .iter()
                    .all(|(cg_idx, &dep_pos)| {
                        info.chunk_group_indices
                            .get(cg_idx)
                            .is_some_and(|&mod_pos| mod_pos < dep_pos)
                    })
        });

        if !dependents.is_empty() {
            module_dependents.insert(module_key, dependents);
        }
    }

    // --- Greedy batching loop ---
    let mut chunk_group_requests: Vec<usize> = chunk_group_styles.iter().map(|s| s.len()).collect();

    let mut processed: FxIndexMap<usize, bool> =
        module_info.keys().copied().map(|k| (k, false)).collect();

    let mut batches: Vec<Vec<usize>> = Vec::new();

    for i in 0..processed.len() {
        let (&module_key, is_processed) = processed.get_index_mut(i).unwrap();
        if *is_processed {
            continue;
        }
        *is_processed = true;

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
        let mut current_size = info.size;

        // A pool of potential modules where the next module is selected from.
        // It's filled from the next module of the selected modules in every chunk group.
        let mut potential_next = all_chunk_states
            .iter()
            .filter_map(|(&cg_idx, &pos)| {
                let following = &chunk_group_styles[cg_idx].as_slice()[pos + 1..];
                following
                    .iter()
                    .find(|&m| !*processed.get(m).unwrap())
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
                .map(|m| {
                    let mi = &module_info[&m];
                    let max_req = mi
                        .chunk_group_indices
                        .keys()
                        .filter(|&cg| all_chunk_states.contains_key(cg))
                        .map(|&cg| chunk_group_requests[cg])
                        .max()
                        .unwrap();
                    (m, mi, max_req)
                })
                .collect();
            candidates.sort_by_key(|(_, mi, req)| (Reverse(*req), &mi.ident));

            // Try every potential module
            for (m, mi, _) in candidates {
                if current_size + mi.size > max_chunk_size {
                    // Chunk would be too large
                    continue;
                }
                // In loose mode we only check if the dependencies are not violated
                if let Some(deps) = module_dependents.get(&m)
                    && deps.iter().any(|d| new_batch.contains(d))
                {
                    // A dependent of the module is already in the chunk, which would violate
                    // the order
                    continue;
                }

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
                        for &between in &chunk_group_styles[r_idx].as_slice()[lo..hi] {
                            if new_batch.contains(&between) {
                                continue;
                            }
                            if *processed.get(&between).unwrap_or(&false) {
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
                current_size += mi.size;
                if is_global {
                    global_mode = true;
                }
                for &cg_idx in mi.chunk_group_indices.keys() {
                    // Always decrement: the candidate is absorbed regardless of whether
                    // this chunk group was already tracked by the batch.
                    chunk_group_requests[cg_idx] -= 1;

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
                        .find(|&x| !*processed.get(x).unwrap() && !new_batch.contains(x))
                    {
                        potential_next.insert(next);
                    }
                }

                new_batch.insert(m);
                *processed.get_mut(&m).unwrap() = true;
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

    module_info_map.sort_by(|_, a, _, b| {
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
            info.size = size;
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
                    size: info.size,
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
    use rustc_hash::FxHashSet;
    use turbo_rcstr::RcStr;
    use turbo_tasks::{FxIndexMap, FxIndexSet};

    use super::{BatchingModuleInfo, compute_style_batches};
    use crate::module::StyleType;

    /// Helper to build test inputs concisely.
    ///
    /// - `modules`: list of `(style_type, size)`. The index in the vec is the module key.
    /// - `routes`: list of routes; each route is a list of module keys in CSS cascade order.
    ///
    /// Returns `(module_info, chunk_group_styles)` ready for `compute_style_batches`.
    fn make_inputs(
        modules: &[(StyleType, usize)],
        routes: &[&[usize]],
    ) -> (
        FxIndexMap<usize, BatchingModuleInfo>,
        Vec<FxIndexSet<usize>>,
    ) {
        let mut module_info: FxIndexMap<usize, BatchingModuleInfo> = FxIndexMap::default();
        // Compute index_sum per module for sorting (mirrors compute_style_groups behavior).
        let mut index_sums: Vec<usize> = vec![0; modules.len()];
        for (i, &(style_type, size)) in modules.iter().enumerate() {
            let mut cgi = FxIndexMap::default();
            for (cg_idx, route) in routes.iter().enumerate() {
                if let Some(pos) = route.iter().position(|&m| m == i) {
                    cgi.insert(cg_idx, pos);
                    index_sums[i] += pos;
                }
            }
            module_info.insert(
                i,
                BatchingModuleInfo {
                    style_type,
                    ident: RcStr::from(format!("mod_{i}")),
                    chunk_group_indices: cgi,
                    size,
                },
            );
        }
        // Sort by (index_sum, ident) to match what compute_style_groups does.
        module_info.sort_by(|&ka, a, &kb, b| {
            index_sums[ka]
                .cmp(&index_sums[kb])
                .then_with(|| a.ident.cmp(&b.ident))
        });
        let styles: Vec<FxIndexSet<usize>> =
            routes.iter().map(|r| r.iter().copied().collect()).collect();
        (module_info, styles)
    }

    /// Helper: check if any batch contains all of the given modules.
    fn batch_contains_all(batches: &[Vec<usize>], modules: &[usize]) -> bool {
        batches.iter().any(|batch| {
            let set: FxHashSet<usize> = batch.iter().copied().collect();
            modules.iter().all(|m| set.contains(m))
        })
    }

    // ---- Basic batching — contiguous shared modules batch together ----

    #[test]
    fn test_basic_shared_modules_batch_together() {
        // Route 0: [common_a(0), common_b(1), only_0(2)]
        // Route 1: [common_a(0), common_b(1), only_1(3)]
        //
        // common_a and common_b are contiguous and shared — they should batch.
        // only_0 and only_1 are contiguous with common_b in their respective routes,
        // so the greedy algorithm may absorb them too. The key assertion is that
        // common_a and common_b are in the same batch.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100), (iso, 100)],
            &[&[0, 1, 2], &[0, 1, 3]],
        );
        let result = compute_style_batches(&info, &styles, 1_000_000);

        assert!(
            batch_contains_all(&result.batches, &[0, 1]),
            "common_a and common_b should be batched together, got: {:?}",
            result.batches
        );
    }

    // ---- Contiguity + size budget prevents skipping intervening modules ----

    #[test]
    fn test_contiguity_with_size_budget_prevents_skipping_intervening() {
        // Route 0: [A(0), B(1), C(2)]
        // Route 1: [A(0), D(3), C(2)]
        //
        // A and C are shared. B and D sit between them in each route.
        // With a size budget that allows only 2 modules, A can absorb B or D but
        // not both plus C. The contiguity check prevents C from being added when
        // the gap still has unprocessed modules.
        //
        // A(size=100) is the seed. Budget = 250 allows one more module (200 total).
        // B gets absorbed (200 <= 250). D is unprocessed in route 1's gap.
        // C cannot be added: route 1 gap [D] is unprocessed AND 300 > 250.
        // Result: batch {A, B}, then D solo, then C solo.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100), (iso, 100)],
            &[&[0, 1, 2], &[0, 3, 2]],
        );
        let result = compute_style_batches(&info, &styles, 250);

        assert!(
            !batch_contains_all(&result.batches, &[0, 2]),
            "A and C must NOT be in the same batch (size budget prevents absorbing all \
             intervening modules), got: {:?}",
            result.batches
        );
    }

    // ---- Interleaved shared/unique modules: all absorbed with unlimited budget ----

    #[test]
    fn test_interleaved_shared_unique_all_absorbed() {
        // Route A: [shared1(0), unique_a(1), shared2(2), unique_a_final(3)]
        // Route B: [shared1(0), unique_b(4), shared2(2), unique_b_final(5)]
        //
        // With unlimited budget, the greedy algorithm absorbs everything into one batch.
        // This is correct because the single chunk can order items to satisfy both routes.
        // The contiguity check ensures shared2 is NOT added until unique_b is absorbed.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[
                (iso, 100),
                (iso, 100),
                (iso, 100),
                (iso, 100),
                (iso, 100),
                (iso, 100),
            ],
            &[&[0, 1, 2, 3], &[0, 4, 2, 5]],
        );
        let result = compute_style_batches(&info, &styles, 1_000_000);

        // All modules end up in one batch because they can all be absorbed.
        assert_eq!(
            result.batches.len(),
            1,
            "All modules should form a single batch, got: {:?}",
            result.batches
        );
        assert!(
            batch_contains_all(&result.batches, &[0, 1, 2, 3, 4, 5]),
            "Batch should contain all modules, got: {:?}",
            result.batches
        );
    }

    // ---- Interleaved shared/unique modules: size budget prevents full absorption ----

    #[test]
    fn test_interleaved_shared_unique_size_limited() {
        // Route A: [shared1(0), unique_a(1), shared2(2), unique_a_final(3)]
        // Route B: [shared1(0), unique_b(4), shared2(2), unique_b_final(5)]
        //
        // Budget = 350 (allows at most 3 modules of size 100).
        // shared1 is the seed. It absorbs unique_a (or unique_b), but then shared2
        // is blocked by contiguity (the other unique is in the gap) and by size
        // (adding more would exceed 350). shared1 and shared2 end up in separate chunks.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[
                (iso, 100),
                (iso, 100),
                (iso, 100),
                (iso, 100),
                (iso, 100),
                (iso, 100),
            ],
            &[&[0, 1, 2, 3], &[0, 4, 2, 5]],
        );
        let result = compute_style_batches(&info, &styles, 350);

        assert!(
            !batch_contains_all(&result.batches, &[0, 2]),
            "shared1 and shared2 must NOT be in the same batch (size limit prevents absorbing all \
             intervening modules), got: {:?}",
            result.batches
        );
    }

    // ---- Global CSS doesn't leak into routes that don't have it ----

    #[test]
    fn test_global_css_no_leak_into_new_route() {
        // Route 0: [mod_a(0), global(1)]
        // Route 1: [mod_a(0)]
        //
        // mod_a appears in both routes; global only in route 0.
        // They must NOT batch because global CSS would leak into route 1.
        let iso = StyleType::IsolatedStyle;
        let global = StyleType::GlobalStyle;
        let (info, styles) = make_inputs(&[(iso, 100), (global, 100)], &[&[0, 1], &[0]]);
        let result = compute_style_batches(&info, &styles, 1_000_000);

        assert!(
            !batch_contains_all(&result.batches, &[0, 1]),
            "mod_a and global must NOT batch (global would leak into route 1), got: {:?}",
            result.batches
        );
    }

    // ---- Global CSS can batch with modules sharing exact same routes ----

    #[test]
    fn test_global_css_batches_with_same_routes() {
        // Route 0: [global(0), mod_a(1)]
        // Route 1: [global(0), mod_a(1)]
        //
        // Both modules appear in exactly the same routes — safe to batch.
        let iso = StyleType::IsolatedStyle;
        let global = StyleType::GlobalStyle;
        let (info, styles) = make_inputs(&[(global, 100), (iso, 100)], &[&[0, 1], &[0, 1]]);
        let result = compute_style_batches(&info, &styles, 1_000_000);

        assert!(
            batch_contains_all(&result.batches, &[0, 1]),
            "global and mod_a should batch (identical route sets), got: {:?}",
            result.batches
        );
    }

    // ---- Size budget limits batch membership ----

    #[test]
    fn test_size_budget_limits_batching() {
        // Route 0: [A(0), B(1), C(2)]
        // All in same route, contiguous. A+B = 600 fits in 700; A+B+C = 900 > 700.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(&[(iso, 300), (iso, 300), (iso, 300)], &[&[0, 1, 2]]);
        let result = compute_style_batches(&info, &styles, 700);

        // A+B should batch (600 <= 700)
        assert!(
            batch_contains_all(&result.batches, &[0, 1]),
            "A and B should batch (600 <= 700), got: {:?}",
            result.batches
        );
        // C should NOT be in the same batch (would push to 900)
        let ab_batch = result
            .batches
            .iter()
            .find(|b| b.contains(&0) && b.contains(&1))
            .unwrap();
        assert!(
            !ab_batch.contains(&2),
            "C should not be in the A+B batch (would exceed size budget)"
        );
    }

    // ---- Oversized modules never batch ----

    #[test]
    fn test_oversized_modules_never_batch() {
        // Route 0: [A(0), B(1)]
        // Both are 1000 bytes, budget is 500. Seed A starts at 1000, B can't fit.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(&[(iso, 1000), (iso, 1000)], &[&[0, 1]]);
        let result = compute_style_batches(&info, &styles, 500);

        assert!(
            result.batches.is_empty(),
            "No batches should be formed when all modules exceed budget, got: {:?}",
            result.batches
        );
    }

    // ---- Contiguity allows absorbing all intervening modules ----

    #[test]
    fn test_contiguity_absorbs_intervening_modules() {
        // Route 0: [A(0), B(1), C(2)]
        // Route 1: [A(0), C(2)]
        //
        // B is between A and C in route 0. With unlimited budget, the greedy algorithm
        // absorbs B first (it's contiguous with A), then C becomes contiguous in both
        // routes and is also absorbed. All three end up in one batch.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100)],
            &[&[0, 1, 2], &[0, 2]],
        );
        let result = compute_style_batches(&info, &styles, 1_000_000);

        assert!(
            batch_contains_all(&result.batches, &[0, 1, 2]),
            "All three modules should be absorbed into one batch, got: {:?}",
            result.batches
        );
    }

    // ---- Three routes: contiguity blocks when intervening can't be absorbed ----

    #[test]
    fn test_three_routes_size_limited() {
        // Route 0: [A(0), B(1), C(2)]
        // Route 1: [A(0), C(2)]
        // Route 2: [A(0), D(3), C(2)]
        //
        // With budget = 250 (allows 2 modules of size 100), A absorbs B (contiguous
        // in route 0). D is in route 2's gap but can't be absorbed (size 300 > 250).
        // C is blocked by contiguity (D is unprocessed in route 2 gap).
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100), (iso, 100)],
            &[&[0, 1, 2], &[0, 2], &[0, 3, 2]],
        );
        let result = compute_style_batches(&info, &styles, 250);

        assert!(
            !batch_contains_all(&result.batches, &[0, 2]),
            "A and C must NOT be in the same batch (D blocks contiguity + size), got: {:?}",
            result.batches
        );
    }

    // ---- Contiguity check handles the m_pos < watermark direction ----

    #[test]
    fn test_contiguity_reverse_direction() {
        // Route 0: [A(0), B(1)]
        // Route 1: [B(1), X(2), A(0)]
        //
        // In route 1, A appears AFTER B and X. If B is the seed and A is a candidate,
        // the contiguity check must verify the reverse gap (A's pos < watermark).
        // X sits between A and B in route 1 and is unprocessed → A should not be batched
        // with B (unless X is absorbed first).
        //
        // Module sort order: A(sum=0+2=2), B(sum=1+0=1), X(sum=1).
        // B and X have same index_sum=1; B is "mod_1", X is "mod_2". So order: B, X, A.
        //
        // Seed: B. all_chunk_states = {0: 1, 1: 0}.
        // Pool: route 0 after pos 1 → nothing. Route 1 after pos 0 → X(2). Pool = {2}.
        // X contiguity: route 1, watermark=0, m_pos=1. Gap [1..1] = empty ✓. Accepted.
        // all_chunk_states = {0: 1, 1: 1}. Pool: route 1 after pos 1 → A(0). Pool = {0}.
        // A contiguity: route 0, watermark=1, m_pos=0. Gap [1..1] = empty ✓.
        //               route 1, watermark=1, m_pos=2. Gap [2..2] = empty ✓.
        // A accepted. Batch = {0, 1, 2}.
        //
        // With unlimited budget, all three module are absorbed.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100)],
            &[&[0, 1], &[1, 2, 0]],
        );
        let result = compute_style_batches(&info, &styles, 1_000_000);

        assert!(
            batch_contains_all(&result.batches, &[0, 1, 2]),
            "All modules should batch when contiguous, got: {:?}",
            result.batches
        );
    }

    // ---- Reverse-direction contiguity blocked by size limit ----

    #[test]
    fn test_contiguity_reverse_direction_blocked() {
        // Route 0: [B(1), A(0)]
        // Route 1: [B(1), X(2), A(0)]
        //
        // Budget = 250 (2 modules of size 100 max).
        // Seed: B (index_sum=0). all_chunk_states = {0: 0, 1: 0}.
        // Pool: route 0 after pos 0 → A. Route 1 after pos 0 → X. Pool = {0, 2}.
        // Try A: route 1 watermark=0, m_pos=2. Gap [1..2] = [X]. X unprocessed → blocked!
        // Try X: route 0 → X not in route 0. No constraint. Accepted.
        // all_chunk_states = {0: 0, 1: 1}. Size = 200. Pool = {0}.
        // Try A: size 300 > 250 → blocked by size.
        // Batch = {B, X}. A is solo.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100)],
            &[&[1, 0], &[1, 2, 0]],
        );
        let result = compute_style_batches(&info, &styles, 250);

        assert!(
            !batch_contains_all(&result.batches, &[0, 1]),
            "B and A should NOT be in the same batch (size prevents absorbing X), got: {:?}",
            result.batches
        );
    }

    // ---- Newly-introduced route: contiguity still enforced ----

    #[test]
    fn test_newly_introduced_route_contiguity_enforced() {
        // Route 0 (X): [Q(1), W(2), R(3)]
        // Route 1 (Y): [P(0), Q(1), R(3)]
        //
        // Seed: P (only in Y). all_chunk_states = {Y: 0}.
        // Q: route Y watermark=0, m_pos=1, gap empty → OK. Route X not tracked → skip.
        //    Accepted. all_chunk_states = {Y: 1, X: 0}.
        // W: size 10_000 exceeds budget → can't be absorbed.
        // R: route Y watermark=1, m_pos=2, gap empty → OK.
        //    Route X watermark=0, m_pos=2, gap [1..2] = [W]. W unprocessed → BLOCKED.
        //
        // R must NOT join {P, Q} because W blocks the gap in route X.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 10_000), (iso, 100)],
            &[&[1, 2, 3], &[0, 1, 3]],
        );
        let result = compute_style_batches(&info, &styles, 500);

        assert!(
            !batch_contains_all(&result.batches, &[0, 1, 3]),
            "R must not join P+Q batch: W blocks the gap in route X, got: {:?}",
            result.batches
        );
        assert!(
            batch_contains_all(&result.batches, &[0, 1]),
            "P and Q should batch (Q introduces route X at pos 0, no gap), got: {:?}",
            result.batches
        );
    }

    // ---- Newly-introduced route: correct absorption when gap is clear ----

    #[test]
    fn test_newly_introduced_route_absorbs_correctly() {
        // Route 0 (X): [Q(1), R(2)]   — no gap modules
        // Route 1 (Y): [P(0), Q(1), R(2)]
        //
        // Seed: P. Q introduces route X. R is contiguous in both routes.
        // All three should end up in one batch.
        let iso = StyleType::IsolatedStyle;
        let (info, styles) = make_inputs(
            &[(iso, 100), (iso, 100), (iso, 100)],
            &[&[1, 2], &[0, 1, 2]],
        );
        let result = compute_style_batches(&info, &styles, 1_000_000);

        assert!(
            batch_contains_all(&result.batches, &[0, 1, 2]),
            "P, Q, and R should all batch when no gap modules block them, got: {:?}",
            result.batches
        );
    }
}
