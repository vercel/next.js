use std::{cmp::Ordering, collections::hash_map::Entry};

use anyhow::{Context, Result, bail};
use roaring::RoaringBitmap;
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, SliceMap, TryFlatJoinIterExt, TryJoinIterExt,
    ValueToString, Vc,
};

use crate::{
    chunk::{
        ChunkableModule, ChunkingType, MergeableModule, MergeableModules, MergeableModulesExposed,
    },
    module::Module,
    module_graph::{
        GraphTraversalAction, ModuleGraph, RefData, SingleModuleGraphModuleNode,
        chunk_group_info::RoaringBitmapWrapper,
    },
    resolve::ExportUsage,
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
    // #[allow(clippy::type_complexity)]
    // pub replacements_included:
    //     FxHashMap<ResolvedVc<Box<dyn Module>>, Vec<ResolvedVc<Box<dyn Module>>>>,
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
    let span_outer = tracing::info_span!(
        "compute merged modules",
        module_count = tracing::field::Empty,
        visit_count = tracing::field::Empty,
        merged_groups = tracing::field::Empty,
        included_modules = tracing::field::Empty
    );

    let span = span_outer.clone();
    async move {
        let async_module_info = module_graph.async_module_info().await?;
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let module_graph = module_graph.await?;

        let graphs = module_graph.graphs.iter().try_join().await?;
        let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();
        span.record("module_count", module_count);

        // Use all entries from all graphs
        let entries = graphs
            .iter()
            .flat_map(|g| g.entries.iter())
            .flat_map(|g| g.entries())
            .collect::<Vec<_>>();

        // For each module, the indices in the bitmap store which merge group entry modules
        // transitively import that module. The bitmap can be treated as an opaque value, merging
        // all modules with the same bitmap.
        let mut module_merged_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
            FxHashMap::with_capacity_and_hasher(module_count, Default::default());
        // Entries that started a new merge group for some deopt reason
        let mut entry_modules =
            FxHashSet::with_capacity_and_hasher(module_count, Default::default());

        // let idents = graphs
        //     .iter()
        //     .flat_map(|g| g.graph.node_weights())
        //     .map(async |n| Ok((n.module(), n.module().ident().to_string().await?)))
        //     .try_join()
        //     .await?
        //     .into_iter()
        //     .collect::<FxIndexMap<_, _>>();

        let mergeable = graphs
            .iter()
            .flat_map(|g| g.iter_nodes())
            .map(async |n| {
                let module = n.module;
                let mergeable = ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module);
                if let Some(mergeable) = mergeable
                    && *mergeable.is_mergeable().await?
                {
                    return Ok(Some(module));
                }
                Ok(None)
            })
            .try_flat_join()
            .await?
            .into_iter()
            .collect::<FxHashSet<_>>();

        let mut next_index = 0u32;
        let visit_count = module_graph
            .traverse_edges_fixed_point_with_priority(
                entries.iter().map(|e| (*e, 0)),
                &mut (),
                |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
                 node: &'_ SingleModuleGraphModuleNode,
                 _|
                 -> Result<GraphTraversalAction> {
                    // On the down traversal, establish which edges are mergable and set the list
                    // indices.
                    let (parent_module, hoisted) =
                        parent_info.map_or((None, false), |(node, ty)| {
                            (
                                Some(node.module),
                                match &ty.chunking_type {
                                    ChunkingType::Parallel { hoisted, .. } => *hoisted,
                                    _ => false,
                                },
                            )
                        });
                    let module = node.module;

                    // println!(
                    //     "{} -> {} {:?} {:?}",
                    //     parent_module.map_or("".to_string(), |p| idents[&p].to_string()),
                    //     idents[&module],
                    //     parent_module,
                    //     module,
                    // );

                    Ok(if parent_module.is_some_and(|p| p == module) {
                        // A self-reference
                        GraphTraversalAction::Skip
                    } else if let (Some(parent_module), true, true, true) = (
                        parent_module.filter(|m| {
                            ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(*m).is_some()
                        }),
                        mergeable.contains(&module),
                        hoisted,
                        // TODO technically we could merge a sync child into an async parent
                        !parent_module.is_some_and(|p| async_module_info.contains(&p))
                            && !async_module_info.contains(&module),
                    ) {
                        // A hoisted reference from a mergeable module to a non-async mergeable
                        // module, inherit bitmaps from parent.
                        module_merged_groups.entry(node.module).or_default();
                        let [Some(parent_merged_groups), Some(current_merged_groups)] =
                            module_merged_groups.get_disjoint_mut([&parent_module, &node.module])
                        else {
                            // All modules are inserted in the previous iteration
                            bail!("unreachable except for eventual consistency");
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
                    } else {
                        // Either a non-hoisted reference or an incompatible parent or child module

                        if entry_modules.insert(module) {
                            // Not assigned a new group before, create a new one.
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
                                        RoaringBitmap::from_sorted_iter(std::iter::once(idx))
                                            .unwrap(),
                                    ));
                                    GraphTraversalAction::Continue
                                }
                            }
                        } else {
                            // Already visited and assigned a new group, no need to forward to
                            // children.
                            GraphTraversalAction::Skip
                        }
                    })
                },
                |_, _| Ok(0),
            )
            .await?;

        span.record("visit_count", visit_count);

        // {
        //     let mut x: FxIndexMap<RoaringBitmapWrapper, Vec<ReadRef<RcStr>>> =
        // Default::default();     for (k, v) in &module_merged_groups {
        //         x.entry(v.clone())
        //             .or_default()
        //             .push(k.ident().to_string().await?);
        //     }
        //     println!(
        //         "list candidates {} {} {:#?}",
        //         visit_count,
        //         module_merged_groups.len(),
        //         x.iter().filter(|(_, v)| v.len() > 1).collect::<Vec<_>>()
        //     );
        // }

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
                self.entry
                    .cmp(&other.entry)
                    // don't matter but needed to make it a total ordering
                    .then_with(|| self.list.cmp(&other.list))
            }
        }

        // A list of all different execution traces (orders) of all modules, initially a union of
        // the partition of each chunk's modules (one for each ESM subtree in each chunks), but
        // further split up later on.
        let mut lists = vec![];
        let mut lists_reverse_indices: FxIndexMap<
            ResolvedVc<Box<dyn MergeableModule>>,
            FxIndexSet<ListOccurence>,
        > = FxIndexMap::default();

        // A map of all references betwee modules with the same bitmap. These are all references,
        // including reexecution edges and cycles. Used to expose additional modules if the
        // bitmap-groups are split up further.
        #[allow(clippy::type_complexity)]
        let mut intra_group_references: FxIndexMap<
            ResolvedVc<Box<dyn Module>>,
            FxIndexSet<ResolvedVc<Box<dyn Module>>>,
        > = FxIndexMap::default();
        // A map of all references betwee modules with the same bitmap. These are only the
        // references relevant for execution (ignoring cycles), to find the entries of a group.
        #[allow(clippy::type_complexity)]
        let mut intra_group_references_rev: FxIndexMap<
            ResolvedVc<Box<dyn Module>>,
            FxIndexSet<ResolvedVc<Box<dyn Module>>>,
        > = FxIndexMap::default();

        // TODO try to parallelize this loop somehow
        for chunk_group in &chunk_group_info.chunk_groups {
            // A partition of all modules in the chunk into several execution traces (orders),
            // stored in the top-level lists and referenced here by index.
            let mut chunk_lists: FxHashMap<RoaringBitmapWrapper, usize> =
                FxHashMap::with_capacity_and_hasher(
                    module_merged_groups.len() / chunk_group_info.chunk_groups.len(),
                    Default::default(),
                );

            // This is necessary to have the correct order with cycles: a `a -> b -> a` graph would
            // otherwise be visited as `b->a`, `a->b`, leading to the list `a, b` which is not
            // execution order.
            let mut visited = FxHashSet::default();

            module_graph
                .traverse_edges_from_entries_topological(
                    chunk_group.entries(),
                    &mut (),
                    |parent_info, node, _| {
                        if parent_info.is_none_or(|(_, r)| r.chunking_type.is_parallel())
                            && visited.insert(node.module)
                        {
                            Ok(GraphTraversalAction::Continue)
                        } else {
                            Ok(GraphTraversalAction::Exclude)
                        }
                    },
                    |parent_info, node, _| {
                        let module = node.module;

                        if let Some(bitmap) = module_merged_groups.get(&module)
                            && let Some(mergeable_module) =
                                ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module)
                        {
                            match chunk_lists.entry(bitmap.clone()) {
                                Entry::Vacant(e) => {
                                    // New list, insert the module
                                    let idx = lists.len();
                                    e.insert(idx);
                                    lists.push(vec![mergeable_module]);
                                    lists_reverse_indices
                                        .entry(mergeable_module)
                                        .or_default()
                                        .insert(ListOccurence {
                                            list: idx,
                                            entry: 0,
                                        });
                                }
                                Entry::Occupied(e) => {
                                    let list_idx = *e.get();
                                    let list = &mut lists[list_idx];
                                    list.push(mergeable_module);
                                    lists_reverse_indices
                                        .entry(mergeable_module)
                                        .or_default()
                                        .insert(ListOccurence {
                                            list: list_idx,
                                            entry: list.len() - 1,
                                        });
                                }
                            }
                        }

                        if let Some((parent, _)) = parent_info {
                            let same_bitmap = module_merged_groups.get(&parent.module).unwrap()
                                == module_merged_groups.get(&module).unwrap();

                            if same_bitmap {
                                intra_group_references_rev
                                    .entry(module)
                                    .or_default()
                                    .insert(parent.module);
                            }
                        }
                    },
                )
                .await?;

            // println!(
            //     "lists {:#?}",
            //     chunk_lists
            //         .iter()
            //         .map(async |(b, l)| Ok((
            //             b,
            //             lists[*l]
            //                 .iter()
            //                 .map(|m| m.ident().to_string())
            //                 .try_join()
            //                 .await?
            //         )))
            //         .try_join()
            //         .await?
            // );
        }

        // TODO sort lists_reverse_indices somehow?
        // We use list.pop() below, so reverse order using negation
        lists_reverse_indices
            .sort_by_cached_key(|_, b| b.iter().map(|o| o.entry).min().map(|v| -(v as i64)));

        // Modules that are referenced from outside the group, so their exports need to be exposed.
        // Initially these are set based on the bitmaps (and namespace imports), but more modules
        // might need to be exposed if the lists are split up further below.
        let mut exposed_modules: FxHashSet<ResolvedVc<Box<dyn Module>>> =
            FxHashSet::with_capacity_and_hasher(module_merged_groups.len(), Default::default());

        module_graph
            .traverse_edges_from_entries_topological(
                entries,
                &mut (),
                |_, _, _| Ok(GraphTraversalAction::Continue),
                |parent_info, node, _| {
                    let module = node.module;

                    if let Some((parent, _)) = parent_info {
                        let same_bitmap = module_merged_groups.get(&parent.module).unwrap()
                            == module_merged_groups.get(&module).unwrap();

                        if same_bitmap {
                            intra_group_references
                                .entry(parent.module)
                                .or_default()
                                .insert(module);
                        }
                    }

                    if parent_info.is_none_or(|(parent, r)| {
                        (module_merged_groups.get(&parent.module).unwrap()
                            != module_merged_groups.get(&module).unwrap())
                            || matches!(r.export, ExportUsage::All)
                    }) {
                        // This module needs to be exposed:
                        // - referenced from another group or
                        // - a namespace import or an entry module or
                        // - an entry module (TODO assume it will be required for Node/Edge, but not
                        // necessarily needed for browser),
                        exposed_modules.insert(module);
                    }
                },
            )
            .await?;

        // println!(
        //     "pre-split lists {:#?}",
        //     lists
        //         .iter()
        //         .map(|m| m.iter().map(|m| m.ident().to_string()).try_join())
        //         .try_join()
        //         .await?,
        //     // lists
        //     //     .iter()
        //     //     .filter(|(_, v)| v.len() > 1)
        //     //     .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
        //     //     .try_join()
        //     //     .await?
        // );

        // println!(
        //     "lists_reverse_indices {:#?}",
        //     lists_reverse_indices
        //         .iter()
        //         .map(async |(m, l)| Ok((m.ident().to_string().await?, l)))
        //         .try_join()
        //         .await?,
        //     // lists
        //     //     .iter()
        //     //     .filter(|(_, v)| v.len() > 1)
        //     //     .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
        //     //     .try_join()
        //     //     .await?
        // );

        while let Some((_, common_occurences)) = lists_reverse_indices.pop() {
            if common_occurences.len() < 2 {
                // Module exists only in one list, no need to split
                continue;
            }
            // println!("{:?} {:?}", m.ident().to_string().await?, common_occurences);
            // The module occurs in multiple lists, which need to split up so that there is exactly
            // one list containing the module.

            let first_occurence = &common_occurences[0];

            // Find the longest common sequence in the lists, starting from the given module.
            let mut common_length = 2;
            loop {
                let m = lists[first_occurence.list].get(first_occurence.entry + common_length - 1);
                if m.is_some()
                    && common_occurences
                        .iter()
                        .skip(1)
                        .all(|ListOccurence { list, entry }| {
                            lists[*list].get(*entry + common_length - 1) == m
                        })
                {
                    common_length += 1;
                    continue;
                }

                // Went one too far, the common length is what the previous iteration verified
                common_length -= 1;
                break;
            }

            // println!(
            //     "{:?} {:?}",
            //     lists[first_occurence.list]
            //         .iter()
            //         .map(|m| m.ident().to_string())
            //         .try_join()
            //         .await?,
            //     (first_occurence.entry..first_occurence.entry +
            // common_length).collect::<Vec<_>>(), );

            // Split into three lists:
            // - "common" [occurrence.entry .. occurrence.entry + common_length) -- same for all
            // - "before" [0 .. occurrence.entry)
            // - "after"  [occurrence.entry + common_length .. ]
            let common_list = lists[first_occurence.list]
                [first_occurence.entry..first_occurence.entry + common_length]
                .to_vec();

            let common_list_index = lists.len();
            lists.push(common_list.clone());

            // Insert occurences for the "common" list, skip the first because that is now
            // guaranteed to exist only once
            for (i, &m) in common_list.iter().enumerate().skip(1) {
                let occurrences = lists_reverse_indices.get_mut(&m).unwrap();
                for common_occurrence in &common_occurences {
                    let removed = occurrences.swap_remove(&ListOccurence {
                        list: common_occurrence.list,
                        entry: common_occurrence.entry + i,
                    });
                    debug_assert!(removed);
                }
                occurrences.insert(ListOccurence {
                    list: common_list_index,
                    entry: i,
                });
            }

            for common_occurrence in &common_occurences {
                let list = &mut lists[common_occurrence.list];
                let after_list = list.split_off(common_occurrence.entry + common_length);
                list.truncate(common_occurrence.entry);
                let before_list = &*list;

                // For all previously merged references that exist from "after" to "common"/"before"
                // and from "common" to "before", mark the referenced modules as exposed.
                for m in &common_list {
                    let m = ResolvedVc::upcast(*m);
                    if let Some(refs) = intra_group_references.get(&m) {
                        exposed_modules.extend(
                            before_list
                                .iter()
                                .map(|n| ResolvedVc::upcast(*n))
                                .filter(|n| refs.contains(n)),
                        );
                    }
                }
                for m in &after_list {
                    let m = ResolvedVc::upcast(*m);
                    if let Some(refs) = intra_group_references.get(&m) {
                        exposed_modules.extend(
                            before_list
                                .iter()
                                .chain(common_list.iter())
                                .map(|n| ResolvedVc::upcast(*n))
                                .filter(|n| refs.contains(n)),
                        );
                    }
                }

                // println!(
                //     "{} {:#?} {:#?} {:#?}",
                //     common_length,
                //     list.iter()
                //         .map(|m| m.ident().to_string())
                //         .try_join()
                //         .await?,
                //     common_list
                //         .iter()
                //         .map(|m| m.ident().to_string())
                //         .try_join()
                //         .await?,
                //     after_list
                //         .iter()
                //         .map(|m| m.ident().to_string())
                //         .try_join()
                //         .await?
                // );

                // The occurences for the "before" list (`list`) are still valid, need to update the
                // occurences for the "after" list
                if !after_list.is_empty() {
                    let after_index = lists.len();
                    lists.push(after_list.clone());
                    for (i, &m) in after_list.iter().enumerate() {
                        let occurrences = lists_reverse_indices
                            .get_mut(&m)
                            .context(format!("{:?}", m.ident().to_string().await?))?;

                        let removed = occurrences.swap_remove(&ListOccurence {
                            list: common_occurrence.list,
                            entry: common_occurrence.entry + common_length + i,
                        });
                        debug_assert!(removed);

                        occurrences.insert(ListOccurence {
                            list: after_index,
                            entry: i,
                        });
                    }
                }
            }
        }

        // println!(
        //     "lists {:#?}",
        //     lists
        //         .iter()
        //         .map(|m| m.iter().map(|m| m.ident().to_string()).try_join())
        //         .try_join()
        //         .await?,
        //     // lists
        //     //     .iter()
        //     //     .filter(|(_, v)| v.len() > 1)
        //     //     .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
        //     //     .try_join()
        //     //     .await?
        // );
        // println!(
        //     "exposed_modules {:#?}",
        //     exposed_modules
        //         .iter()
        //         .map(|m| m.ident().to_string())
        //         .try_join()
        //         .await?,
        //     // lists
        //     //     .iter()
        //     //     .filter(|(_, v)| v.len() > 1)
        //     //     .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
        //     //     .try_join()
        //     //     .await?
        // );

        // println!(
        //     "lists_reverse_indices {:#?}",
        //     lists_reverse_indices
        //         .iter()
        //         .map(async |(m, l)| Ok((m.ident().to_string().await?, l)))
        //         .try_join()
        //         .await?,
        //     // lists
        //     //     .iter()
        //     //     .filter(|(_, v)| v.len() > 1)
        //     //     .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
        //     //     .try_join()
        //     //     .await?
        // );

        // Dedupe the lists
        let lists = lists.into_iter().collect::<FxHashSet<_>>();

        // Call MergeableModule impl to merge the modules (or not, if they are rejected).
        let result = lists
            .into_iter()
            .map(async |list| {
                if list.len() < 2 {
                    // Nothing to merge
                    return Ok(None);
                }

                let list_set = list
                    .iter()
                    .map(|&m| ResolvedVc::upcast::<Box<dyn Module>>(m))
                    .collect::<FxIndexSet<_>>();

                // Group entries are not referenced by any other module in the group
                let entries = list
                    .iter()
                    .filter(|m| {
                        intra_group_references_rev
                            .get(&ResolvedVc::upcast(**m))
                            .is_none_or(|refs| refs.is_disjoint(&list_set))
                    })
                    .map(|m| **m)
                    .collect::<Vec<_>>();
                debug_assert_ne!(entries.len(), 0);

                let list_exposed = list
                    .iter()
                    .map(|&m| (m, exposed_modules.contains(&ResolvedVc::upcast(m))))
                    .collect::<Vec<_>>();

                // println!(
                //     "merged {:#?} {:#?} {:#?}",
                //     list.iter()
                //         .map(|m| m.ident().to_string())
                //         .try_join()
                //         .await?,
                //     list.iter()
                //         .map(async |m| {
                //             Ok(
                //                 if let Some(refs) =
                //                     intra_group_references_rev.get(&ResolvedVc::upcast(*m))
                //                 {
                //                     Some(
                //                         refs.iter()
                //                             .map(|r| r.ident().to_string())
                //                             .try_join()
                //                             .await?,
                //                     )
                //                 } else {
                //                     None
                //                 },
                //             )
                //         })
                //         .try_join()
                //         .await?,
                //     entries
                //         .iter()
                //         .map(|m| m.ident().to_string())
                //         .try_join()
                //         .await?
                // );

                let entry = *list.last().unwrap();
                let result = entry
                    .merge(
                        MergeableModulesExposed::interned(list_exposed),
                        MergeableModules::interned(entries),
                    )
                    .to_resolved()
                    .await?;

                let list_len = list.len();
                Ok(Some((
                    ResolvedVc::upcast::<Box<dyn Module>>(entry),
                    result,
                    list.into_iter()
                        .take(list_len - 1)
                        .map(ResolvedVc::upcast)
                        .collect::<Vec<_>>(),
                )))

                // let mut resulting_list = vec![];
                // let mut included: Vec<ResolvedVc<Box<dyn Module>>> = vec![];
                // let mut i = 0;
                // while i < list.len() - 1 {
                //     let first = list[i];
                //     let modules = list[i..]
                //         .iter()
                //         .map(|&m| (m, exposed_modules.contains(&ResolvedVc::upcast(m))))
                //         .collect::<Vec<_>>();
                //     match *first.merge(MergeableModules::interned(modules)).await? {
                //         MergeableModuleResult::Merged {
                //             merged_module,
                //             consumed,
                //             skipped,
                //         } => {
                //             // println!(
                //             //     "accepted from {:?} {:#?} {:?} consumed {} {:#?} skipped {}
                //             // {:#?}",     first.ident().to_string().
                //             // await?,     list[i..]
                //             //         .iter()
                //             //         .map(|m| m.ident().to_string())
                //             //         .try_join()
                //             //         .await?,
                //             //     merged_module.ident().to_string().await?,
                //             //     consumed,
                //             //     list.iter()
                //             //         .skip(i)
                //             //         .skip(skipped as usize)
                //             //         .take(consumed as usize)
                //             //         .map(|m| m.ident().to_string())
                //             //         .try_join()
                //             //         .await?,
                //             //     skipped,
                //             //     list.iter()
                //             //         .skip(i)
                //             //         .take(skipped as usize)
                //             //         .map(|m| m.ident().to_string())
                //             //         .try_join()
                //             //         .await?,
                //             // );

                //             let mut current_included = list[i..]
                //                 .iter()
                //                 .skip(skipped as usize)
                //                 .take(consumed as usize);
                //             // The first module should not be `included` but `replaced`
                //             let first = *current_included.next().unwrap();
                //             debug_assert!(
                //                 first.ident().to_string().await?
                //                     == merged_module.ident().to_string().await?,
                //                 "{} == {}",
                //                 first.ident().to_string().await?,
                //                 merged_module.ident().to_string().await?
                //             );
                //             resulting_list.push((
                //                 ResolvedVc::upcast::<Box<dyn Module>>(first),
                //                 merged_module,
                //             ));
                //             included.extend(current_included.copied().map(ResolvedVc::upcast));
                //             i += (skipped + consumed) as usize;
                //         }
                //         MergeableModuleResult::NotMerged => {
                //             // None of them are mergeable.
                //             return Ok(None);
                //         }
                //     }
                // }
                // Ok(Some((resulting_list, included)))
            })
            .try_join()
            .await?;

        #[allow(clippy::type_complexity)]
        let mut replacements: FxHashMap<
            ResolvedVc<Box<dyn Module>>,
            ResolvedVc<Box<dyn ChunkableModule>>,
        > = Default::default();
        // #[allow(clippy::type_complexity)]
        // let mut replacements_included: FxHashMap<
        //     ResolvedVc<Box<dyn Module>>,
        //     Vec<ResolvedVc<Box<dyn Module>>>,
        // > = Default::default();
        let mut included: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();

        for (original, replacement, replacement_included) in result.into_iter().flatten() {
            replacements.insert(original, replacement);
            // replacements_included.insert(original, replacement_included.clone());
            included.extend(replacement_included);
        }

        span.record("merged_groups", replacements.len());
        span.record("included_modules", included.len());

        // println!(
        //     "included {:#?}",
        //     included
        //         .iter()
        //         .map(|m| m.ident().to_string())
        //         .try_join()
        //         .await?
        // );
        // println!(
        //     "replacements {:#?}",
        //     replacements
        //         .iter()
        //         .map(async |(k, v)| Ok((
        //             k.ident().to_string().await?,
        //             v.ident().to_string().await?
        //         )))
        //         .try_join()
        //         .await?
        // );

        Ok(MergedModuleInfo {
            replacements,
            // replacements_included,
            included,
        }
        .cell())
    }
    .instrument(span_outer)
    .await
}
