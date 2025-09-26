use std::collections::hash_map::Entry;

use anyhow::{Context, Result, bail};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};

use crate::{
    chunk::{
        ChunkableModule, ChunkingType, MergeableModule, MergeableModuleExposure, MergeableModules,
        MergeableModulesExposed,
    },
    module::Module,
    module_graph::{
        GraphTraversalAction, ModuleGraph, RefData, SingleModuleGraphModuleNode,
        chunk_group_info::RoaringBitmapWrapper,
    },
    resolve::ExportUsage,
};

#[turbo_tasks::value]
pub struct MergedModuleInfo {
    /// A map of modules to the merged module containing the module plus additional modules.
    #[allow(clippy::type_complexity)]
    pub replacements: FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn ChunkableModule>>>,
    /// A map of replacement modules to their corresponding chunk group info (which is the same as
    /// the chunk group info of the original module it replaced).
    #[allow(clippy::type_complexity)]
    pub replacements_to_original:
        FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>>,
    /// A map of modules that are already contained as values in replacements.
    pub included: FxHashSet<ResolvedVc<Box<dyn Module>>>,
}

impl MergedModuleInfo {
    /// Whether the given module should be replaced with a merged module.
    pub fn should_replace_module(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Option<ResolvedVc<Box<dyn ChunkableModule>>> {
        self.replacements.get(&module).copied()
    }

    /// Returns the original module for the given replacement module (useful for retrieving the
    /// chunk group info).
    pub fn get_original_module(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Option<ResolvedVc<Box<dyn Module>>> {
        self.replacements_to_original.get(&module).copied()
    }

    // Whether the given module should be skipped during chunking, as it is already included in a
    // module returned by some `should_replace_module` call.
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
        let module_graph = module_graph.read_graphs().await?;

        let graphs = &module_graph.graphs;
        let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();
        span.record("module_count", module_count);

        // Use all entries from all graphs
        let entries = graphs
            .iter()
            .flat_map(|g| g.entries.iter())
            .flat_map(|g| g.entries())
            .collect::<Vec<_>>();

        // First, compute the depth for each module in the graph
        let module_depth = {
            let _inner_span = tracing::info_span!("compute depth").entered();

            let mut module_depth =
                FxHashMap::with_capacity_and_hasher(module_count, Default::default());
            module_graph.traverse_edges_from_entries_bfs(
                entries.iter().copied(),
                |parent, node| {
                    if let Some((parent, _)) = parent {
                        let parent_depth = *module_depth
                            .get(&parent.module)
                            .context("Module depth not found")?;
                        module_depth.entry(node.module).or_insert(parent_depth + 1);
                    } else {
                        module_depth.insert(node.module, 0);
                    };

                    Ok(GraphTraversalAction::Continue)
                },
            )?;
            module_depth
        };

        // For each module, the indices in the bitmap store which merge group entry modules
        // transitively import that module. The bitmap can be treated as an opaque value, merging
        // all modules with the same bitmap.
        let mut module_merged_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
            FxHashMap::with_capacity_and_hasher(module_count, Default::default());
        // Entries that started a new merge group for some deopt reason
        let mut entry_modules =
            FxHashSet::with_capacity_and_hasher(module_count, Default::default());

        let inner_span = tracing::info_span!("collect mergeable modules");
        let mergeable = graphs
            .iter()
            .flat_map(|g| g.iter_nodes())
            .map(async |n| {
                let module = n.module;
                if let Some(mergeable) =
                    ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module)
                    && *mergeable.is_mergeable().await?
                {
                    return Ok(Some(module));
                }
                Ok(None)
            })
            .try_flat_join()
            .instrument(inner_span)
            .await?
            .into_iter()
            .collect::<FxHashSet<_>>();

        let inner_span = tracing::info_span!("fixed point traversal").entered();

        let mut next_index = 0u32;
        let visit_count = module_graph.traverse_edges_fixed_point_with_priority(
            entries
                .iter()
                .map(|e| Ok((*e, -*module_depth.get(e).context("Module depth not found")?)))
                .collect::<Result<Vec<_>>>()?,
            &mut (),
            |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
             node: &'_ SingleModuleGraphModuleNode,
             _|
             -> Result<GraphTraversalAction> {
                // On the down traversal, establish which edges are mergeable and set the list
                // indices.
                let (parent_module, hoisted) = parent_info.map_or((None, false), |(node, ty)| {
                    (
                        Some(node.module),
                        match &ty.chunking_type {
                            ChunkingType::Parallel { hoisted, .. } => *hoisted,
                            _ => false,
                        },
                    )
                });
                let module = node.module;

                Ok(if parent_module.is_some_and(|p| p == module) {
                    // A self-reference
                    GraphTraversalAction::Skip
                } else if hoisted
                    && let Some(parent_module) = parent_module
                    && mergeable.contains(&parent_module)
                    && mergeable.contains(&module)
                    && !async_module_info.contains(&parent_module)
                    && !async_module_info.contains(&module)
                {
                    // ^ TODO technically we could merge a sync child into an async parent

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

                        if module_merged_groups.entry(module).or_default().insert(idx) {
                            // Mark and continue traversal because modified (or first visit)
                            GraphTraversalAction::Continue
                        } else {
                            // Unchanged, no need to forward to children
                            GraphTraversalAction::Skip
                        }
                    } else {
                        // Already visited and assigned a new group, no need to forward to
                        // children.
                        GraphTraversalAction::Skip
                    }
                })
            },
            |successor, _| {
                // Invert the ordering here. High priority values get visited first, and we want to
                // visit the low-depth nodes first, as we are propagating bitmaps downwards.
                Ok(-*module_depth
                    .get(&successor.module)
                    .context("Module depth not found")?)
            },
        )?;

