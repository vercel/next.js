use std::cmp::Ordering;

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{FxIndexSet, ResolvedVc, SliceMap, TryJoinIterExt, ValueToString, Vc};

use crate::{
    chunk::{
        ChunkableModule, ChunkingType, MergeableModule, MergeableModuleResult, MergeableModules,
    },
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
};

#[turbo_tasks::value(transparent)]
pub struct MergedModules(SliceMap<ResolvedVc<Box<dyn Module>>, bool>);
#[turbo_tasks::value_impl]
impl MergedModules {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Default::default())
    }
}

// TODO maybe a smallvec once we know the size distribution?
#[turbo_tasks::value]
pub struct MergedModuleInfo {
    /// A map of modules to the merged module containing the module plus additional modules.
    #[allow(clippy::type_complexity)]
    pub replacements: FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn ChunkableModule>>>,
    /// A map of modules that are already contained as values in replacements.
    pub included: FxHashSet<ResolvedVc<Box<dyn Module>>>,
}

impl MergedModuleInfo {
    pub fn should_replace_module(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Option<ResolvedVc<Box<dyn ChunkableModule>>> {
        self.replacements.get(&module).copied()
    }

    pub fn should_create_chunk_item_for(&self, module: ResolvedVc<Box<dyn Module>>) -> bool {
        !self.included.contains(&module)
    }
}

/// Determine which modules can be merged together:
/// - if all chunks execute a sequence of modules in the same order, they can be merged together and
///   treated as one.
/// - if a merged module has an incoming edge not contained in the group, it has to expose its
///   exports into the module cache.
pub async fn compute_merged_modules(module_graph: Vc<ModuleGraph>) -> Result<Vc<MergedModuleInfo>> {
    let chunk_groups = module_graph.chunk_group_info().await?;
    let module_graph = module_graph.await?;

    #[allow(clippy::type_complexity)]
    let mut replacements: FxHashMap<
        ResolvedVc<Box<dyn Module>>,
        ResolvedVc<Box<dyn ChunkableModule>>,
    > = Default::default();
    let mut included: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();

    #[derive(Debug, PartialEq, Eq, Hash)]
    struct ListOccurence {
        list: usize,
        entry: usize,
    }
    impl PartialOrd for ListOccurence {
        fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
            Some(self.cmp(other))
        }
    }
    impl Ord for ListOccurence {
        fn cmp(&self, other: &Self) -> Ordering {
            self.entry.cmp(&other.entry)
        }
    }

    // A list of all different execution traces (orders) of all modules, initially one for each ESM
    // subtree in the chunks, but futher split up later on.
    let mut lists: Vec<FxIndexSet<ResolvedVc<Box<dyn MergeableModule>>>> = vec![];
    let mut lists_reverse_map: FxHashMap<ResolvedVc<Box<dyn MergeableModule>>, Vec<ListOccurence>> =
        Default::default();

