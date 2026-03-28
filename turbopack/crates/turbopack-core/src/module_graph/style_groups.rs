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

/// Maps each CSS module to the set of CSS modules that must be emitted after it.
pub type ModuleDependents = FxHashMap<
    ResolvedVc<Box<dyn ChunkableModule>>,
    FxHashSet<ResolvedVc<Box<dyn ChunkableModule>>>,
>;

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
    /// For each CSS module, the set of CSS modules that must be emitted after it (its dependents
    /// in cascade order). A module X maps to {Y, Z, ...} meaning X must be loaded before Y and Z.
    ///
    /// This is used by `style_production.rs` to topologically sort emission units (shared batches
    /// and non-shared items) into a correct CSS cascade order, taking into account that a shared
    /// batch may group items whose DFS post-order positions interleave with non-shared items.
    pub module_dependents: ModuleDependents,
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
    /// Number of CSS requests remaining for this chunk group.
    /// Decremented as modules are assigned to shared chunks.
    requests: usize,
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
            chunk_group_state.push(ChunkGroupState {
                requests: styles.len(),
                styles,
            });
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

    // Compute the dependents of each module
    // A module X is a dependency of module Y if X appears before Y in ALL chunk groups where both
    // appear. We need to check all chunk groups, not just the shortest one.
    let mut module_dependents: FxHashMap<_, FxHashSet<_>> = FxHashMap::default();
    for (&module, info) in &module_info_map {
        let info = info.as_ref().unwrap();

        // Collect potential dependents from ALL chunk groups this module appears in
        let mut dependents = FxHashSet::default();
        for (&idx, &start_pos) in &info.chunk_group_indices {
            let following_styles = &chunk_group_state[idx].styles[start_pos + 1..];
            dependents.extend(following_styles.iter().copied());
        }

        // module is a dependency of dependent when it's included in all chunk groups of
        // dependent with an index lower than the index of the dependent
        dependents.retain(|dependent| {
            let dependent_info = module_info_map.get(dependent).unwrap();
            let dependent_info = dependent_info.as_ref().unwrap();

            info.chunk_group_indices.len() >= dependent_info.chunk_group_indices.len()
                && dependent_info
                    .chunk_group_indices
                    .iter()
                    .all(|(idx, &dependent_pos)| {
                        info.chunk_group_indices
                            .get(idx)
                            .is_some_and(|&module_pos| module_pos < dependent_pos)
                    })
        });

        if !dependents.is_empty() {
            module_dependents.insert(module, dependents);
        }
    }

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

    let mut ordered_modules_with_state = module_info_map
        .keys()
        .copied()
        .map(|m| (m, false))
        .collect::<FxIndexMap<_, _>>();

    let mut shared_chunk_items = FxIndexMap::default();
    for i in 0..ordered_modules_with_state.len() {
        let (&module, processed) = ordered_modules_with_state.get_index_mut(i).unwrap();
        if *processed {
            continue;
        }
        *processed = true;

        let info = module_info_map.get(&module).unwrap().as_ref().unwrap();
        let mut global_mode = info.style_type == StyleType::GlobalStyle;

        // The current position of processing in all selected chunk groups
        let mut all_chunk_states = info.chunk_group_indices.clone();

        // The list of modules and chunk items that go into the new chunk
        let mut new_chunk_modules = [module].into_iter().collect::<FxHashSet<_>>();
        let mut new_chunk_items = vec![info.chunk_item.as_ref().unwrap().clone()];

        // The current size of the new chunk
        let mut current_size = info.size;

        // A pool of potential modules where the next module is selected from.
        // It's filled from the next module of the selected modules in every chunk group.
        let mut potential_next_modules = all_chunk_states
            .iter()
            .filter_map(|(&idx, pos)| {
                let following_styles = &chunk_group_state[idx].styles[pos + 1..];
                let i = following_styles
                    .iter()
                    .position(|m| !*ordered_modules_with_state.get(m).unwrap());
                i.map(|i| following_styles[i])
            })
            .collect::<FxHashSet<_>>();

        // Try to add modules to the chunk until a break condition is met
        'outer: loop {
            // We try to select a module that reduces request count and
            // has the highest number of requests
            let mut ordered_potential_next_modules = potential_next_modules
                .iter()
                .copied()
                .map(|module| {
                    let info = module_info_map.get(&module).unwrap().as_ref().unwrap();
                    let requests = info
                        .chunk_group_indices
                        .keys()
                        .filter(|&idx| all_chunk_states.contains_key(idx))
                        .map(|&idx| chunk_group_state[idx].requests)
                        .max()
                        .unwrap();
                    (module, info, requests)
                })
                .collect::<Vec<_>>();
            ordered_potential_next_modules
                .sort_by_key(|(_, info, requests)| (Reverse(*requests), &info.ident));

            // Try every potential module
            for (module, info, _) in ordered_potential_next_modules {
                if current_size + info.size > config.max_chunk_size {
                    // Chunk would be too large
                    continue;
                }
                // In loose mode we only check if the dependencies are not violated
                if let Some(dependents) = module_dependents.get(&module)
                    && dependents.iter().any(|m| new_chunk_modules.contains(m))
                {
                    // A dependent of the module is already in the chunk, which would violate
                    // the order
                    continue;
                }

                // Global CSS must not leak into unrelated chunks
                let is_global = info.style_type == StyleType::GlobalStyle;
                if is_global
                    && global_mode
                    && all_chunk_states.len() != info.chunk_group_indices.len()
                {
                    // Fast check: chunk groups need to be identical
                    continue;
                }
                if global_mode
                    && info
                        .chunk_group_indices
                        .keys()
                        .any(|idx| !all_chunk_states.contains_key(idx))
                {
                    // Global CSS in new_chunk_items would leak into new chunk_group
                    continue;
                }
                if is_global
                    && all_chunk_states
                        .keys()
                        .any(|idx| !info.chunk_group_indices.contains_key(idx))
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
                    'contiguity: for (&r_idx, &m_pos) in &info.chunk_group_indices {
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
                        let styles = &chunk_group_state[r_idx].styles;
                        for between in &styles[lo..hi] {
                            if new_chunk_modules.contains(between) {
                                continue;
                            }
                            if *ordered_modules_with_state.get(between).unwrap_or(&false) {
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
                potential_next_modules.remove(&module);
                current_size += info.size;
                if is_global {
                    global_mode = true;
                }
                for &idx in info.chunk_group_indices.keys() {
                    if all_chunk_states.contains_key(&idx) {
                        // This reduces the request count of the chunk group
                        chunk_group_state[idx].requests -= 1;
                    }
                    let pos = chunk_group_state[idx].styles.get_index_of(&module).unwrap();
                    all_chunk_states.insert(idx, pos);
                    let following_styles = &chunk_group_state[idx].styles[pos + 1..];
                    if let Some(i) = following_styles.iter().position(|m| {
                        !*ordered_modules_with_state.get(m).unwrap()
                            && !new_chunk_modules.contains(m)
                    }) {
                        let module = following_styles[i];
                        potential_next_modules.insert(module);
                    }
                }

                new_chunk_items.push(info.chunk_item.as_ref().unwrap().clone());
                new_chunk_modules.insert(module);
                *ordered_modules_with_state.get_mut(&module).unwrap() = true;
                continue 'outer;
            }
            break;
        }

        if new_chunk_items.len() > 1 {
            let style_group = ChunkItemBatchWithAsyncModuleInfo::new(new_chunk_items.clone())
                .to_resolved()
                .await?;
            for chunk_item in new_chunk_items {
                shared_chunk_items.insert(chunk_item, style_group);
            }
        }
    }

    Ok(StyleGroups {
        shared_chunk_items,
        module_dependents,
    }
    .cell())
}