        drop(inner_span);
        let inner_span = tracing::info_span!("chunk group collection").entered();

        span.record("visit_count", visit_count);

        #[derive(Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
        struct ListOccurrence {
            // The field order here is important, these structs will get ordered by the entry
            // index.
            entry: usize,
            list: usize,
            chunk_group: usize,
        }

        // A list of all different execution traces (orderings) of all modules, initially a union of
        // the partition of each chunk's modules (one for each ESM subtree in each chunks), but
        // further split up later on.
        // This is a list (one per chunk group, initially) of lists (one per ESM subtree) of modules
        let mut lists;
        let mut lists_reverse_indices: FxIndexMap<
            ResolvedVc<Box<dyn MergeableModule>>,
            FxIndexSet<ListOccurrence>,
        > = FxIndexMap::default();

        // Once we do the reconciliation below, we need to insert new lists, but the lists are per
        // chunk group, so we put them into this one.
        #[allow(non_snake_case)]
        let LISTS_COMMON_IDX: usize;

        // A map of all references between modules with the same bitmap. These are all references,
        // including reexecution edges and cycles. Used to expose additional modules if the
        // bitmap-groups are split up further.
        #[allow(clippy::type_complexity)]
        let mut intra_group_references: FxIndexMap<
            ResolvedVc<Box<dyn Module>>,
            FxIndexSet<ResolvedVc<Box<dyn Module>>>,
        > = FxIndexMap::default();
        // A map of all references between modules with the same bitmap. These are only the
        // references relevant for execution (ignoring cycles), to find the entries of a group.
        #[allow(clippy::type_complexity)]
        let mut intra_group_references_rev: FxIndexMap<
            ResolvedVc<Box<dyn Module>>,
            FxIndexSet<ResolvedVc<Box<dyn Module>>>,
        > = FxIndexMap::default();

