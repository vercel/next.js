use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
};

use anyhow::{Context, Result, bail};
use either::Either;
use indexmap::map::Entry;
use roaring::RoaringBitmap;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, ValueToString,
    Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraphRef, RefData, SingleModuleGraphModuleNode},
};

#[derive(
    Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs, ValueDebugFormat,
)]
#[repr(transparent)]
pub struct RoaringBitmapWrapper(#[turbo_tasks(trace_ignore)] pub RoaringBitmap);

impl TaskInput for RoaringBitmapWrapper {
    fn is_transient(&self) -> bool {
        false
    }
}

impl RoaringBitmapWrapper {
    /// Whether `self` contains bits that are not in `other`
    ///
    /// The existing `is_superset` method also returns true for equal sets
    pub fn is_proper_superset(&self, other: &Self) -> bool {
        !self.is_subset(other)
    }

    pub fn into_inner(self) -> RoaringBitmap {
        self.0
    }
}
unsafe impl NonLocalValue for RoaringBitmapWrapper {}

// RoaringBitmap doesn't impl Eq: https://github.com/RoaringBitmap/roaring-rs/issues/302
// PartialEq can only return true if both bitmaps have the same internal representation, but two
// bitmaps with the same content should always have the same internal representation
impl Eq for RoaringBitmapWrapper {}

impl Deref for RoaringBitmapWrapper {
    type Target = RoaringBitmap;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl DerefMut for RoaringBitmapWrapper {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Hash for RoaringBitmapWrapper {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        struct HasherWriter<'a, H: std::hash::Hasher>(&'a mut H);
        impl<H: std::hash::Hasher> std::io::Write for HasherWriter<'_, H> {
            fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
                self.0.write(buf);
                Ok(buf.len())
            }
            fn flush(&mut self) -> std::io::Result<()> {
                Ok(())
            }
        }
        self.0.serialize_into(HasherWriter(state)).unwrap();
    }
}

#[turbo_tasks::value]
pub struct ChunkGroupInfo {
    pub module_chunk_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper>,
    #[turbo_tasks(trace_ignore)]
    pub chunk_groups: FxIndexSet<ChunkGroup>,
    #[turbo_tasks(trace_ignore)]
    pub chunk_group_keys: FxIndexSet<ChunkGroupKey>,
}

#[turbo_tasks::value_impl]
impl ChunkGroupInfo {
    #[turbo_tasks::function]
    pub async fn get_index_of(&self, chunk_group: ChunkGroup) -> Result<Vc<usize>> {
        if let Some(idx) = self.chunk_groups.get_index_of(&chunk_group) {
            Ok(Vc::cell(idx))
        } else {
            bail!(
                "Couldn't find chunk group index for {} in {}",
                chunk_group.debug_str(self).await?,
                self.chunk_groups
                    .iter()
                    .map(|c| c.debug_str(self))
                    .try_join()
                    .await?
                    .join(", ")
            );
        }
    }
}

