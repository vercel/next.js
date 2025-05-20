use std::collections::hash_map::Entry;

use anyhow::Result;
use roaring::RoaringBitmap;
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ResolvedVc, SliceMap, TryFlatJoinIterExt, TryJoinIterExt,
    ValueToString, Vc,
};

use crate::{
    chunk::{
        ChunkableModule, ChunkingType, MergeableModule, MergeableModuleResult, MergeableModules,
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

        let mut next_index = 0u32;

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

        // A list of all different execution traces (orders) of all modules, initially one for each
        // ESM subtree in the chunks, but futher split up later on.
        let mut lists: FxIndexMap<
            RoaringBitmapWrapper,
            FxIndexSet<ResolvedVc<Box<dyn MergeableModule>>>,
        > = FxIndexMap::with_capacity_and_hasher(module_merged_groups.len(), Default::default());
        // Modules that are referenced from outside the group, so their exports need to be exposed.
        let mut exposed_modules: FxHashSet<ResolvedVc<Box<dyn Module>>> =
            FxHashSet::with_capacity_and_hasher(module_merged_groups.len(), Default::default());

        let mut visited = FxHashSet::default();
        module_graph
            .traverse_edges_from_entries_topological(
                entries.iter().copied(),
                &mut (),
                |_, node, _| {
                    // This is necessary to have the correct order with cycles: a `a -> b -> a`
                    // graph would otherwise be visited as `b->a`, `a->b`,
                    // leading to the list `a, b` which is not execution order.

                    if visited.insert(node.module) {
                        Ok(GraphTraversalAction::Continue)
                    } else {
                        Ok(GraphTraversalAction::Exclude)
                    }
                },
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

        // TODO ideally this would be done in the previous traversal, but we need to traverse all
        // edges here, which screws up the order for `lists`
        module_graph
            .traverse_edges_from_entries_topological(
                entries,
                &mut (),
                |_, _, _| Ok(GraphTraversalAction::Continue),
                |parent_info, node, _| {
                    let module = node.module;

                    if parent_info.is_none_or(|(parent, r)| {
                        (module_merged_groups.get(&parent.module).unwrap()
                            != module_merged_groups.get(&module).unwrap())
                            || matches!(r.export, ExportUsage::All)
                    }) {
                        // A reference from another group or a namespace import, this module needs
                        // to be exposed.
                        exposed_modules.insert(module);
                    }
                },
            )
            .await?;

        // println!(
        //     "lists {:#?}",
        //     lists
        //         .iter()
        //         .filter(|(_, v)| v.len() > 1)
        //         .map(|(_, l)| l.iter().map(|m| m.ident().to_string()).try_join())
        //         .try_join()
        //         .await?
        // );

        // Call MergeableModule impl to merge the modules (or not, if they are rejected).
        let result = lists
            .into_values()
            .map(async |list| {
                if list.len() < 2 {
                    // Nothing to merge
                    return Ok(None);
                }

                let entry = *list.last().unwrap();

                let list_exposed = list
                    .iter()
                    .map(|&m| (m, exposed_modules.contains(&ResolvedVc::upcast(m))))
                    .collect::<Vec<_>>();

                let result = entry
                    .merge(MergeableModules::interned(list_exposed))
                    .to_resolved()
                    .await?;

                let list_len = list.len();
                Ok(Some((
                    [(ResolvedVc::upcast::<Box<dyn Module>>(entry), result)],
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
        let mut included: FxHashSet<ResolvedVc<Box<dyn Module>>> = FxHashSet::default();

        for (replacements_part, included_part) in result.into_iter().flatten() {
            replacements.extend(replacements_part.into_iter());
            included.extend(included_part);
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
            included,
        }
        .cell())
    }
    .instrument(span_outer)
    .await
}
