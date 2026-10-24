use std::{cmp::Reverse, collections::hash_map::Entry, hash::Hash};

use anyhow::{Context, Result, bail};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_bitset::Bitset;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};

use crate::{
    chunk::{
        ChunkableModule, ChunkingType, MergeableModule, MergeableModuleExposure, MergeableModules,
        MergeableModulesExposed,
    },
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, RefData},
    resolve::ExportUsage,
};

#[turbo_tasks::value(transparent, cell = "keyed")]
#[allow(clippy::type_complexity)]
pub struct MergedModulesReplacements(
    FxHashMap<ResolvedVc<Box<dyn Module>>, Option<ResolvedVc<Box<dyn ChunkableModule>>>>,
);

#[turbo_tasks::value(transparent, cell = "keyed")]
#[allow(clippy::type_complexity)]
pub struct MergedModulesOriginalModules(
    FxHashMap<ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>>,
);

#[turbo_tasks::value]
pub struct MergedModuleInfo {
    /// A map of modules describing how they participate in module merging:
    /// - Not present: the module is not affected by merging and a regular chunk item should be
    ///   created for it.
    /// - Present with `Some(replacement)`: the module should be replaced with the given merged
    ///   module when creating a chunk item.
    /// - Present with `None`: the module is already included in some other merged module returned
    ///   by a `Some(replacement)` entry and no chunk item should be created for it.
    pub replacements: ResolvedVc<MergedModulesReplacements>,
    /// A map of replacement modules to their corresponding chunk group info (which is the same as
    /// the chunk group info of the original module it replaced).
    pub replacements_to_original: ResolvedVc<MergedModulesOriginalModules>,
}