#[derive(
    Debug, Clone, Hash, TaskInput, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue,
)]
pub enum ChunkGroupEntry {
    /// e.g. a page
    Entry(Vec<ResolvedVc<Box<dyn Module>>>),
    /// a module with an incoming async edge
    Async(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming non-merged isolated edge
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming merging isolated edge
    IsolatedMerged {
        parent: Box<ChunkGroupEntry>,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
    /// a module with an incoming non-merging shared edge
    Shared(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming merging shared edge
    SharedMerged {
        parent: Box<ChunkGroupEntry>,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
}
impl ChunkGroupEntry {
    pub fn entries(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + '_ {
        match self {
            Self::Async(e) | Self::Isolated(e) | Self::Shared(e) => {
                Either::Left(std::iter::once(*e))
            }
            Self::Entry(entries)
            | Self::IsolatedMerged { entries, .. }
            | Self::SharedMerged { entries, .. } => Either::Right(entries.iter().copied()),
        }
    }
}

#[derive(Debug, Clone, Hash, TaskInput, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs)]
pub enum ChunkGroup {
    /// e.g. a page
    Entry(Vec<ResolvedVc<Box<dyn Module>>>),
    /// a module with an incoming async edge
    Async(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming non-merged isolated edge
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming merging isolated edge
    IsolatedMerged {
        parent: usize,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
    /// a module with an incoming non-merging shared edge
    Shared(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming merging shared edge
    SharedMerged {
        parent: usize,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
}

impl ChunkGroup {
    /// Returns the parent group when this chunk group is a merged group. In that case `entries()`
    /// are in unspecified order.
    pub fn get_merged_parent(&self) -> Option<usize> {
        match self {
            ChunkGroup::IsolatedMerged { parent, .. } | ChunkGroup::SharedMerged { parent, .. } => {
                Some(*parent)
            }
            _ => None,
        }
    }

    /// Iterates over the entries of the chunk group. When `get_merged_parent` is Some, the order is
    /// unspecified.
    pub fn entries(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn Module>>> + Clone + '_ {
        match self {
            ChunkGroup::Async(e) | ChunkGroup::Isolated(e) | ChunkGroup::Shared(e) => {
                Either::Left(std::iter::once(*e))
            }
            ChunkGroup::Entry(entries)
            | ChunkGroup::IsolatedMerged { entries, .. }
            | ChunkGroup::SharedMerged { entries, .. } => Either::Right(entries.iter().copied()),
        }
    }

    pub fn entries_count(&self) -> usize {
        match self {
            ChunkGroup::Async(_) | ChunkGroup::Isolated(_) | ChunkGroup::Shared(_) => 1,
            ChunkGroup::Entry(entries)
            | ChunkGroup::IsolatedMerged { entries, .. }
            | ChunkGroup::SharedMerged { entries, .. } => entries.len(),
        }
    }

    pub async fn debug_str(&self, chunk_group_info: &ChunkGroupInfo) -> Result<String> {
        Ok(match self {
            ChunkGroup::Entry(entries) => format!(
                "ChunkGroup::Entry({:?})",
                entries
                    .iter()
                    .map(|m| m.ident().to_string())
                    .try_join()
                    .await?
            ),
            ChunkGroup::Async(entry) => {
                format!("ChunkGroup::Async({:?})", entry.ident().to_string().await?)
            }
            ChunkGroup::Isolated(entry) => {
                format!(
                    "ChunkGroup::Isolated({:?})",
                    entry.ident().to_string().await?
                )
            }
            ChunkGroup::Shared(entry) => {
                format!("ChunkGroup::Shared({:?})", entry.ident().to_string().await?)
            }
            ChunkGroup::IsolatedMerged {
                parent,
                merge_tag,
                entries,
            } => {
                format!(
                    "ChunkGroup::IsolatedMerged({}, {}, {:?})",
                    Box::pin(chunk_group_info.chunk_groups[*parent].debug_str(chunk_group_info))
                        .await?,
                    merge_tag,
                    entries
                        .iter()
                        .map(|m| m.ident().to_string())
                        .try_join()
                        .await?
                )
            }
            ChunkGroup::SharedMerged {
                parent,
                merge_tag,
                entries,
            } => {
                format!(
                    "ChunkGroup::SharedMerged({}, {}, {:?})",
                    Box::pin(chunk_group_info.chunk_groups[*parent].debug_str(chunk_group_info))
                        .await?,
                    merge_tag,
                    entries
                        .iter()
                        .map(|m| m.ident().to_string())
                        .try_join()
                        .await?
                )
            }
        })
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub enum ChunkGroupKey {
    /// e.g. a page
    Entry(Vec<ResolvedVc<Box<dyn Module>>>),
    /// a module with an incoming async edge
    Async(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming non-merging isolated edge
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming merging isolated edge
    IsolatedMerged {
        parent: ChunkGroupId,
        merge_tag: RcStr,
    },
    /// a module with an incoming non-merging shared edge
    Shared(ResolvedVc<Box<dyn Module>>),
    /// a module with an incoming merging shared edge
    SharedMerged {
        parent: ChunkGroupId,
        merge_tag: RcStr,
    },
}

impl ChunkGroupKey {
    pub async fn debug_str(
        &self,
        keys: impl std::ops::Index<usize, Output = Self>,
    ) -> Result<String> {
        Ok(match self {
            ChunkGroupKey::Entry(entries) => format!(
                "Entry({:?})",
                entries
                    .iter()
                    .map(|m| m.ident().to_string())
                    .try_join()
                    .await?
            ),
            ChunkGroupKey::Async(module) => {
                format!("Async({:?})", module.ident().to_string().await?)
            }
            ChunkGroupKey::Isolated(module) => {
                format!("Isolated({:?})", module.ident().to_string().await?)
            }
            ChunkGroupKey::IsolatedMerged { parent, merge_tag } => {
                format!(
                    "IsolatedMerged {{ parent: {}, merge_tag: {:?} }}",
                    Box::pin(keys.index(parent.0 as usize).clone().debug_str(keys)).await?,
                    merge_tag
                )
            }
            ChunkGroupKey::Shared(module) => {
                format!("Shared({:?})", module.ident().to_string().await?)
            }
            ChunkGroupKey::SharedMerged { parent, merge_tag } => {
                format!(
                    "SharedMerged {{ parent: {}, merge_tag: {:?} }}",
                    Box::pin(keys.index(parent.0 as usize).clone().debug_str(keys)).await?,
                    merge_tag
                )
            }
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ChunkGroupId(u32);

impl From<usize> for ChunkGroupId {
    fn from(id: usize) -> Self {
        Self(id as u32)
    }
}

impl Deref for ChunkGroupId {
    type Target = u32;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TraversalPriority {
    depth: usize,
    chunk_group_len: u64,
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
        // Smaller group length has higher priority
        let chunk_group_len_order = self.chunk_group_len.cmp(&other.chunk_group_len).reverse();

        depth_order.then(chunk_group_len_order)
    }
}

pub async fn compute_chunk_group_info(graph: &ModuleGraphRef) -> Result<Vc<ChunkGroupInfo>> {
    let span_outer = tracing::info_span!(
        "compute chunk group info",
        module_count = tracing::field::Empty,
        visit_count = tracing::field::Empty,
        chunk_group_count = tracing::field::Empty
    );

    let span = span_outer.clone();
    async move {
        #[allow(clippy::type_complexity)]
        let mut chunk_groups_map: FxIndexMap<
            ChunkGroupKey,
            (ChunkGroupId, FxIndexSet<ResolvedVc<Box<dyn Module>>>),
        > = FxIndexMap::default();

        // For each module, the indices in the bitmap store which chunk groups in `chunk_groups_map`
        // that module is part of.
        let mut module_chunk_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
            FxHashMap::default();

        let module_count = graph
            .graphs
            .iter()
            .map(|g| g.graph.node_count())
            .sum::<usize>();
        span.record("module_count", module_count);

        // use all entries from all graphs
        let entries = graph
            .graphs
            .iter()
            .flat_map(|g| g.entries.iter())
            .collect::<Vec<_>>();

        // First, compute the depth for each module in the graph
        let module_depth: FxHashMap<ResolvedVc<Box<dyn Module>>, usize> = {
            let mut module_depth =
                FxHashMap::with_capacity_and_hasher(module_count, Default::default());
            graph.traverse_edges_from_entries_bfs(
                entries.iter().flat_map(|e| e.entries()),
                |parent, node| {
                    if let Some((parent, _)) = parent {
                        let parent_depth = *module_depth
                            .get(&parent.module)
                            .context("Module depth not found")?;
                        module_depth.entry(node.module).or_insert(parent_depth + 1);
                    } else {
                        module_depth.insert(node.module, 0);
                    };

                    module_chunk_groups.insert(node.module, RoaringBitmapWrapper::default());

                    Ok(GraphTraversalAction::Continue)
                },
            )?;
            module_depth
        };

        // ----

        #[allow(clippy::type_complexity)]
        fn entry_to_chunk_group_id(
            entry: ChunkGroupEntry,
            chunk_groups_map: &mut FxIndexMap<
                ChunkGroupKey,
                (ChunkGroupId, FxIndexSet<ResolvedVc<Box<dyn Module>>>),
            >,
        ) -> ChunkGroupKey {
            match entry {
                ChunkGroupEntry::Entry(entries) => ChunkGroupKey::Entry(entries),
                ChunkGroupEntry::Async(entry) => ChunkGroupKey::Async(entry),
                ChunkGroupEntry::Isolated(entry) => ChunkGroupKey::Isolated(entry),
                ChunkGroupEntry::Shared(entry) => ChunkGroupKey::Shared(entry),
                ChunkGroupEntry::IsolatedMerged {
                    parent,
                    merge_tag,
                    entries: _,
                } => {
                    let parent = entry_to_chunk_group_id(*parent, chunk_groups_map);
                    let len = chunk_groups_map.len();
                    let parent = chunk_groups_map
                        .entry(parent)
                        .or_insert_with(|| (ChunkGroupId(len as u32), FxIndexSet::default()))
                        .0;

                    ChunkGroupKey::IsolatedMerged {
                        parent: ChunkGroupId(*parent as u32),
                        merge_tag,
                    }
                }
                ChunkGroupEntry::SharedMerged {
                    parent,
                    merge_tag,
                    entries: _,
                } => {
                    let parent = entry_to_chunk_group_id(*parent, chunk_groups_map);
                    let len = chunk_groups_map.len();
                    let parent = chunk_groups_map
                        .entry(parent)
                        .or_insert_with(|| (ChunkGroupId(len as u32), FxIndexSet::default()))
                        .0;

                    ChunkGroupKey::SharedMerged {
                        parent: ChunkGroupId(*parent as u32),
                        merge_tag,
                    }
                }
            }
        }

        let entry_chunk_group_keys = graph
            .graphs
            .iter()
            .flat_map(|g| g.entries.iter())
            .flat_map(|chunk_group| {
                let chunk_group_key =
                    entry_to_chunk_group_id(chunk_group.clone(), &mut chunk_groups_map);
                chunk_group
                    .entries()
                    .map(move |e| (e, chunk_group_key.clone()))
            })
            .collect::<FxHashMap<_, _>>();

        let visit_count = graph.traverse_edges_fixed_point_with_priority(
            entries
                .iter()
                .flat_map(|e| e.entries())
                .map(|e| {
                    Ok((
                        e,
                        TraversalPriority {
                            depth: *module_depth.get(&e).context("Module depth not found")?,
                            chunk_group_len: 0,
                        },
                    ))
                })
                .collect::<Result<Vec<_>>>()?,
            &mut module_chunk_groups,
            |parent_info: Option<(&'_ SingleModuleGraphModuleNode, &'_ RefData)>,
             node: &'_ SingleModuleGraphModuleNode,
             module_chunk_groups: &mut FxHashMap<
                ResolvedVc<Box<dyn Module>>,
                RoaringBitmapWrapper,
            >|
             -> Result<GraphTraversalAction> {
                enum ChunkGroupInheritance<It: Iterator<Item = ChunkGroupKey>> {
                    Inherit(ResolvedVc<Box<dyn Module>>),
                    ChunkGroup(It),
                }
                let chunk_groups = if let Some((parent, ref_data)) = parent_info {
                    match &ref_data.chunking_type {
                        ChunkingType::Parallel { .. } => {
                            ChunkGroupInheritance::Inherit(parent.module)
                        }
                        ChunkingType::Async => ChunkGroupInheritance::ChunkGroup(Either::Left(
                            std::iter::once(ChunkGroupKey::Async(node.module)),
                        )),
                        ChunkingType::Isolated {
                            merge_tag: None, ..
                        } => ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                            ChunkGroupKey::Isolated(node.module),
                        ))),
                        ChunkingType::Shared {
                            merge_tag: None, ..
                        } => ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                            ChunkGroupKey::Shared(node.module),
                        ))),
                        ChunkingType::Isolated {
                            merge_tag: Some(merge_tag),
                            ..
                        } => {
                            let parents = module_chunk_groups
                                .get(&parent.module)
                                .context("Module chunk group not found")?;
                            let chunk_groups =
                                parents.iter().map(|parent| ChunkGroupKey::IsolatedMerged {
                                    parent: ChunkGroupId(parent),
                                    merge_tag: merge_tag.clone(),
                                });
                            ChunkGroupInheritance::ChunkGroup(Either::Right(Either::Left(
                                chunk_groups,
                            )))
                        }
                        ChunkingType::Shared {
                            merge_tag: Some(merge_tag),
                            ..
                        } => {
                            let parents = module_chunk_groups
                                .get(&parent.module)
                                .context("Module chunk group not found")?;
                            let chunk_groups =
                                parents.iter().map(|parent| ChunkGroupKey::SharedMerged {
                                    parent: ChunkGroupId(parent),
                                    merge_tag: merge_tag.clone(),
                                });
                            ChunkGroupInheritance::ChunkGroup(Either::Right(Either::Right(
                                chunk_groups,
                            )))
                        }
                        ChunkingType::Traced => {
                            // Traced modules are not placed in chunk groups
                            return Ok(GraphTraversalAction::Skip);
                        }
                    }
                } else {
                    ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                        // TODO remove clone
                        entry_chunk_group_keys
                            .get(&node.module)
                            .context("Module chunk group not found")?
                            .clone(),
                    )))
                };

                Ok(match chunk_groups {
                    ChunkGroupInheritance::ChunkGroup(chunk_groups) => {
                        // Start of a new chunk group, don't inherit anything from parent
                        let chunk_group_ids = chunk_groups.map(|chunk_group| {
                            let len = chunk_groups_map.len();
                            let is_merged = matches!(
                                chunk_group,
                                ChunkGroupKey::IsolatedMerged { .. }
                                    | ChunkGroupKey::SharedMerged { .. }
                            );
                            match chunk_groups_map.entry(chunk_group) {
                                Entry::Occupied(mut e) => {
                                    let (id, merged_entries) = e.get_mut();
                                    if is_merged {
                                        merged_entries.insert(node.module);
                                    }
                                    **id
                                }
                                Entry::Vacant(e) => {
                                    let chunk_group_id = len as u32;
                                    let mut set = FxIndexSet::default();
                                    if is_merged {
                                        set.insert(node.module);
                                    }
                                    e.insert((ChunkGroupId(chunk_group_id), set));
                                    chunk_group_id
                                }
                            }
                        });

                        let chunk_groups =
                            RoaringBitmapWrapper(RoaringBitmap::from_iter(chunk_group_ids));

                        // Assign chunk group to the target node (the entry of the chunk group)
                        let bitset = module_chunk_groups
                            .get_mut(&node.module)
                            .context("Module chunk group not found")?;
                        if chunk_groups.is_proper_superset(bitset) {
                            // Add bits from parent, and continue traversal because changed
                            **bitset |= chunk_groups.into_inner();

                            GraphTraversalAction::Continue
                        } else {
                            // Unchanged, no need to forward to children
                            GraphTraversalAction::Skip
                        }
                    }
                    ChunkGroupInheritance::Inherit(parent) => {
                        // Inherit chunk groups from parent, merge parent chunk groups into
                        // current

                        if parent == node.module {
                            // A self-reference
                            GraphTraversalAction::Skip
                        } else {
                            let [Some(parent_chunk_groups), Some(current_chunk_groups)] =
                                module_chunk_groups.get_disjoint_mut([&parent, &node.module])
                            else {
                                // All modules are inserted in the previous iteration
                                // Technically unreachable, but could be reached due to eventual
                                // consistency
                                bail!("Module chunk groups not found");
                            };

                            if current_chunk_groups.is_empty() {
                                // Initial visit, clone instead of merging
                                *current_chunk_groups = parent_chunk_groups.clone();
                                GraphTraversalAction::Continue
                            } else if parent_chunk_groups.is_proper_superset(current_chunk_groups) {
                                // Add bits from parent, and continue traversal because changed
                                **current_chunk_groups |= &**parent_chunk_groups;
                                GraphTraversalAction::Continue
                            } else {
                                // Unchanged, no need to forward to children
                                GraphTraversalAction::Skip
                            }
                        }
                    }
                })
            },
            // This priority is used as a heuristic to keep the number of retraversals down, by
            // - keeping it similar to a BFS via the depth priority
            // - prioritizing smaller chunk groups which are expected to themselves reference
            //   bigger chunk groups (i.e. shared code deeper down in the graph).
            //
            // Both try to first visit modules with a large dependency subgraph first (which
            // would be higher in the graph and are included by few chunks themselves).
            |successor, module_chunk_groups| {
                Ok(TraversalPriority {
                    depth: *module_depth
                        .get(&successor.module)
                        .context("Module depth not found")?,
                    chunk_group_len: module_chunk_groups
                        .get(&successor.module)
                        .context("Module chunk group not found")?
                        .len(),
                })
            },
        )?;

        span.record("visit_count", visit_count);
        span.record("chunk_group_count", chunk_groups_map.len());

        #[cfg(debug_assertions)]
        {
            use once_cell::sync::Lazy;
            static PRINT_CHUNK_GROUP_INFO: Lazy<bool> =
                Lazy::new(|| match std::env::var_os("TURBOPACK_PRINT_CHUNK_GROUPS") {
                    Some(v) => v == "1",
                    None => false,
                });
            if *PRINT_CHUNK_GROUP_INFO {
                use std::{
                    collections::{BTreeMap, BTreeSet},
                    path::absolute,
                };

                let mut buckets = BTreeMap::default();
                for (module, key) in &module_chunk_groups {
                    if !key.is_empty() {
                        buckets
                            .entry(key.iter().collect::<Vec<_>>())
                            .or_insert(BTreeSet::new())
                            .insert(module.ident().to_string().await?);
                    }
                }

                let mut result = vec![];
                result.push("Chunk Groups:".to_string());
                for (i, (key, _)) in chunk_groups_map.iter().enumerate() {
                    result.push(format!(
                        "  {:?}: {}",
                        i,
                        key.debug_str(chunk_groups_map.keys()).await?
                    ));
                }
                result.push("# Module buckets:".to_string());
                for (key, modules) in buckets.iter() {
                    result.push(format!("## {:?}:", key.iter().collect::<Vec<_>>()));
                    for module in modules {
                        result.push(format!("  {module}"));
                    }
                    result.push("".to_string());
                }
                let f = absolute("chunk_group_info.log")?;
                println!("written to {}", f.display());
                std::fs::write(f, result.join("\n"))?;
            }
        }

        Ok(ChunkGroupInfo {
            module_chunk_groups,
            chunk_group_keys: chunk_groups_map.keys().cloned().collect(),
            chunk_groups: chunk_groups_map
                .into_iter()
                .map(|(k, (_, merged_entries))| match k {
                    ChunkGroupKey::Entry(entries) => ChunkGroup::Entry(entries),
                    ChunkGroupKey::Async(module) => ChunkGroup::Async(module),
                    ChunkGroupKey::Isolated(module) => ChunkGroup::Isolated(module),
                    ChunkGroupKey::IsolatedMerged { parent, merge_tag } => {
                        ChunkGroup::IsolatedMerged {
                            parent: parent.0 as usize,
                            merge_tag,
                            entries: merged_entries.into_iter().collect(),
                        }
                    }
                    ChunkGroupKey::Shared(module) => ChunkGroup::Shared(module),
                    ChunkGroupKey::SharedMerged { parent, merge_tag } => ChunkGroup::SharedMerged {
                        parent: parent.0 as usize,
                        merge_tag,
                        entries: merged_entries.into_iter().collect(),
                    },
                })
                .collect(),
        }
        .cell())
    }
    .instrument(span_outer)
    .await
}