    // Iterate over all chunk groups and collect all potentially mergeable modules (i.e. subtrees
    // that are eligible for merging).
    for chunk_group in &chunk_groups.chunk_groups {
        // TODO parallelize the chunk_group loop
        struct State {
            lists: Vec<FxIndexSet<ResolvedVc<Box<dyn MergeableModule>>>>,
            /// For each module, the lists it is imported into (may be multiple).
            current_list_indices: FxHashMap<ResolvedVc<Box<dyn Module>>, usize>,
        }
        let mut state = State {
            lists: vec![],
            current_list_indices: FxHashMap::default(),
        };
        module_graph
            .traverse_edges_from_entries_topological(
                chunk_group.entries(),
                &mut state,
                |parent_info, node, state| {
                    // On the down traversal, establish which edges are mergable and set the list
                    // indices.
                    if parent_info.is_some_and(|p| !p.1.is_parallel()) {
                        return Ok(GraphTraversalAction::Exclude);
                    }
                    let (parent_module, hoisted) =
                        parent_info.map_or((None, false), |(node, ty)| {
                            (
                                Some(node.module),
                                match ty {
                                    ChunkingType::Parallel { hoisted, .. } => *hoisted,
                                    _ => unreachable!(),
                                },
                            )
                        });
                    let module = node.module;

                    if ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module).is_some() {
                        let idx = if hoisted
                            && parent_module.is_some_and(|p| {
                                ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(p).is_some()
                            }) {
                            // An eligible edge: MergeableModule ---hoisted---> MergeableModule
                            // Reuse the parent's list to later add the child to it
                            parent_module
                                .and_then(|p| state.current_list_indices.get(&p).copied())
                                .unwrap_or_else(|| {
                                    let idx = state.lists.len();
                                    state.lists.push(Default::default());
                                    idx
                                })
                        } else {
                            // The module get its own list
                            let idx = state.lists.len();
                            state.lists.push(Default::default());
                            idx
                        };
                        state.current_list_indices.insert(module, idx);
                    }
                    Ok(GraphTraversalAction::Continue)
                },
                |_parent_info, node, state| {
                    // On the up traversal (which corresponds to execution order), add the module to
                    // the lists it belongs to.
                    let module = node.module;
                    // TODO when is a module exposed?
                    // let is_exposed = parent_info.is_none();

                    if let Some(mergable_module) =
                        ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module)
                    {
                        let idx = *state.current_list_indices.get(&module).unwrap();
                        let list = state.lists.get_mut(idx).unwrap();

                        // We might visit the module multiple times, but only add it the first time
                        // (which corresponds to when it executes).
                        if list.insert(mergable_module) {
                            lists_reverse_map.entry(mergable_module).or_default().push(
                                ListOccurence {
                                    list: idx,
                                    entry: list.len(),
                                },
                            );
                        }
                    }
                },
            )
            .await?;

        lists.extend(state.lists);
    }

    // Sort the reverse mappings by the index in the lists, so that we start with smaller indices to
    // find larger common sequences
    for list in lists_reverse_map.values_mut() {
        list.sort_unstable();
    }

    // Split up lists to ensure each module only appears once in a list.
    // TODO

    // Call MergeableModule impl to merge the modules (or not, if they are rejected).
    let result = lists
        .into_iter()
        .map(async |list| {
            let mut resulting_list = vec![];
            let mut included: Vec<ResolvedVc<Box<dyn Module>>> = vec![];

            let mut i = 0;
            while i < list.len() - 1 {
                let first = *list.iter().nth(i).unwrap();
                let modules = list.iter().skip(i).map(|m| **m).collect::<Vec<_>>();
                match *first.merge(MergeableModules::interned(modules)).await? {
                    MergeableModuleResult::Merged {
                        merged_module,
                        consumed,
                        skipped,
                    } => {
                        resulting_list
                            .push((ResolvedVc::upcast::<Box<dyn Module>>(first), merged_module));
                        included.extend(
                            list.iter()
                                .skip(i)
                                .skip(skipped as usize)
                                // The first module should not be `included` but `replaced`
                                .skip(1)
                                .take(consumed as usize)
                                .copied()
                                .map(ResolvedVc::upcast),
                        );
                        i += (skipped + consumed) as usize;
                    }
                    MergeableModuleResult::NotMerged => {
                        // None of them are mergeable.
                        return Ok(None);
                    }
                }
            }

            Ok(Some((resulting_list, included)))
        })
        .try_join()
        .await?;

    for (replacements_part, included_part) in result.into_iter().flatten() {
        replacements.extend(replacements_part.into_iter());
        included.extend(included_part);
    }

    // println!(
    //     "lists {:#?}",
    //     lists
    //         .iter()
    //         .map(|m| m.iter().map(|m| m.ident().to_string()).try_join())
    //         .try_join()
    //         .await?
    // );
    // println!(
    //     "lists_reverse_map {:#?}",
    //     lists_reverse_map
    //         .iter()
    //         .map(async |(k, v)| Ok((k.ident().to_string().await?, v)))
    //         .try_join()
    //         .await?
    // );

    println!(
        "included {:#?}",
        included
            .iter()
            .map(|m| m.ident().to_string())
            .try_join()
            .await?
    );
    println!(
        "replacements {:#?}",
        replacements
            .iter()
            .map(async |(k, v)| Ok((k.ident().to_string().await?, v.ident().to_string().await?)))
            .try_join()
            .await?
    );

    Ok(MergedModuleInfo {
        replacements,
        included,
    }
    .cell())
}
