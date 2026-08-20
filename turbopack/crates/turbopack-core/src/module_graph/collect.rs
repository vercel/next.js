use std::borrow::Cow;

use anyhow::{Context, Result, bail};
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};

use crate::{
    chunk::ChunkingType,
    emit_collect::CollectingModule,
    issue::{IssueExt, module::ModuleIssue},
    module::Module,
    module_graph::{
        GraphTraversalAction, ModuleGraph, RefData,
        chunk_group_info::{ChunkGroupEntry, RoaringBitmapWrapper, TraversalPriority},
    },
};

#[turbo_tasks::value(transparent, cell = "keyed")]
#[allow(clippy::type_complexity)]
/// Additional references that need to be added to the graph due to collecting modules. They
/// are conditional based on the current page being chunked.
///
/// (Collecting Module) -> Vec<(ChunkGroup::Entry Modules, Vec<(Reference, Collected Module)>)>
pub struct CollectedModules(
    #[bincode(with = "turbo_bincode::indexmap")]
    FxIndexMap<
        ResolvedVc<Box<dyn Module>>,
        Vec<(
            Vec<ResolvedVc<Box<dyn Module>>>,
            Vec<(RefData, ResolvedVc<Box<dyn Module>>)>,
        )>,
    >,
);

// The goal is:
// 1. Find all ChunkingType::Emitted references
// 2. Find all CollectingModules
// 3. For each CollectingModule, collect all emitted references within the same ChunkGroup::Entry as
//    the CollectingModule where the .namespace() matches.
#[tracing::instrument(level = "info", name = "compute emit-collect", skip_all)]
pub async fn collect_graph(graph: Vc<ModuleGraph>) -> Result<Vc<CollectedModules>> {
    let graph = graph.await?;
    let graphs = &graph.graphs;

    let module_count = graphs.iter().map(|g| g.graph.node_count()).sum::<usize>();

    let entry_groups = graph
        .all_chunk_group_entries()
        .flat_map(|g| match g {
            ChunkGroupEntry::Entry {
                modules: entries, ..
            } => Some(entries),
            _ => None,
        })
        .collect::<Vec<_>>();
    let entry_group_modules = entry_groups
        .iter()
        .flat_map(|entries| entries.iter().copied())
        .collect::<Vec<_>>();

    // Create a mapping of module -> ChunkGroupEntry::Entry that import it
    let mut module_entry_membership: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
        FxHashMap::with_capacity_and_hasher(module_count, Default::default());
    for (i, entries) in entry_groups.iter().enumerate() {
        for entry in *entries {
            module_entry_membership
                .entry(*entry)
                .or_default()
                .insert(i as u32);
        }
    }

    // First, compute the depth for each module in the graph
    let module_depth: FxHashMap<ResolvedVc<Box<dyn Module>>, usize> = {
        let mut module_depth =
            FxHashMap::with_capacity_and_hasher(module_count, Default::default());
        graph.traverse_edges_bfs(entry_group_modules.iter().copied(), |parent, node| {
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

    // - Discover all collecting module
    // - Discover all emitted references
    // - Set module_entry_membership
    let mut collecting_modules: FxIndexSet<ResolvedVc<Box<dyn CollectingModule>>> =
        FxIndexSet::default();
    let mut emitted_references: FxIndexSet<(&RefData, ResolvedVc<Box<dyn Module>>)> =
        FxIndexSet::default();
    graph.traverse_edges_fixed_point_with_priority(
        entry_group_modules
            .iter()
            .map(|e| {
                Ok((
                    *e,
                    TraversalPriority {
                        depth: *module_depth.get(e).context("Module depth not found")?,
                        chunk_group_len: 0,
                    },
                ))
            })
            .collect::<Result<Vec<_>>>()?,
        &mut (&mut module_entry_membership, &mut emitted_references),
        |parent_info: Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData, _)>,
         node: ResolvedVc<Box<dyn Module>>,
         _,
         (module_entry_membership, emitted_references)|
         -> Result<GraphTraversalAction> {
            if let Some(node) = ResolvedVc::try_downcast::<Box<dyn CollectingModule>>(node) {
                collecting_modules.insert(node);
            }

            let Some((parent, ref_data, _)) = parent_info else {
                // An entry module
                return Ok(GraphTraversalAction::Continue);
            };

            if let ChunkingType::Emitted { .. } = ref_data.chunking_type {
                emitted_references.insert((ref_data, node));
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
                chunk_group_len: module_entry_membership
                    .get(&successor)
                    .context("Module entry membership not found")?
                    .len(),
            })
        },
    )?;

    for collecting_module in &collecting_modules {
        let collecting_module = ResolvedVc::upcast(*collecting_module);
        let collecting_membership = module_entry_membership
            .get(&collecting_module)
            .context("Module entry membership not found")?;

        if collecting_membership.len() > 1 {
            ModuleIssue::new(
                *collecting_module.ident().to_resolved().await?,
                rcstr!("Invalid use of __turbopack_collect__"),
                rcstr!(
                    "A module containing __turbopack_collect__ must not be reachable from \
                     multiple entry chunk groups. Move the call into an entry-specific module."
                ),
                None,
            )
            .to_resolved()
            .await?
            .emit();
        }
    }

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

    // Now we have all necessary information. List out all collected references for each (Entry
    // Module, Collecting Module) pair they are contained in.

    // Same type as `struct CollectedModules`:
    // (Collecting Module) -> Vec<(entry_groups index, Vec<(Reference, Collected Module)>)>
    #[allow(clippy::type_complexity)]
    let mut collected_references: FxIndexMap<
        ResolvedVc<Box<dyn Module>>,
        FxIndexMap<u32, Vec<(RefData, ResolvedVc<Box<dyn Module>>)>>,
    > = FxIndexMap::default();

    for (ref_data, emitted_module) in emitted_references {
        let emitted_membership = module_entry_membership
            .get(&emitted_module)
            .context("Module entry membership not found")?;

        let ChunkingType::Emitted {
            namespace,
            emit_to_all_entries,
        } = &ref_data.chunking_type
        else {
            bail!("unreachable: expected emitted reference");
        };

        for collecting_module in collecting_modules.get(namespace).into_iter().flatten() {
            let collecting_membership = module_entry_membership
                .get(&ResolvedVc::upcast(*collecting_module))
                .context("Module entry membership not found")?;

            let matching_chunk_groups = if *emit_to_all_entries {
                // Add to all entry groups the collecting module is in.
                Cow::Borrowed(&**collecting_membership)
            } else {
                // Add to all entry groups the collecting module is in that also contain the emitted
                // module.
                Cow::Owned((**collecting_membership).clone() & (&**emitted_membership))
            };
            if !matching_chunk_groups.is_empty() {
                let refs = collected_references
                    .entry(ResolvedVc::upcast(*collecting_module))
                    .or_default();
                for entry in matching_chunk_groups.iter() {
                    refs.entry(entry).or_default().push((
                        RefData {
                            chunking_type: ChunkingType::Collected {
                                namespace: namespace.clone(),
                            },
                            ..ref_data.clone()
                        },
                        emitted_module,
                    ));
                }
            }
        }
    }

    Ok(CollectedModules(
        collected_references
            .into_iter()
            .map(|(k, v)| {
                (
                    k,
                    v.into_iter()
                        .map(|(k, v)| (entry_groups[k as usize].clone(), v))
                        .collect(),
                )
            })
            .collect(),
    )
    .cell())
}
