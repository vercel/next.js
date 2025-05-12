use std::{cmp::Ordering, collections::hash_map::Entry};

use anyhow::Result;
use roaring::RoaringBitmap;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, SliceMap, TryJoinIterExt, ValueToString, Vc,
};

use crate::{
    chunk::{
        ChunkableModule, ChunkingType, MergeableModule, MergeableModuleResult, MergeableModules,
    },
    module::Module,
    module_graph::{
        chunk_group_info::RoaringBitmapWrapper, GraphTraversalAction, ModuleGraph,
        SingleModuleGraphModuleNode,
    },
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

    // Use all entries from all graphs
    let graphs = module_graph.get_graphs().await?;
    let entries = graphs
        .iter()
        .flat_map(|g| g.entries.iter())
        .flat_map(|g| g.entries())
        .collect::<Vec<_>>();

    let mut module_merged_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
        FxHashMap::default();
    let mut next_index = 0u32;

    let visit_count = module_graph
        .traverse_edges_fixed_point(
            entries.iter().map(|e| (*e, 0)),
            &mut module_merged_groups,
            |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ ChunkingType)>,
             node: &'_ SingleModuleGraphModuleNode,
             module_merged_groups: &mut FxHashMap<
                ResolvedVc<Box<dyn Module>>,
                RoaringBitmapWrapper,
            >|
             -> GraphTraversalAction {
                // On the down traversal, establish which edges are mergable and set the list
                // indices.
                let (parent_module, hoisted) = parent_info.map_or((None, false), |(node, ty)| {
                    (
                        Some(node.module),
                        match ty {
                            ChunkingType::Parallel { hoisted, .. } => *hoisted,
                            _ => false,
                        },
                    )
                });
                let module = node.module;

                if let (Some(parent_module), true, true) = (
                    parent_module.filter(|m| {
                        ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(*m).is_some()
                    }),
                    ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module).is_some(),
                    hoisted,
                ) {
                    // A hoisted reference from a mergeable module to a mergeable module, inherit
                    // bitmaps from parent.
                    if parent_module == module {
                        // A self-reference
                        GraphTraversalAction::Skip
                    } else {
                        module_merged_groups.entry(node.module).or_default();
                        let [Some(parent_merged_groups), Some(current_merged_groups)] =
                            module_merged_groups.get_disjoint_mut([
                                &ResolvedVc::upcast(parent_module),
                                &node.module,
                            ])
                        else {
                            // All modules are inserted in the previous iteration
                            unreachable!()
                        };

                        if current_merged_groups.is_empty() {
                            // Initial visit, clone instead of merging
                            *current_merged_groups = parent_merged_groups.clone();
                            GraphTraversalAction::Continue
                        } else if parent_merged_groups.is_proper_superset(current_merged_groups) {
                            // Add bits from parent, and continue traversal because changed
                            **current_merged_groups |= &**parent_merged_groups;
                            GraphTraversalAction::Continue
                        } else {
                            // Unchanged, no need to forward to children
                            GraphTraversalAction::Skip
                        }
                    }
                } else {
                    // Either a non-hoisted reference or an incompatible parent or child module,
                    // create a new group.
                    let idx = next_index;
                    next_index += 1;

                    match module_merged_groups.entry(module) {
                        Entry::Occupied(mut entry) => {
                            let current = entry.get_mut();
                            if !current.contains(idx) {
                                // Mark and continue traversal because modified
                                current.insert(idx);
                                GraphTraversalAction::Continue
                            } else {
                                // Unchanged, no need to forward to children
                                GraphTraversalAction::Skip
                            }
                        }
                        Entry::Vacant(entry) => {
                            // First visit
                            entry.insert(RoaringBitmapWrapper(
                                RoaringBitmap::from_sorted_iter(std::iter::once(idx)).unwrap(),
                            ));
                            GraphTraversalAction::Continue
                        }
                    }
                }
            },
            |_, _| 0,
        )
        .await?;

    {
        let mut foo: FxIndexMap<RoaringBitmapWrapper, Vec<ReadRef<RcStr>>> = Default::default();
        for (k, v) in &module_merged_groups {
            foo.entry(v.clone())
                .or_default()
                .push(k.ident().to_string().await?);
        }
        println!(
            "{} {} {:#?}",
            visit_count,
            module_merged_groups.len(),
            foo.iter().filter(|(_, v)| v.len() > 1).collect::<Vec<_>>()
        );
    }

    // A list of all different execution traces (orders) of all modules, initially one for each ESM
    // subtree in the chunks, but futher split up later on.
    let mut lists: FxIndexMap<
        RoaringBitmapWrapper,
        FxIndexSet<ResolvedVc<Box<dyn MergeableModule>>>,
    > = FxIndexMap::with_capacity_and_hasher(module_merged_groups.len(), Default::default());

    module_graph
        .traverse_edges_from_entries_topological(
            entries,
            &mut (),
            |_, _, _| Ok(GraphTraversalAction::Continue),
            |_, node, _| {
                let module = node.module;
                if let Some(mergeable_module) =
                    ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module)
                {
                    let bitmap = module_merged_groups
                        .get(&module)
                        .expect("Module should be in the map");
                    lists
                        .entry(bitmap.clone())
                        .or_default()
                        .insert(mergeable_module);
                }
            },
        )
        .await?;

    println!(
        "lists {:#?}",
        lists
            .iter()
            .filter(|(_, v)| v.len() > 1)
            .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
            .try_join()
            .await?
    );

    // Call MergeableModule impl to merge the modules (or not, if they are rejected).
    let result = lists
        .into_values()
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
