use std::cmp::Reverse;

use anyhow::Result;
use bincode::{Decode, Encode};
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, Vc, trace::TraceRawVcs};

use crate::{
    chunk::{ChunkItemBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkingContext},
    module::StyleType,
    module_graph::{
        ModuleGraph,
        style_groups::{StyleCollection, collect_style_modules_per_chunk_group},
    },
};

/// Wrapper around an `f32` that implements [`TaskInput`] (and the other derives the
/// `StyleGroupsAlgorithm` enum needs) by going through the IEEE-754 bit pattern. Use
/// [`F32TaskInput::get`] / [`F32TaskInput::from`] at the boundary; do not match on the inner
/// `u32` directly.
#[derive(
    TaskInput, Debug, Clone, Copy, PartialEq, Eq, Hash, NonLocalValue, TraceRawVcs, Encode, Decode,
)]
pub struct F32TaskInput(u32);

impl F32TaskInput {
    pub const fn from(value: f32) -> Self {
        Self(value.to_bits())
    }
    pub const fn get(self) -> f32 {
        f32::from_bits(self.0)
    }
}

/// Selects the algorithm used to compute [`StyleGroups`].
#[derive(
    TaskInput,
    Debug,
    Clone,
    Default,
    PartialEq,
    Eq,
    Hash,
    NonLocalValue,
    TraceRawVcs,
    Encode,
    Decode,
)]
pub enum StyleGroupsAlgorithm {
    /// Default ("loose") algorithm, see [`compute_style_groups`].
    #[default]
    Default,
    /// Graph-analysis based algorithm, see
    /// [`crate::module_graph::style_groups_graph::compute_style_groups_graph`].
    Graph {
        /// See `experimental.cssChunking.requestCost` in Next.js.
        request_cost: F32TaskInput,
        /// See `experimental.cssChunking.moduleFactorCost` in Next.js.
        module_factor_cost: F32TaskInput,
    },
}

impl StyleGroupsAlgorithm {
    /// Build a [`StyleGroupsAlgorithm::Graph`] variant from real `f32` cost parameters.
    pub fn graph(request_cost: f32, module_factor_cost: f32) -> Self {
        Self::Graph {
            request_cost: F32TaskInput::from(request_cost),
            module_factor_cost: F32TaskInput::from(module_factor_cost),
        }
    }
}

#[derive(
    TaskInput, Debug, Clone, PartialEq, Eq, Hash, NonLocalValue, TraceRawVcs, Encode, Decode,
)]
pub struct StyleGroupsConfig {
    pub max_chunk_size: usize,
    pub algorithm: StyleGroupsAlgorithm,
}

/// Per-item metadata produced by the style chunking algorithms.
#[derive(
    Debug, Clone, PartialEq, Eq, Hash, NonLocalValue, TraceRawVcs, Encode, Decode, TaskInput,
)]
pub struct StyleItemInfo {
    /// Stable sort key applied by the production-chunking pass when ordering chunks within a chunk
    /// group. `None` means "no preferred order" — entries with `None` keep their original input
    /// position relative to each other (the legacy algorithm produces all `None`).
    pub order: Option<u32>,
    /// `Some(batch)` when this chunk item shares its emitted chunk with other items. `None` for
    /// items that end up alone in their own chunk under the graph algorithm.
    pub batch: Option<ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>>,
}

/// Styling must not be duplicated in the application. The simplest way to achieve this is to put
/// every styling chunk item into a separate chunk. That works, but isn't efficient since it would
/// cause a lot of requests. Instead we multiple chunk items are groups together and placed in a
/// single shared chunk. `StyleGroups` specifies how chunk items are grouped together.
#[turbo_tasks::value(shared)]
pub struct StyleGroups {
    /// Per-item info keyed by chunk item. Items not present in this map are emitted as a separate
    /// chunk per item with the original input order.
    #[bincode(with = "turbo_bincode::indexmap")]
    pub shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo>,
}

/// Constructor for [`StyleGroups`] that's accessible from the graph algorithm in
/// [`crate::module_graph::style_groups_graph`] without forcing the cell visibility wider.
pub(super) fn make_style_groups(
    shared_chunk_items: FxIndexMap<ChunkItemWithAsyncModuleInfo, StyleItemInfo>,
) -> Vc<StyleGroups> {
    StyleGroups { shared_chunk_items }.cell()
}

pub async fn compute_style_groups(
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    config: &StyleGroupsConfig,
) -> Result<Vc<StyleGroups>> {
    let StyleCollection {
        module_info_map,
        mut chunk_group_state,
    } = collect_style_modules_per_chunk_group(module_graph, chunking_context).await?;

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
        let mut new_chunk_items = vec![info.chunk_item.unwrap()];

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

                new_chunk_items.push(info.chunk_item.unwrap());
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
                shared_chunk_items.insert(
                    chunk_item,
                    StyleItemInfo {
                        order: None,
                        batch: Some(style_group),
                    },
                );
            }
        }
    }

    Ok(StyleGroups { shared_chunk_items }.cell())
}
