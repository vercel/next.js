use std::hash::BuildHasherDefault;

use anyhow::{Context, Result};
use auto_hash_map::AutoSet;
use rustc_hash::{FxHashMap, FxHasher};
use tracing::Instrument;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, Vc};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph, chunk_group_info::RoaringBitmapWrapper},
};

/// Modules that are reachable from exactly the same set of async targets.
///
/// Every module belongs to exactly one group, so the groups together hold each module once
/// regardless of how many targets reach it.
pub type DependencyGroup = AutoSet<ResolvedVc<Box<dyn Module>>, BuildHasherDefault<FxHasher>, 1>;

/// For each async target, the modules its chunk group depends on.
///
/// Modules reachable from the same set of async targets are interned into one [`DependencyGroup`],
/// and a target stores only the indices of the groups it reaches. A library pulled in by many
/// targets is therefore stored once and referenced by index, keeping the module storage at O(N)
/// in the number of modules instead of O(N×M) in modules × targets.
///
/// Keyed on the target, so a lookup depends only on the target queried rather than on the whole
/// map.
#[turbo_tasks::value]
pub struct AsyncDependencies {
    /// The interned dependency groups.
    groups: Vec<DependencyGroup>,
    /// For each async target, the groups its chunk group reaches.
    #[turbo_tasks(trace_ignore)]
    per_target: FxHashMap<ResolvedVc<Box<dyn Module>>, Vec<u32>>,
}

impl AsyncDependencies {
    /// Returns the members of `candidates` that `target`'s chunk group can reach.
    ///
    /// Intersection is the exposed operation rather than a per-module `contains` so that a whole
    /// availability set is answered by one pass over the target's groups.
    ///
    /// Returns `None` if `target` is not an async target.
    pub fn intersect<T>(
        &self,
        target: ResolvedVc<Box<dyn Module>>,
        candidates: impl IntoIterator<Item = (ResolvedVc<Box<dyn Module>>, T)>,
    ) -> Option<Vec<T>> {
        let group_indices = self.per_target.get(&target)?;

        // Several candidates can share a module: an `AvailableModuleItem::Module(m)` and an
        // `AvailableModuleItem::AsyncLoader(m)` both key on `m`, and every member of a batch keys
        // on the same batch item. Keep them all rather than collecting into a map.
        let mut wanted: FxHashMap<ResolvedVc<Box<dyn Module>>, Vec<T>> = FxHashMap::default();
        let mut remaining = 0usize;
        for (module, value) in candidates {
            wanted.entry(module).or_default().push(value);
            remaining += 1;
        }

        let mut found = Vec::new();
        for &group_idx in group_indices {
            if remaining == 0 {
                // Everything asked about has been located; later groups cannot add more.
                break;
            }
            for module in self.groups[group_idx as usize].iter() {
                if let Some(values) = wanted.remove(module) {
                    remaining -= values.len();
                    found.extend(values);
                }
            }
        }
        Some(found)
    }

    /// The number of interned groups. Exposed for tests asserting on sharing.
    pub fn group_count(&self) -> usize {
        self.groups.len()
    }

    /// The group index of `module`, if any async target reaches it. Exposed for tests asserting
    /// that two modules share a group.
    pub fn group_of(&self, module: ResolvedVc<Box<dyn Module>>) -> Option<usize> {
        self.groups.iter().position(|group| group.contains(&module))
    }
}

