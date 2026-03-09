use anyhow::{Context, Result, bail};
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::ChunkingType,
    emit_collect::CollectingModule,
    module::Module,
    module_graph::{
        GraphNodeIndex, GraphTraversalAction, ModuleGraph, RefData,
        chunk_group_info::{ChunkGroupEntry, RoaringBitmapWrapper},
    },
};

#[turbo_tasks::value]
#[allow(clippy::type_complexity)]
pub struct CollectedModules {
    /// Additional references that need to be added to the graph due to collecting modules. They
    /// are conditional based on the current page being chunked.
    ///
    /// (Page Entry Module, Collecting Module) -> Vec<(Reference, Collected Module)>
    pub collected_references: FxHashMap<
        (ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>),
        // TODO this GraphNodeIndex can be removed again
        Vec<(RefData, ResolvedVc<Box<dyn Module>>, GraphNodeIndex)>,
    >,
}

#[tracing::instrument(level = "info", name = "compute emit-collect", skip_all)]
pub async fn collect_graph(graph: Vc<ModuleGraph>) -> Result<Vc<CollectedModules>> {
    let graph = graph.await?;
    let graphs = &graph.graphs;

    let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();

    // Notably, this is not g.entries()! We are only interested in ChunkGroupEntry::Entry here
    let entries = graphs
        .iter()
        .flat_map(|g| g.entries.iter())
        .flat_map(|g| match g {
            ChunkGroupEntry::Entry(entries) => Some(entries),
            _ => None,
        })
        .flatten()
        .copied()
        .collect::<Vec<_>>();

    let mut module_entry_membership: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
        entries
            .iter()
            .enumerate()
            .map(|(i, e)| (*e, RoaringBitmapWrapper([i as u32].into())))
            .collect();

    // First, compute the depth for each module in the graph
    let module_depth: FxHashMap<ResolvedVc<Box<dyn Module>>, usize> = {
        let mut module_depth =
            FxHashMap::with_capacity_and_hasher(module_count, Default::default());
        graph.traverse_edges_bfs(entries.iter().copied(), |parent, node| {
            if let Some((parent, _)) = parent {
                let parent_depth = *module_depth
                    .get(&parent)
                    .context("Module depth not found")?;
                module_depth.entry(node).or_insert(parent_depth + 1);
            } else {
                module_depth.insert(node, 0);
            };

            module_entry_membership.entry(node).or_default();

            Ok(GraphTraversalAction::Continue)
        })?;
        module_depth
    };

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct TraversalPriority {
        depth: usize,
        bitmap_len: u64,
    }
    impl PartialOrd for TraversalPriority {
        fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
            Some(self.cmp(other))
        }
    }
    impl Ord for TraversalPriority {
        fn cmp(&self, other: &Self) -> std::cmp::Ordering {
            // BinaryHeap prioritizes high values

            // Smaller depth has higher priority
            let depth_order = self.depth.cmp(&other.depth).reverse();
            // Smaller bitmap length has higher priority
            let bitmap_len_order = self.bitmap_len.cmp(&other.bitmap_len).reverse();

            depth_order.then(bitmap_len_order)
        }
    }

    let mut collecting_modules: FxIndexSet<ResolvedVc<Box<dyn CollectingModule>>> =
        FxIndexSet::default();
    #[allow(clippy::type_complexity)]
    let mut emitted_references: FxIndexSet<(
        &RefData,
        ResolvedVc<Box<dyn Module>>,
        GraphNodeIndex,
    )> = FxIndexSet::default();

    graph.traverse_edges_fixed_point_with_priority(
        entries
            .iter()
            .map(|e| {
                Ok((
                    *e,
                    TraversalPriority {
                        depth: *module_depth.get(e).context("Module depth not found")?,
                        bitmap_len: 0,
                    },
                ))
            })
            .collect::<Result<Vec<_>>>()?,
        &mut (&mut module_entry_membership, &mut emitted_references),
        |parent_info: Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData, _)>,
         node: ResolvedVc<Box<dyn Module>>,
         node_idx: GraphNodeIndex,
         (module_entry_membership, emitted_references)|
         -> Result<GraphTraversalAction> {
            let Some((parent, ref_data, _)) = parent_info else {
                // An entry module
                return Ok(GraphTraversalAction::Continue);
            };

            if let ChunkingType::Emitted { .. } = ref_data.chunking_type {
                emitted_references.insert((ref_data, node, node_idx));
            }

            if let Some(node) = ResolvedVc::try_downcast::<Box<dyn CollectingModule>>(node) {
                collecting_modules.insert(node);
            }

            if parent == node {
                // A self-reference
                Ok(GraphTraversalAction::Skip)
            } else {
                let [Some(parent_membership), Some(current_membership)] =
                    module_entry_membership.get_disjoint_mut([&parent, &node])
                else {
                    // All modules are inserted in the previous iteration
                    // Technically unreachable, but could be reached due to eventual
                    // consistency
                    bail!("Module entry membership not found");
                };

                if current_membership.is_empty() {
                    // Initial visit, clone instead of merging
                    *current_membership = parent_membership.clone();
                    Ok(GraphTraversalAction::Continue)
                } else if parent_membership.is_proper_superset(current_membership) {
                    // Add bits from parent, and continue traversal because changed
                    **current_membership |= &**parent_membership;
                    Ok(GraphTraversalAction::Continue)
                } else {
                    // Unchanged, no need to forward to children
                    Ok(GraphTraversalAction::Skip)
                }
            }
        },
        |successor, (module_entry_membership, _)| {
            Ok(TraversalPriority {
                depth: *module_depth
                    .get(&successor)
                    .context("Module depth not found")?,
                bitmap_len: module_entry_membership
                    .get(&successor)
                    .context("Module entry membership not found")?
                    .len(),
            })
        },
    )?;

    // println!("after graph:");
    // println!(
    //     "{:#?}",
    //     entries
    //         .iter()
    //         .enumerate()
    //         .map(async |(i, m)| Ok((i, m.ident_string().await?)))
    //         .try_join()
    //         .await?
    // );

    // println!(
    //     "{:#?}",
    //     emitted_references
    //         .iter()
    //         .map(async |(data, target, _)| Ok((
    //             data,
    //             target.ident_string().await?,
    //             module_entry_membership.get(target)
    //         )))
    //         .try_join()
    //         .await?
    // );

    // println!(
    //     "{:#?}",
    //     collecting_modules
    //         .iter()
    //         .map(async |target| Ok((
    //             target.ident_string().await?,
    //             target.namespace().await?,
    //             module_entry_membership.get(&ResolvedVc::upcast(*target))
    //         )))
    //         .try_join()
    //         .await?
    // );

    let collecting_modules = {
        let mut map: FxHashMap<RcStr, Vec<ResolvedVc<Box<dyn CollectingModule>>>> =
            FxHashMap::default();
        for (m, namespace) in collecting_modules
            .iter()
            .map(async |target| Ok((*target, target.namespace().owned().await?)))
            .try_join()
            .await?
        {
            map.entry(namespace).or_default().push(m);
        }
        map
    };

    #[allow(clippy::type_complexity)]
    let mut collected_references: FxHashMap<
        (ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>),
        Vec<(RefData, ResolvedVc<Box<dyn Module>>, GraphNodeIndex)>,
    > = FxHashMap::default();

    for (ref_data, emitted_module, emitted_module_idx) in emitted_references {
        let emitted_membership = module_entry_membership
            .get(&emitted_module)
            .context("Module entry membership not found")?;

        let ChunkingType::Emitted {
            merge_tag,
            is_async,
            emit_to_all_entries,
        } = &ref_data.chunking_type
        else {
            bail!("unreachable: expected emitted reference");
        };

        for collecting_module in collecting_modules.get(merge_tag).into_iter().flatten() {
            let collecting_membership = module_entry_membership
                .get(&ResolvedVc::upcast(*collecting_module))
                .context("Module entry membership not found")?;

            if *emit_to_all_entries || !collecting_membership.is_disjoint(emitted_membership) {
                for entry in collecting_membership.iter() {
                    if *emit_to_all_entries || emitted_membership.contains(entry) {
                        collected_references
                            .entry((
                                entries[entry as usize],
                                ResolvedVc::upcast(*collecting_module),
                            ))
                            .or_default()
                            .push((
                                RefData {
                                    chunking_type: ChunkingType::Collected {
                                        merge_tag: merge_tag.clone(),
                                        is_async: *is_async,
                                    },
                                    ..ref_data.clone()
                                },
                                emitted_module,
                                emitted_module_idx,
                            ));
                    }
                }
            }
        }
    }

    // println!("result:");
    // println!(
    //     "{:#?}",
    //     collected_references
    //         .iter()
    //         .map(async |((page, collecting), references)| Ok((
    //             page.ident_string().await?,
    //             collecting.ident_string().await?,
    //             references
    //                 .iter()
    //                 .map(async |(data, target, _)| {
    //                     Ok((&data.chunking_type, target.ident_string().await?))
    //                 })
    //                 .try_join()
    //                 .await?
    //         )))
    //         .try_join()
    //         .await?
    // );

    Ok(CollectedModules {
        collected_references,
    }
    .cell())
}
