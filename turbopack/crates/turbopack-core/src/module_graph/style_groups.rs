use std::cmp::Reverse;

use anyhow::Result;
use indexmap::map::Entry;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
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
    TaskInput, Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, NonLocalValue, TraceRawVcs,
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
    pub shared_chunk_items:
        FxIndexMap<ChunkItemWithAsyncModuleInfo, ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>>,
}

#[derive(Debug)]
struct ModuleInfo {
    style_type: StyleType,
    ident: RcStr,
    chunk_group_indices: FxHashMap<usize, usize>,
    index_sum: usize,
    size: usize,
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

struct ChunkGroupState {
    styles: FxIndexSet<ResolvedVc<Box<dyn ChunkableModule>>>,
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
    let async_info = module_graph.async_module_info().await?;
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
    let mut module_dependents: FxHashMap<_, Vec<_>> = FxHashMap::default();
    for (&module, info) in &module_info_map {
        let info = info.as_ref().unwrap();
        // Find the shortest chunk group as it's most efficient to iterate
        let (&idx, &start_pos) = info
            .chunk_group_indices
            .iter()
            .min_by_key(|&(&idx, _)| chunk_group_state[idx].styles.len())
            .unwrap();
        let potential_dependents = &chunk_group_state[idx].styles[start_pos + 1..];

        let dependents = potential_dependents
            .iter()
            .copied()
            .filter(|dependent| {
                let dependent_info = module_info_map.get(dependent).unwrap();
                let dependent_info = dependent_info.as_ref().unwrap();

                // module is a dependency of dependent when it's included in all chunk groups of
                // dependent with an index lower than the index of the dependent
                info.chunk_group_indices.len() >= dependent_info.chunk_group_indices.len()
                    && dependent_info
                        .chunk_group_indices
                        .iter()
                        .all(|(idx, &dependent_pos)| {
                            info.chunk_group_indices
                                .get(idx)
                                .is_some_and(|&module_pos| module_pos < dependent_pos)
                        })
            })
            .collect::<Vec<_>>();

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
                &async_info,
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
                        .filter(|idx| all_chunk_states.contains_key(idx))
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

    Ok(StyleGroups { shared_chunk_items }.cell())
}