/// Computes, for every async target in the graph, the modules its chunk group depends on.
///
/// One fixed-point traversal propagates a bitmap of "async targets that reach me" down the graph.
/// That bitmap is the equivalence key: modules carrying the same one are reachable from exactly
/// the same targets, so they are interned into a single group. Modules in a dependency cycle
/// necessarily share a bitmap — they all reach each other — so cycles need no special handling.
#[turbo_tasks::function]
pub async fn compute_async_dependencies(
    module_graph: Vc<ModuleGraph>,
) -> Result<Vc<AsyncDependencies>> {
    let span = tracing::info_span!("compute async dependencies");
    async move {
        let graph = module_graph.await?;

        // Every module reached by a `ChunkingType::Async` edge starts its own chunk group.
        let mut targets: FxIndexSet<ResolvedVc<Box<dyn Module>>> = FxIndexSet::default();
        let mut module_targets: FxIndexMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
            FxIndexMap::default();
        graph.traverse_edges_bfs(
            graph.all_chunk_group_entry_modules(),
            |parent_info, node| {
                if let Some((_, ref_data)) = parent_info {
                    match ref_data.chunking_type {
                        ChunkingType::Async => {
                            targets.insert(node);
                        }
                        ChunkingType::Traced { .. } => {
                            return Ok(GraphTraversalAction::Skip);
                        }
                        _ => {}
                    }
                }
                // ensure every reachable module has an initialized bitmap
                module_targets.entry(node).or_default();
                Ok(GraphTraversalAction::Continue)
            },
        )?;

        if targets.is_empty() {
            return Ok(AsyncDependencies {
                groups: Vec::new(),
                per_target: FxHashMap::default(),
            }
            .cell());
        }

        for (i, target) in targets.iter().enumerate() {
            module_targets.get_mut(target).unwrap().insert(i as u32);
        }

        graph.traverse_edges_fixed_point_with_priority(
            targets.iter().map(|&t| (t, 0isize)),
            &mut module_targets,
            |parent_info, node, _, module_targets| {
                let Some((parent, ref_data, _)) = parent_info else {
                    // An entry: its own bit is already seeded.
                    return Ok(GraphTraversalAction::Continue);
                };
                if matches!(ref_data.chunking_type, ChunkingType::Traced { .. }) {
                    // Traced edges are ignored during chunking entirely so we can save some
                    return Ok(GraphTraversalAction::Skip);
                }
                if parent == node {
                    // A self-reference contributes nothing.
                    return Ok(GraphTraversalAction::Skip);
                }
                let [Some(parent_bits), Some(node_bits)] =
                    module_targets.get_disjoint_mut([&parent, &node])
                else {
                    panic!("Module async targets not found"); // our initial traversal seeded all the bitmaps
                };
                if parent_bits.0.is_empty() {
                    return Ok(GraphTraversalAction::Skip);
                }
                let before = node_bits.0.len();
                node_bits.0 |= &parent_bits.0;
                if node_bits.0.len() == before {
                    // Nothing new: this subtree is already up to date.
                    Ok(GraphTraversalAction::Skip)
                } else {
                    Ok(GraphTraversalAction::Continue)
                }
            },
            |_, _| Ok(0isize),
        )?;

        // Intern by bitmap: every distinct "set of targets that reach me" becomes one group.
        let mut by_bitmap: FxIndexMap<RoaringBitmapWrapper, DependencyGroup> =
            FxIndexMap::default();
        for (module, bits) in module_targets.into_iter() {
            if bits.0.is_empty() {
                // No async target reaches this module.
                continue;
            }

            by_bitmap.entry(bits).or_default().insert(module);
        }

        // Invert: a target reaches every group whose bitmap contains its bit.
        let mut per_target: FxHashMap<ResolvedVc<Box<dyn Module>>, Vec<u32>> =
            targets.iter().map(|&target| (target, Vec::new())).collect();
        for (group_idx, bits) in by_bitmap.keys().enumerate() {
            for bit in bits.0.iter() {
                let target = *targets
                    .get_index(bit as usize)
                    .context("bit does not correspond to an async target")?;
                per_target
                    .get_mut(&target)
                    .context("target missing from dependency index")?
                    .push(group_idx as u32);
            }
        }

        Ok(AsyncDependencies {
            groups: by_bitmap.into_values().collect(),
            per_target,
        }
        .cell())
    }
    .instrument(span)
    .await
}