        {
            struct ChunkGroupResult {
                chunk_group_idx: usize,
                lists: Vec<Vec<ResolvedVc<Box<dyn MergeableModule>>>>,
                lists_reverse_indices:
                    FxIndexMap<ResolvedVc<Box<dyn MergeableModule>>, FxIndexSet<ListOccurrence>>,
                #[allow(clippy::type_complexity)]
                intra_group_references_rev: FxIndexMap<
                    ResolvedVc<Box<dyn Module>>,
                    FxIndexSet<ResolvedVc<Box<dyn Module>>>,
                >,
            }

            let result = turbo_tasks::parallel::map_collect_owned::<_, _, Result<Vec<_>>>(
                // TODO without collect
                chunk_group_info.chunk_groups.iter().enumerate().collect(),
                |(chunk_group_idx, chunk_group)| {
                    // A partition of all modules in the chunk into several execution traces
                    // (orderings), stored in the top-level lists and referenced here by
                    // index.
                    let mut chunk_lists: FxHashMap<&RoaringBitmapWrapper, usize> =
                        FxHashMap::with_capacity_and_hasher(
                            module_merged_groups.len() / chunk_group_info.chunk_groups.len(),
                            Default::default(),
                        );

                    // This is necessary to have the correct order with cycles: a `a -> b -> a`
                    // graph would otherwise be visited as `b->a`, `a->b`,
                    // leading to the list `a, b` which is not execution order.
                    let mut visited = FxHashSet::default();

                    let mut lists = vec![];
                    let mut lists_reverse_indices: FxIndexMap<
                        ResolvedVc<Box<dyn MergeableModule>>,
                        FxIndexSet<ListOccurrence>,
                    > = FxIndexMap::default();
                    #[allow(clippy::type_complexity)]
                    let mut intra_group_references_rev: FxIndexMap<
                        ResolvedVc<Box<dyn Module>>,
                        FxIndexSet<ResolvedVc<Box<dyn Module>>>,
                    > = FxIndexMap::default();

                    module_graph.traverse_edges_from_entries_dfs(
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
                            let bitmap = module_merged_groups
                                .get(&module)
                                .context("every module should have a bitmap at this point")?;

                            if mergeable.contains(&module) {
                                let mergeable_module =
                                    ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(module)
                                        .unwrap();
                                match chunk_lists.entry(bitmap) {
                                    Entry::Vacant(e) => {
                                        // New list, insert the module
                                        let idx = lists.len();
                                        e.insert(idx);
                                        lists.push(vec![mergeable_module]);
                                        lists_reverse_indices
                                            .entry(mergeable_module)
                                            .or_default()
                                            .insert(ListOccurrence {
                                                chunk_group: chunk_group_idx,
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
                                            .insert(ListOccurrence {
                                                chunk_group: chunk_group_idx,
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
                            Ok(())
                        },
                    )?;
                    Ok(ChunkGroupResult {
                        chunk_group_idx,
                        lists,
                        lists_reverse_indices,
                        intra_group_references_rev,
                    })
                },
            )?;

            lists = vec![Default::default(); result.len() + 1];
            LISTS_COMMON_IDX = result.len();
            for ChunkGroupResult {
                chunk_group_idx,
                lists: result_lists,
                lists_reverse_indices: result_lists_reverse_indices,
                intra_group_references_rev: result_intra_group_references_rev,
            } in result
            {
                lists[chunk_group_idx] = result_lists;
                for (module, occurrences) in result_lists_reverse_indices {
                    lists_reverse_indices
                        .entry(module)
                        .or_default()
                        .extend(occurrences);
                }
                for (module, occurrences) in result_intra_group_references_rev {
                    intra_group_references_rev
                        .entry(module)
                        .or_default()
                        .extend(occurrences);
                }
            }
        }

        drop(inner_span);
        let inner_span = tracing::info_span!("exposed computation").entered();

        // We use list.pop() below, so reverse order using negation
        lists_reverse_indices
            .sort_by_cached_key(|_, b| b.iter().map(|o| o.entry).min().map(|v| -(v as i64)));

        // Modules that are referenced from outside the group, so their exports need to be exposed.
        // Initially these are set based on the bitmaps (and namespace imports), but more modules
        // might need to be exposed if the lists are split up further below.
        let mut exposed_modules_imported: FxHashSet<ResolvedVc<Box<dyn Module>>> =
            FxHashSet::with_capacity_and_hasher(module_merged_groups.len(), Default::default());
        let mut exposed_modules_namespace: FxHashSet<ResolvedVc<Box<dyn Module>>> =
            FxHashSet::with_capacity_and_hasher(module_merged_groups.len(), Default::default());

        module_graph.traverse_edges_from_entries_dfs(
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

                if parent_info.is_none_or(|(parent, _)| {
                    module_merged_groups.get(&parent.module).unwrap()
                        != module_merged_groups.get(&module).unwrap()
                }) {
                    // This module needs to be exposed:
                    // - referenced from another group or
                    // - an entry module (TODO assume it will be required for Node/Edge, but not
                    // necessarily needed for browser),
                    exposed_modules_imported.insert(module);
                }
                if parent_info.is_some_and(|(_, r)| matches!(r.export, ExportUsage::All)) {
                    // This module needs to be exposed:
                    // - namespace import from another group
                    exposed_modules_namespace.insert(module);
                }
                Ok(())
            },
        )?;

        drop(inner_span);
        let inner_span = tracing::info_span!("reconciliation").entered();
        while let Some((_, common_occurrences)) = lists_reverse_indices.pop() {
            if common_occurrences.len() < 2 {
                // Module exists only in one list, no need to split
                continue;
            }
            // The module occurs in multiple lists, which need to split up so that there is exactly
            // one list containing the module.

            let first_occurrence = &common_occurrences[0];

            // Find the longest common sequence in the lists, starting from the given module.
            let mut common_length = 2;
            loop {
                let m = lists[first_occurrence.chunk_group][first_occurrence.list]
                    .get(first_occurrence.entry + common_length - 1);
                if m.is_some()
                    && common_occurrences.iter().skip(1).all(
                        |ListOccurrence {
                             chunk_group,
                             list,
                             entry,
                         }| {
                            lists[*chunk_group][*list].get(*entry + common_length - 1) == m
                        },
                    )
                {
                    common_length += 1;
                    continue;
                }

                // Went one too far, the common length is what the previous iteration verified
                common_length -= 1;
                break;
            }

            // Split into three lists:
            // - "common" [occurrence.entry .. occurrence.entry + common_length) -- same for all
            // - "before" [0 .. occurrence.entry)
            // - "after"  [occurrence.entry + common_length .. ]
            let common_list = lists[first_occurrence.chunk_group][first_occurrence.list]
                [first_occurrence.entry..first_occurrence.entry + common_length]
                .to_vec();

            let common_list_index = lists[LISTS_COMMON_IDX].len();
            lists[LISTS_COMMON_IDX].push(common_list.clone());

            // Insert occurrences for the "common" list, skip the first because that is now
            // guaranteed to exist only once
            for (i, &m) in common_list.iter().enumerate().skip(1) {
                let occurrences = lists_reverse_indices.get_mut(&m).unwrap();
                for common_occurrence in &common_occurrences {
                    let removed = occurrences.swap_remove(&ListOccurrence {
                        chunk_group: common_occurrence.chunk_group,
                        list: common_occurrence.list,
                        entry: common_occurrence.entry + i,
                    });
                    debug_assert!(removed);
                }
                occurrences.insert(ListOccurrence {
                    chunk_group: LISTS_COMMON_IDX,
                    list: common_list_index,
                    entry: i,
                });
            }

            for common_occurrence in &common_occurrences {
                let list = &mut lists[common_occurrence.chunk_group][common_occurrence.list];
                let after_list = list.split_off(common_occurrence.entry + common_length);
                list.truncate(common_occurrence.entry);
                let before_list = &*list;

                // For all previously merged references (intra_group_references) that now cross
                // "before", "common" and "after", mark the referenced modules as
                // exposed.
                // Note that due to circular dependencies, there can be
                // references that go against execution order (e.g. from "before" to
                // "common").
                {
                    let before_list =
                        FxHashSet::from_iter(before_list.iter().map(|m| ResolvedVc::upcast(*m)));
                    let common_list =
                        FxHashSet::from_iter(common_list.iter().map(|m| ResolvedVc::upcast(*m)));
                    let after_list =
                        FxHashSet::from_iter(after_list.iter().map(|m| ResolvedVc::upcast(*m)));

                    let references_from_before = before_list
                        .iter()
                        .filter_map(|m| intra_group_references.get(m))
                        .flatten()
                        .copied()
                        .filter(|m| common_list.contains(m) || after_list.contains(m))
                        .collect::<FxHashSet<_>>();
                    let references_from_common = common_list
                        .iter()
                        .filter_map(|m| intra_group_references.get(m))
                        .flatten()
                        .filter(|m| before_list.contains(m) || after_list.contains(m))
                        .collect::<FxHashSet<_>>();
                    let references_from_after = after_list
                        .iter()
                        .filter_map(|m| intra_group_references.get(m))
                        .flatten()
                        .copied()
                        .filter(|m| before_list.contains(m) || common_list.contains(m))
                        .collect::<FxHashSet<_>>();

                    let modules_to_expose = before_list
                        .iter()
                        .chain(common_list.iter())
                        .chain(after_list.iter())
                        .copied()
                        .filter(|m| {
                            references_from_before.contains(m)
                                || references_from_common.contains(m)
                                || references_from_after.contains(m)
                        });

                    exposed_modules_imported.extend(modules_to_expose);
                }

                // The occurrences for the "before" list (`list`) are still valid, need to update
                // the occurrences for the "after" list
                if !after_list.is_empty() {
                    let after_index = lists[LISTS_COMMON_IDX].len();
                    lists[LISTS_COMMON_IDX].push(after_list.clone());
                    for (i, &m) in after_list.iter().enumerate() {
                        let Some(occurrences) = lists_reverse_indices.get_mut(&m) else {
                            bail!("Couldn't find module in reverse list");
                        };

                        let removed = occurrences.swap_remove(&ListOccurrence {
                            chunk_group: common_occurrence.chunk_group,
                            list: common_occurrence.list,
                            entry: common_occurrence.entry + common_length + i,
                        });
                        debug_assert!(removed);

                        occurrences.insert(ListOccurrence {
                            chunk_group: LISTS_COMMON_IDX,
                            list: after_index,
                            entry: i,
                        });
                    }
                }
            }
        }

        // Dedupe the lists
        let lists = lists.into_iter().flatten().collect::<FxHashSet<_>>();

        drop(inner_span);
        let inner_span = tracing::info_span!("merging");
        // Call MergeableModule impl to merge the modules.
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

                let entry_points = list
                    .iter()
                    .filter(|m| {
                        intra_group_references_rev
                            .get(&ResolvedVc::upcast(**m))
                            .is_none_or(|refs| refs.is_disjoint(&list_set))
                    })
                    .map(|m| **m)
                    .collect::<Vec<_>>();
                debug_assert_ne!(entry_points.len(), 0);

                let list_exposed = list
                    .iter()
                    .map(|&m| {
                        (
                            m,
                            if exposed_modules_imported.contains(&ResolvedVc::upcast(m)) {
                                MergeableModuleExposure::External
                            } else if exposed_modules_namespace.contains(&ResolvedVc::upcast(m)) {
                                MergeableModuleExposure::Internal
                            } else {
                                MergeableModuleExposure::None
                            },
                        )
                    })
                    .collect::<Vec<_>>();

                let entry = *list.last().unwrap();
                let result = entry
                    .merge(
                        MergeableModulesExposed::interned(list_exposed),
                        MergeableModules::interned(entry_points),
                    )
                    .to_resolved()
                    .await?;

                let list_len = list.len();
                Ok(Some((
                    ResolvedVc::upcast::<Box<dyn Module>>(entry),
                    result,
                    list.into_iter()
                        .take(list_len - 1)
                        .map(ResolvedVc::upcast::<Box<dyn Module>>)
                        .collect::<Vec<_>>(),
                )))
            })
            .try_join()
            .instrument(inner_span)
            .await?;

        #[allow(clippy::type_complexity)]
        let mut replacements: FxHashMap<
            ResolvedVc<Box<dyn Module>>,
            ResolvedVc<Box<dyn ChunkableModule>>,
        > = Default::default();
        #[allow(clippy::type_complexity)]
        let mut replacements_to_original: FxHashMap<
            ResolvedVc<Box<dyn Module>>,
            ResolvedVc<Box<dyn Module>>,
        > = Default::default();
        let mut included: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();

        for (original, replacement, replacement_included) in result.into_iter().flatten() {
            replacements.insert(original, replacement);
            replacements_to_original.insert(ResolvedVc::upcast(replacement), original);
            included.extend(replacement_included);
        }

        span.record("merged_groups", replacements.len());
        span.record("included_modules", included.len());

        Ok(MergedModuleInfo {
            replacements,
            replacements_to_original,
            included,
        }
        .cell())
    }
    .instrument(span_outer)
    .await
}