impl MergedModuleInfo {
    /// Returns the merging decision for the given module:
    /// - `None`: the module is not affected by merging, keep it as-is.
    /// - `Some(None)`: the module is already included in another merged module, skip it.
    /// - `Some(Some(replacement))`: the module should be replaced with `replacement`.
    pub async fn should_replace_module(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Option<Option<ResolvedVc<Box<dyn ChunkableModule>>>>> {
        Ok(self.replacements.get(&module).await?.as_deref().copied())
    }

    /// Returns the original module for the given replacement module (useful for retrieving the
    /// chunk group info).
    pub async fn get_original_module(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Option<ResolvedVc<Box<dyn Module>>>> {
        Ok(self
            .replacements_to_original
            .get(&module)
            .await?
            .as_deref()
            .copied())
    }
}

/// Assigns each distinct bitmap a dense id, starting at 0, so that callers can hash and compare a
/// `u32` instead of a whole bitmap. Equal bitmaps get the same id. Returns the id of every key and
/// the number of distinct bitmaps.
fn intern_bitmaps<'a, K: Eq + Hash>(
    entries: impl IntoIterator<Item = (K, &'a Bitset)>,
    capacity: usize,
) -> (FxHashMap<K, u32>, usize) {
    let mut ids: FxHashMap<&'a Bitset, u32> = FxHashMap::default();
    let mut result = FxHashMap::with_capacity_and_hasher(capacity, Default::default());
    for (key, bitmap) in entries {
        let next_id = ids.len() as u32;
        result.insert(key, *ids.entry(bitmap).or_insert(next_id));
    }
    (result, ids.len())
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
        let async_module_info = module_graph.async_module_info();
        let chunk_group_info = module_graph.chunk_group_info().await?;
        let module_graph = module_graph.await?;

        let graphs = &module_graph.graphs;
        let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();
        span.record("module_count", module_count);

        // Use all entries from all graphs
        let entries = module_graph
            .all_chunk_group_entry_modules()
            .collect::<Vec<_>>();

        // First, rank every module in reverse postorder, so that a module is visited after the
        // modules importing it. The ranks from the entries of the graph are shared with other
        // analyses of this graph (e.g. the chunk group info).
        let module_rank = {
            let _inner_span = tracing::info_span!("compute reverse postorder").entered();
            module_graph.entry_ranks()?
        };

        // For each module, the indices in the bitmap store which merge group entry modules
        // transitively import that module. The bitmap can be treated as an opaque value, merging
        // all modules with the same bitmap.
        let mut module_merged_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset> =
            FxHashMap::with_capacity_and_hasher(module_count, Default::default());
        // Entries that started a new merge group for some deopt reason
        let mut entry_modules =
            FxHashSet::with_capacity_and_hasher(module_count, Default::default());

        let inner_span = tracing::info_span!("collect mergeable modules");
        let mergeable = module_graph
            .iter_reachable_modules()?
            .map(async |module| {
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

        // Pre-fetch async status for all mergeable modules using keyed access to avoid
        // reading the full AsyncModulesInfo set during the synchronous traversal below.
        let inner_span = tracing::info_span!("pre-fetch async module status");
        let async_modules: FxHashSet<_> = mergeable
            .iter()
            .map(async |&module| Ok(async_module_info.is_async(module).await?.then_some(module)))
            .try_flat_join()
            .instrument(inner_span)
            .await?
            .into_iter()
            .collect();

        let inner_span = tracing::info_span!("fixed point traversal").entered();

        let mut next_index = 0u32;
        let visit_count = module_graph.traverse_edges_fixed_point_with_priority(
            entries
                .iter()
                .map(|e| {
                    Ok((
                        *e,
                        Reverse(*module_rank.get(e).context("Module rank not found")?),
                    ))
                })
                .collect::<Result<Vec<_>>>()?,
            &mut (),
            |parent_info: Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData, _)>,
             node: ResolvedVc<Box<dyn Module>>,
             _,
             _|
             -> Result<GraphTraversalAction> {
                // On the down traversal, establish which edges are mergeable and set the list
                // indices.
                let (parent_module, hoisted) =
                    parent_info.map_or((None, false), |(node, ty, _)| {
                        (
                            Some(node),
                            match &ty.chunking_type {
                                ChunkingType::Parallel { hoisted, .. } => *hoisted,
                                _ => false,
                            },
                        )
                    });
                let module = node;

                Ok(if parent_module.is_some_and(|p| p == module) {
                    // A self-reference
                    GraphTraversalAction::Skip
                } else if hoisted
                    && let Some(parent_module) = parent_module
                    && mergeable.contains(&parent_module)
                    && mergeable.contains(&module)
                    && !async_modules.contains(&parent_module)
                    && !async_modules.contains(&module)
                {
                    // ^ TODO technically we could merge a sync child into an async parent

                    // A hoisted reference from a mergeable module to a non-async mergeable
                    // module, inherit bitmaps from parent.
                    module_merged_groups.entry(node).or_default();
                    let [Some(parent_merged_groups), Some(current_merged_groups)] =
                        module_merged_groups.get_disjoint_mut([&parent_module, &node])
                    else {
                        // All modules are inserted in the previous iteration
                        bail!("unreachable except for eventual consistency");
                    };

                    if current_merged_groups.is_zero() {
                        // Initial visit, clone instead of merging
                        *current_merged_groups = parent_merged_groups.clone();
                        GraphTraversalAction::Continue
                    } else if !parent_merged_groups.is_subset(current_merged_groups) {
                        // Add bits from parent, and continue traversal because changed
                        *current_merged_groups |= &*parent_merged_groups;
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
                // Visit modules in reverse postorder (lowest rank first, the traversal visits the
                // highest priority first), as we are propagating bitmaps downwards.
                Ok(Reverse(
                    *module_rank
                        .get(&successor)
                        .context("Module rank not found")?,
                ))
            },
        )?;

        drop(inner_span);

        // The traversals below look up and compare the bitmaps of many modules (once per visit),
        // so use a dense id per distinct bitmap instead of the bitmaps themselves.
        let module_bitmap_ids = {
            let _inner_span = tracing::info_span!("intern bitmaps").entered();
            intern_bitmaps(
                module_merged_groups
                    .iter()
                    .map(|(&module, bitmap)| (module, bitmap)),
                module_merged_groups.len(),
            )
            .0
        };
        let bitmap_id = |module: ResolvedVc<Box<dyn Module>>| {
            module_bitmap_ids
                .get(&module)
                .copied()
                .context("every module should have a bitmap")
        };

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
                first_chunk_group_idx: usize,
                #[allow(clippy::type_complexity)]
                list_lists: Vec<Vec<Vec<ResolvedVc<Box<dyn MergeableModule>>>>>,
                lists_reverse_indices:
                    FxIndexMap<ResolvedVc<Box<dyn MergeableModule>>, FxIndexSet<ListOccurrence>>,
                #[allow(clippy::type_complexity)]
                intra_group_references_rev: FxIndexMap<
                    ResolvedVc<Box<dyn Module>>,
                    FxIndexSet<ResolvedVc<Box<dyn Module>>>,
                >,
            }
            let span = tracing::info_span!("map chunk groups").entered();

            let result = turbo_tasks::parallel::map_collect_chunked_owned::<_, _, Result<Vec<_>>>(
                // TODO without collect
                chunk_group_info.chunk_groups.iter().enumerate().collect(),
                |chunk| {
                    let mut list_lists = vec![];
                    let mut lists_reverse_indices: FxIndexMap<
                        ResolvedVc<Box<dyn MergeableModule>>,
                        FxIndexSet<ListOccurrence>,
                    > = FxIndexMap::default();
                    #[allow(clippy::type_complexity)]
                    let mut intra_group_references_rev: FxIndexMap<
                        ResolvedVc<Box<dyn Module>>,
                        FxIndexSet<ResolvedVc<Box<dyn Module>>>,
                    > = FxIndexMap::default();

                    let mut chunk = chunk.peekable();
                    let first_chunk_group_idx = chunk.peek().unwrap().0;

                    for (chunk_group_idx, chunk_group) in chunk {
                        let mut lists = vec![];

                        // A partition of all modules in the chunk into several execution traces
                        // (orderings), stored in the top-level lists and referenced here by
                        // index.
                        // Keyed by bitmap id.
                        let mut chunk_lists: FxHashMap<u32, usize> =
                            FxHashMap::with_capacity_and_hasher(
                                module_merged_groups.len() / chunk_group_info.chunk_groups.len(),
                                Default::default(),
                            );

                        // This is necessary to have the correct order with cycles: a `a -> b -> a`
                        // graph would otherwise be visited as `b->a`, `a->b`,
                        // leading to the list `a, b` which is not execution order.
                        let mut visited = FxHashSet::default();

                        module_graph.traverse_edges_dfs(
                            chunk_group.entries(),
                            &mut (),
                            |parent_info, node, _| {
                                if parent_info.is_none_or(|(_, r)| r.chunking_type.is_parallel())
                                    && visited.insert(node)
                                {
                                    Ok(GraphTraversalAction::Continue)
                                } else {
                                    Ok(GraphTraversalAction::Exclude)
                                }
                            },
                            |parent_info, node, _| {
                                let module = node;
                                let bitmap = bitmap_id(module)?;

                                if mergeable.contains(&module) {
                                    let mergeable_module =
                                        ResolvedVc::try_downcast::<Box<dyn MergeableModule>>(
                                            module,
                                        )
                                        .context(
                                            "found mergeable module which is not a MergeableModule",
                                        )?;
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
                                    let same_bitmap = bitmap_id(parent)? == bitmap;

                                    if same_bitmap {
                                        intra_group_references_rev
                                            .entry(module)
                                            .or_default()
                                            .insert(parent);
                                    }
                                }
                                Ok(())
                            },
                            false,
                            false,
                        )?;

                        list_lists.push(lists);
                    }
                    Ok(ChunkGroupResult {
                        first_chunk_group_idx,
                        list_lists,
                        lists_reverse_indices,
                        intra_group_references_rev,
                    })
                },
            )?;

            drop(span);
            let _span = tracing::info_span!("merging chunk group lists").entered();

            lists_reverse_indices
                .reserve_exact(result.iter().map(|r| r.lists_reverse_indices.len()).sum());
            intra_group_references_rev.reserve_exact(
                result
                    .iter()
                    .map(|r| r.intra_group_references_rev.len())
                    .sum(),
            );

            lists = vec![Default::default(); chunk_group_info.chunk_groups.len() + 1];
            LISTS_COMMON_IDX = result.len();
            for ChunkGroupResult {
                first_chunk_group_idx,
                list_lists: result_lists,
                lists_reverse_indices: result_lists_reverse_indices,
                intra_group_references_rev: result_intra_group_references_rev,
            } in result
            {
                lists.splice(
                    first_chunk_group_idx..(first_chunk_group_idx + result_lists.len()),
                    result_lists,
                );
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

        module_graph.traverse_edges_dfs(
            entries,
            &mut (),
            |_, _, _| Ok(GraphTraversalAction::Continue),
            |parent_info, node, _| {
                let module = node;

                if let Some((parent, _)) = parent_info {
                    let same_bitmap = bitmap_id(parent)? == bitmap_id(module)?;

                    if same_bitmap {
                        intra_group_references
                            .entry(parent)
                            .or_default()
                            .insert(module);
                    }
                }

                if match parent_info {
                    None => true,
                    Some((parent, _)) => bitmap_id(parent)? != bitmap_id(module)?,
                } {
                    // This module needs to be exposed:
                    // - referenced from another group or
                    // - an entry module (TODO assume it will be required for Node/Edge, but not
                    // necessarily needed for browser),
                    exposed_modules_imported.insert(module);
                }
                if parent_info.is_some_and(|(_, r)| {
                    matches!(
                        r.binding_usage.export,
                        ExportUsage::All
                            | ExportUsage::PartialNamespaceObject(_)
                            | ExportUsage::Passthrough { .. }
                    )
                }) {
                    // This module needs to be exposed:
                    // - namespace import from another group
                    exposed_modules_namespace.insert(module);
                }
                Ok(())
            },
            false,
            false,
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
                let occurrences = lists_reverse_indices
                    .get_mut(&m)
                    .context("every module should have occurrences")?;
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
            Option<ResolvedVc<Box<dyn ChunkableModule>>>,
        > = Default::default();
        #[allow(clippy::type_complexity)]
        let mut replacements_to_original: FxHashMap<
            ResolvedVc<Box<dyn Module>>,
            ResolvedVc<Box<dyn Module>>,
        > = Default::default();
        let mut merged_groups = 0;
        let mut included_modules = 0;

        for (original, replacement, replacement_included) in result.into_iter().flatten() {
            replacements.insert(original, Some(replacement));
            replacements_to_original.insert(ResolvedVc::upcast(replacement), original);
            merged_groups += 1;
            included_modules += replacement_included.len();
            for included in replacement_included {
                replacements.insert(included, None);
            }
        }

        span.record("merged_groups", merged_groups);
        span.record("included_modules", included_modules);

        Ok(MergedModuleInfo {
            replacements: ResolvedVc::cell(replacements),
            replacements_to_original: ResolvedVc::cell(replacements_to_original),
        }
        .cell())
    }
    .instrument(span_outer)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bitmap(bits: &[u32]) -> Bitset {
        bits.iter().copied().collect()
    }

    #[test]
    fn intern_bitmaps_gives_equal_bitmaps_equal_ids() {
        let a = bitmap(&[1, 5, 100_000]);
        let a_reordered = bitmap(&[100_000, 1, 5]);
        let b = bitmap(&[1, 5]);
        let empty = bitmap(&[]);
        let empty2 = bitmap(&[]);
        let entries = [
            ("a", &a),
            ("b", &b),
            ("a_reordered", &a_reordered),
            ("empty", &empty),
            ("empty2", &empty2),
        ];

        let (ids, distinct) = intern_bitmaps(entries.iter().copied(), entries.len());

        assert_eq!(distinct, 3);
        assert_eq!(ids.len(), entries.len());
        assert_eq!(ids["a"], ids["a_reordered"]);
        assert_eq!(ids["empty"], ids["empty2"]);
        assert_ne!(ids["a"], ids["b"]);
        assert_ne!(ids["a"], ids["empty"]);
        assert_ne!(ids["b"], ids["empty"]);
        // Ids are dense and start at zero.
        let mut all = ids.values().copied().collect::<Vec<_>>();
        all.sort_unstable();
        all.dedup();
        assert_eq!(all, vec![0, 1, 2]);
    }
}
