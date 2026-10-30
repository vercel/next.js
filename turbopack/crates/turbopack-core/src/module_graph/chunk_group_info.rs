use std::{cmp::Reverse, hash::Hash, ops::Deref, sync::LazyLock};

use anyhow::{Context, Result, bail};
use bincode::{Decode, Encode};
use either::Either;
use indexmap::map::Entry;
use petgraph::{algo::tarjan_scc, graphmap::DiGraphMap};
use rustc_hash::{FxHashMap, FxHashSet};
use tracing::Instrument;
use turbo_bitset::Bitset;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, FxIndexSet, NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    debug::ValueDebugFormat, turbofmt,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::{
    chunk::ChunkingType,
    emit_collect::CollectingModule,
    module::{ActivatableModule, Module},
    module_graph::{GraphTraversalAction, ModuleGraph, RefData, collect::CollectedModules},
};

#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct ModuleToChunkGroups(FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset>);

/// See [`ChunkGroupInfo::chunk_group_ident_hashes`].
#[turbo_tasks::value(transparent)]
pub struct ChunkGroupIdentHashes(Vec<u64>);

/// The hash of a [`ChunkGroupKey::ident_str`], i.e. of the identity of one chunk group.
pub fn chunk_group_ident_hash(ident: &str) -> u64 {
    let mut hasher = Xxh3Hash64Hasher::new();
    hasher.write_value(ident);
    hasher.finish()
}

#[turbo_tasks::value]
pub struct ChunkGroupWithIndex {
    pub index: u32,
    pub chunk_group: ChunkGroup,
}

#[turbo_tasks::value(transparent)]
pub struct ChunkGroups(Vec<ChunkGroupWithIndex>);

#[turbo_tasks::value(transparent)]
pub struct OptionChunkGroupWithIndex(Option<ChunkGroupWithIndex>);

/// Maps each [`ChunkGroupKey`] to its index in [`ChunkGroupInfo::chunk_groups`], as a keyed cell so
/// [`ChunkGroupInfo::get_index_of`] depends only on the key it looks up.
///
/// This duplicates [`ChunkGroupInfo::chunk_group_keys`], which stays for the index -> key
/// direction. The `IndexSet` can't be the keyed cell: its `KeyedAccess` yields `()` rather than the
/// index, and its `KeyedEq` ignores position, so an index that merely shifted would go unnoticed.
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct ChunkGroupKeyToIndex(FxHashMap<ChunkGroupKey, u32>);

/// The parts of an [`crate::chunk::availability_info::AvailabilityInfo`] that chunking an async
/// chunk group can observe, including everything that is chunked from it (nested async chunk
/// groups).
///
/// Chunking only asks whether one of [`Self::observed_chunk_groups`] intersects the available
/// chunk groups. Two availabilities that give the same answers for all of them produce the same
/// chunks. Async loaders use this to avoid being keyed by availability they never look at, which
/// would make them unique per parent chunk group.
#[derive(Debug, Default, Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub struct AsyncLoaderRelevantChunkGroups {
    /// The distinct chunk group sets the chunking tests against the available chunk groups: the
    /// chunk groups of every module it visits and of every async loader it creates. Sorted by
    /// content.
    pub observed_chunk_groups: Vec<Bitset>,
    /// The union of [`Self::observed_chunk_groups`].
    pub chunk_groups: Bitset,
    /// Whether the chunking visits a collecting module, which reads the entry group of the
    /// availability.
    pub reaches_collecting_module: bool,
    /// Whether the chunking reaches an async chunk group of an
    /// [`crate::module::ActivatableModule`]. The observed sets stop at such a chunk group, but the
    /// availability is passed on to it as is, and chunking behind it may test sets that aren't
    /// observed here. So [`Self::canonicalize`] only removes chunk groups instead of producing a
    /// canonical value.
    pub reaches_activatable: bool,
}

impl AsyncLoaderRelevantChunkGroups {
    /// Whether the async loader needs the entry group of the availability: chunking visits a
    /// collecting module, or reaches an activatable chunk group, behind which one can appear.
    pub fn needs_entry_group(&self) -> bool {
        self.reaches_collecting_module || self.reaches_activatable
    }

    /// A replacement for `available` that answers every observed test the same way.
    ///
    /// Usually it is canonical: everything in [`Self::chunk_groups`] except the members of observed
    /// sets that `available` misses. A set that `available` hits keeps `set ∩ available` (those
    /// chunk groups are in no missed set), and a missed set loses all of its members. The result
    /// only depends on which sets are hit, so availabilities that make the same modules available
    /// map to the same value. It can contain chunk groups that are not in `available`.
    ///
    /// With [`Self::reaches_activatable`], it is `available ∩ chunk_groups` instead: a subset of
    /// `available`, so tests that aren't observed here can only lose availability (which emits a
    /// module again), never gain it.
    pub fn canonicalize(&self, available: &Bitset) -> Bitset {
        if self.reaches_activatable {
            return &self.chunk_groups & available;
        }
        let mut missed = Bitset::new();
        for observed in &self.observed_chunk_groups {
            if observed.is_disjoint(available) {
                missed |= observed;
            }
        }
        &self.chunk_groups - &missed
    }
}

/// [`AsyncLoaderRelevantChunkGroups`] for each async chunk group, keyed by the module the async
/// chunk group is created for (the `m` of [`ChunkGroupKey::Async`]). It is computed together with
/// the chunk groups in [`compute_chunk_group_info`]. A module has no entry if it has no async chunk
/// group in this graph, if it is an [`crate::module::ActivatableModule`], or if the chunking of its
/// async chunk group can't be fully determined (an opaque subgraph). Its async loader then keeps
/// the given availability.
#[turbo_tasks::value(transparent, cell = "keyed")]
pub struct AsyncLoaderRelevantChunkGroupsMap(
    FxHashMap<ResolvedVc<Box<dyn Module>>, AsyncLoaderRelevantChunkGroups>,
);

#[turbo_tasks::value]
pub struct ChunkGroupInfo {
    pub module_chunk_groups: ResolvedVc<ModuleToChunkGroups>,
    /// For each async module, the chunk groups that contain its async loader.
    pub async_loader_chunk_groups: ResolvedVc<ModuleToChunkGroups>,
    /// For each async module, the parts of an availability that chunking its async chunk group
    /// can observe. See [`AsyncLoaderRelevantChunkGroups`].
    pub async_loader_relevant_chunk_groups: ResolvedVc<AsyncLoaderRelevantChunkGroupsMap>,
    /// Indexed by chunk group index. This must be a `Vec` (not an `IndexSet`) so that equality is
    /// order-sensitive: `IndexSet` compares as a set, so a recomputation that only renumbers the
    /// chunk groups would compare equal and keep the old order, while the bitsets in
    /// `module_chunk_groups` and the indices in `chunk_group_indices` use the new numbering.
    pub chunk_groups: Vec<ChunkGroup>,
    #[turbo_tasks(unsafe_ignore)]
    #[bincode(with = "turbo_bincode::indexset")]
    pub chunk_group_keys: FxIndexSet<ChunkGroupKey>,
    /// The same keys as `chunk_group_keys`, mapped to their index, in a keyed cell so a single
    /// index lookup does not depend on the whole `ChunkGroupInfo`. See [`ChunkGroupKeyToIndex`].
    pub chunk_group_indices: ResolvedVc<ChunkGroupKeyToIndex>,
    pub chunking_heuristics: ChunkingHeuristicsInfo,
}

/// Chunking heuristics computed by [`compute_chunk_group_info`]. `clusters` is indexed by
/// chunk-group index (same length and order as [`ChunkGroupInfo::chunk_groups`]); `priority_routes`
/// is a set of those indices.
#[derive(Debug, Default, Clone, PartialEq, Eq, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub struct ChunkingHeuristicsInfo {
    /// For each chunk group (by index), the set of cluster IDs it belongs to. A cluster ID is the
    /// index of a configured cluster. A route's chunk group carries that route's clusters; chunk
    /// groups it pulls in inherit them.
    ///
    /// Example: `clusters[5] = [0, 2]` — chunk group 5 is part of clusters 0 and 2.
    pub clusters: Vec<Vec<u16>>,
    /// The set of chunk-group indices that belong to a priority route: the priority
    /// routes themselves, plus every chunk group they pull in.
    ///
    /// Example: `priority_routes = {3, 7}` — chunk groups 3 and 7 are served by a priority
    /// route; any group not in the set (e.g. 4) is not.
    pub priority_routes: Bitset,
}

#[turbo_tasks::value_impl]
impl ChunkGroupInfo {
    #[turbo_tasks::function]
    pub fn module_chunk_groups(&self) -> Vc<ModuleToChunkGroups> {
        *self.module_chunk_groups
    }

    /// The keyed `ChunkGroupKey` -> index map. Read a single entry from it with [`Vc::get`] to
    /// depend only on that key rather than on all of [`ChunkGroupInfo`].
    #[turbo_tasks::function]
    pub fn chunk_group_indices(&self) -> Vc<ChunkGroupKeyToIndex> {
        *self.chunk_group_indices
    }

    /// The keyed async module -> [`AsyncLoaderRelevantChunkGroups`] map. Read a single entry from
    /// it with [`Vc::get`] to depend only on that module rather than on all of [`ChunkGroupInfo`].
    #[turbo_tasks::function]
    pub fn async_loader_relevant_chunk_groups(&self) -> Vc<AsyncLoaderRelevantChunkGroupsMap> {
        *self.async_loader_relevant_chunk_groups
    }

    /// A hash of the identity of every chunk group, indexed like [`ChunkGroupInfo::chunk_groups`]:
    /// [`chunk_group_ident_hash`] of [`ChunkGroupKey::ident_str`].
    ///
    /// [`crate::chunk::available_chunk_groups::AvailableChunkGroups::hash`] combines these per
    /// member, so each chunk group is rendered once per graph, not once for every availability
    /// that contains it. That keeps hashing a set to one dependency and no string work, however
    /// large the set is.
    #[turbo_tasks::function]
    pub async fn chunk_group_ident_hashes(&self) -> Result<Vc<ChunkGroupIdentHashes>> {
        let keys = &self.chunk_group_keys;
        let hashes = keys
            .iter()
            .map(async |key| Ok(chunk_group_ident_hash(&key.ident_str(keys).await?)))
            .try_join()
            .await?;
        Ok(Vc::cell(hashes))
    }

    /// Returns the exact chunk groups that contain `module`, as derived while traversing the module
    /// graph.
    #[turbo_tasks::function]
    pub async fn get_chunk_groups_for_module(
        &self,
        module: ResolvedVc<Box<dyn Module>>,
    ) -> Result<Vc<ChunkGroups>> {
        let module_chunk_groups = self.module_chunk_groups.await?;
        let Some(groups) = module_chunk_groups.get(&module) else {
            return Ok(Vc::cell(Vec::new()));
        };
        Ok(Vc::cell(
            groups
                .iter()
                .map(|index| {
                    Ok(ChunkGroupWithIndex {
                        index,
                        chunk_group: self.chunk_group_at(index as usize)?.clone(),
                    })
                })
                .collect::<Result<_>>()?,
        ))
    }

    /// Returns the shared merged chunk group with `merge_tag` that `parent` is the parent of, if
    /// the graph produced one.
    ///
    /// A merge tag collects everything reachable through the tagged shared references of one
    /// parent group into a single group, so there is at most one such group per parent and tag.
    #[turbo_tasks::function]
    pub fn get_shared_merged_chunk_group(
        &self,
        parent: usize,
        merge_tag: RcStr,
    ) -> Vc<OptionChunkGroupWithIndex> {
        let key = ChunkGroupKey::SharedMerged {
            parent: ChunkGroupId::from(parent),
            merge_tag,
        };
        Vc::cell(
            self.chunk_group_keys
                .get_index_of(&key)
                .map(|index| ChunkGroupWithIndex {
                    index: index as u32,
                    chunk_group: self.chunk_groups[index].clone(),
                }),
        )
    }
}

impl ChunkGroupInfo {
    /// Returns the chunk group at `index`, for an index read from one of the child cells
    /// ([`ChunkGroupInfo::module_chunk_groups`], [`ChunkGroupInfo::chunk_group_indices`], ...).
    ///
    /// [`compute_chunk_group_info`] creates those child cells before it creates this
    /// `ChunkGroupInfo` cell (with the inline [`ChunkGroupInfo::chunk_groups`]) at the end of the
    /// computation. So while it recomputes, an eventually consistent reader can pair this
    /// `ChunkGroupInfo` with a child cell from the newer execution, and the index can be out of
    /// range. The reader depends on both and is recomputed once both are updated, so an error here
    /// is transient, but indexing would panic.
    fn chunk_group_at(&self, index: usize) -> Result<&ChunkGroup> {
        self.chunk_groups.get(index).with_context(|| {
            format!(
                "chunk group index {index} is out of range ({} chunk groups)",
                self.chunk_groups.len()
            )
        })
    }

    /// Returns the index of the chunk group identified by `key` in
    /// [`ChunkGroupInfo::chunk_groups`].
    ///
    /// The lookup goes through the keyed [`ChunkGroupKeyToIndex`] cell, so the caller depends only
    /// on the queried key: adding or changing an unrelated chunk group does not invalidate it.
    ///
    /// This is deliberately *not* a `turbo_tasks::function`. Making it one would create a separate
    /// task per key argument, which is exactly the per-chunk-group overhead the keyed cell is meant
    /// to avoid; the single argument-less [`ChunkGroupInfo::chunk_group_indices`] task is what
    /// provides the caching.
    pub async fn get_index_of(self: Vc<Self>, key: ChunkGroupKey) -> Result<usize> {
        if let Some(idx) = self.chunk_group_indices().get(&key).await? {
            Ok(*idx as usize)
        } else if cfg!(debug_assertions) {
            // Only taken on the failure path, so the happy path keeps its narrow dependency.
            let this = self.await?;
            bail!(
                "Couldn't find chunk group index for {} in {}",
                key.debug_str(&this.chunk_group_keys).await?,
                this.chunk_groups
                    .iter()
                    .map(|c| c.debug_str(&this))
                    .try_join()
                    .await?
                    .join(", ")
            )
        } else {
            bail!("Couldn't find chunk group index")
        }
    }

    /// Returns the registered chunk group identified by `key`.
    ///
    /// Chunking takes a [`ChunkGroupKey`] and resolves the group here, so a group's contents (e.g.
    /// the entries of a merged group) always come from the module graph rather than the caller.
    pub async fn get_chunk_group(self: Vc<Self>, key: ChunkGroupKey) -> Result<ChunkGroup> {
        let index = self.get_index_of(key).await?;
        Ok(self.await?.chunk_group_at(index)?.clone())
    }
}

/// Per-entry chunking heuristics.
#[turbo_tasks::task_input]
#[derive(Debug, Default, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub struct EntryHeuristics {
    /// Cluster indices this route belongs to.
    pub clusters: Vec<u16>,
    pub high_priority: bool,
}

impl EntryHeuristics {
    /// Heuristics for an entry that is a high-priority route: belongs to no clusters and is marked
    /// as high priority.
    pub fn high_priority() -> Self {
        Self {
            clusters: Vec::new(),
            high_priority: true,
        }
    }
}

/// See [ChunkGroup] for documentation
#[turbo_tasks::task_input]
#[derive(Debug, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub enum ChunkGroupEntry {
    Entry {
        modules: Vec<ResolvedVc<Box<dyn Module>>>,
        heuristics: EntryHeuristics,
    },
    Async(ResolvedVc<Box<dyn Module>>),
    Isolated(ResolvedVc<Box<dyn Module>>),
    IsolatedMerged {
        parent: Box<ChunkGroupEntry>,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
    Shared(ResolvedVc<Box<dyn Module>>),
    SharedMultiple(Vec<ResolvedVc<Box<dyn Module>>>),
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
            Self::Entry {
                modules: entries, ..
            }
            | Self::IsolatedMerged { entries, .. }
            | Self::SharedMultiple(entries)
            | Self::SharedMerged { entries, .. } => Either::Right(entries.iter().copied()),
        }
    }
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub enum ChunkGroup {
    /// The entry chunk group of the compilation, e.g. src/index.js for a SPA, or app/foo/page.js
    /// for Next.js.
    Entry(Vec<ResolvedVc<Box<dyn Module>>>),
    /// An async chunk group. Corresponds to an incoming [ChunkingType::Async] reference
    Async(ResolvedVc<Box<dyn Module>>),
    /// An isolated chunk group. Corresponds to an incoming [ChunkingType::Isolated] reference with
    /// `merge_tag: None`
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// A worker chunk group. Corresponds to an incoming [ChunkingType::Worker] reference.
    Worker(ResolvedVc<Box<dyn Module>>),
    /// An isolated chunk group. Corresponds to an incoming [ChunkingType::Isolated] reference with
    /// `merge_tag: Some(_)`
    IsolatedMerged {
        parent: usize,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
    /// A shared chunk group. Corresponds to an incoming [ChunkingType::Shared] reference with
    /// `merge_tag: None`
    Shared(ResolvedVc<Box<dyn Module>>),
    /// A shared chunk group with multiple entries.
    SharedMultiple(Vec<ResolvedVc<Box<dyn Module>>>),
    /// A shared chunk group. Corresponds to an incoming [ChunkingType::Shared] reference with
    /// `merge_tag: Some(_)`
    SharedMerged {
        parent: usize,
        merge_tag: RcStr,
        entries: Vec<ResolvedVc<Box<dyn Module>>>,
    },
    /// a module with an incoming collected edge
    Collected(ResolvedVc<Box<dyn Module>>),
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
            ChunkGroup::Async(e)
            | ChunkGroup::Isolated(e)
            | ChunkGroup::Worker(e)
            | ChunkGroup::Shared(e)
            | ChunkGroup::Collected(e) => Either::Left(std::iter::once(*e)),
            ChunkGroup::Entry(entries)
            | ChunkGroup::IsolatedMerged { entries, .. }
            | ChunkGroup::SharedMultiple(entries)
            | ChunkGroup::SharedMerged { entries, .. } => Either::Right(entries.iter().copied()),
        }
    }

    /// Returns the canonical identity used to index this chunk group.
    ///
    /// A merged group is identified by its parent and merge tag alone. Those two determine the
    /// group; its `entries` are the *result* of merging everything reachable through the tagged
    /// references, not part of its identity, and their order is unspecified. Including them would
    /// make two values describing the same group compare unequal.
    pub fn key(&self) -> ChunkGroupKey {
        match self {
            ChunkGroup::Entry(entries) => ChunkGroupKey::Entry(entries.clone()),
            ChunkGroup::Async(module) => ChunkGroupKey::Async(*module),
            ChunkGroup::Isolated(module) => ChunkGroupKey::Isolated(*module),
            ChunkGroup::Worker(module) => ChunkGroupKey::Worker(*module),
            ChunkGroup::IsolatedMerged {
                parent, merge_tag, ..
            } => ChunkGroupKey::IsolatedMerged {
                parent: ChunkGroupId::from(*parent),
                merge_tag: merge_tag.clone(),
            },
            ChunkGroup::Shared(module) => ChunkGroupKey::Shared(*module),
            ChunkGroup::SharedMultiple(entries) => ChunkGroupKey::SharedMultiple(entries.clone()),
            ChunkGroup::SharedMerged {
                parent, merge_tag, ..
            } => ChunkGroupKey::SharedMerged {
                parent: ChunkGroupId::from(*parent),
                merge_tag: merge_tag.clone(),
            },
            ChunkGroup::Collected(module) => ChunkGroupKey::Collected(*module),
        }
    }

    pub fn entries_count(&self) -> usize {
        match self {
            ChunkGroup::Async(_)
            | ChunkGroup::Isolated(_)
            | ChunkGroup::Worker(_)
            | ChunkGroup::Shared(_)
            | ChunkGroup::Collected(_) => 1,
            ChunkGroup::Entry(entries)
            | ChunkGroup::IsolatedMerged { entries, .. }
            | ChunkGroup::SharedMultiple(entries)
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
            ChunkGroup::Async(entry) => turbofmt!("ChunkGroup::Async({:?})", entry.ident())
                .await?
                .to_string(),
            ChunkGroup::Collected(entry) => turbofmt!("ChunkGroup::Collected({:?})", entry.ident())
                .await?
                .to_string(),
            ChunkGroup::Isolated(entry) => turbofmt!("ChunkGroup::Isolated({:?})", entry.ident())
                .await?
                .to_string(),
            ChunkGroup::Worker(entry) => turbofmt!("ChunkGroup::Worker({:?})", entry.ident())
                .await?
                .to_string(),
            ChunkGroup::Shared(entry) => turbofmt!("ChunkGroup::Shared({:?})", entry.ident())
                .await?
                .to_string(),
            ChunkGroup::SharedMultiple(entries) => format!(
                "ChunkGroup::SharedMultiple({:?})",
                entries
                    .iter()
                    .map(|m| m.ident().to_string())
                    .try_join()
                    .await?
            ),
            ChunkGroup::IsolatedMerged {
                parent,
                merge_tag,
                entries,
            } => {
                format!(
                    "ChunkGroup::IsolatedMerged({}, {}, {:?})",
                    Box::pin(
                        chunk_group_info
                            .chunk_group_at(*parent)?
                            .debug_str(chunk_group_info)
                    )
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
                    Box::pin(
                        chunk_group_info
                            .chunk_group_at(*parent)?
                            .debug_str(chunk_group_info)
                    )
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

/// See [ChunkGroup] for documentation
#[turbo_tasks::task_input]
#[derive(Debug, Clone, Hash, PartialEq, Eq, Encode, Decode)]
pub enum ChunkGroupKey {
    Entry(Vec<ResolvedVc<Box<dyn Module>>>),
    Async(ResolvedVc<Box<dyn Module>>),
    Isolated(ResolvedVc<Box<dyn Module>>),
    Worker(ResolvedVc<Box<dyn Module>>),
    IsolatedMerged {
        parent: ChunkGroupId,
        merge_tag: RcStr,
    },
    Shared(ResolvedVc<Box<dyn Module>>),
    SharedMultiple(Vec<ResolvedVc<Box<dyn Module>>>),
    SharedMerged {
        parent: ChunkGroupId,
        merge_tag: RcStr,
    },
    /// a module with an incoming collected edge
    Collected(ResolvedVc<Box<dyn Module>>),
}

impl ChunkGroupKey {
    /// A stable identity of this chunk group, independent of the module graph it was discovered
    /// in.
    ///
    /// The result contains only module idents and merge tags, never a [`ChunkGroupId`], which is
    /// an index into one [`ChunkGroupInfo`] and denotes an unrelated chunk group in another: the
    /// parent of a merged chunk group is resolved through `keys` and rendered recursively.
    ///
    /// [`crate::chunk::available_chunk_groups::AvailableChunkGroups::hash`] derives output file
    /// names from this (through [`ChunkGroupInfo::chunk_group_ident_hashes`]), so two chunk groups
    /// must render equally exactly when they are the same chunk group. Changing the rendering
    /// renames assets; adding anything graph-local to it is a correctness bug.
    ///
    /// Errors when the parent of a merged chunk group is not in `keys`. That happens when the
    /// key comes from a different (e.g. newer) [`ChunkGroupInfo`] than `keys`, which is transient
    /// with eventual consistency.
    pub async fn ident_str(&self, keys: &FxIndexSet<ChunkGroupKey>) -> Result<String> {
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
                turbofmt!("Async({:?})", module.ident()).await?.to_string()
            }
            ChunkGroupKey::Collected(module) => turbofmt!("Collected({:?})", module.ident())
                .await?
                .to_string(),
            ChunkGroupKey::Isolated(module) => turbofmt!("Isolated({:?})", module.ident())
                .await?
                .to_string(),
            ChunkGroupKey::Worker(module) => {
                turbofmt!("Worker({:?})", module.ident()).await?.to_string()
            }
            ChunkGroupKey::IsolatedMerged { parent, merge_tag } => {
                format!(
                    "IsolatedMerged {{ parent: {}, merge_tag: {:?} }}",
                    Box::pin(Self::merged_parent(keys, parent.0 as usize)?.ident_str(keys)).await?,
                    merge_tag
                )
            }
            ChunkGroupKey::Shared(module) => {
                turbofmt!("Shared({:?})", module.ident()).await?.to_string()
            }
            ChunkGroupKey::SharedMultiple(entries) => format!(
                "SharedMultiple({:?})",
                entries
                    .iter()
                    .map(|m| m.ident().to_string())
                    .try_join()
                    .await?
            ),
            ChunkGroupKey::SharedMerged { parent, merge_tag } => {
                format!(
                    "SharedMerged {{ parent: {}, merge_tag: {:?} }}",
                    Box::pin(Self::merged_parent(keys, parent.0 as usize)?.ident_str(keys)).await?,
                    merge_tag
                )
            }
        })
    }

    /// How this chunk group is shown in debug output.
    ///
    /// Delegates to [`Self::ident_str`], which already renders the chunk group unambiguously.
    /// Debug output is free to diverge from it, but note that `ident_str` must stay stable because
    /// asset idents are derived from it -- change this wrapper rather than `ident_str` itself.
    pub async fn debug_str(&self, keys: &FxIndexSet<ChunkGroupKey>) -> Result<String> {
        self.ident_str(keys).await
    }

    /// The parent key of a merged chunk group. `parent` can be out of range when the merged key
    /// comes from a different [`ChunkGroupInfo`] than `keys`, so this is an error, not a panic.
    fn merged_parent(keys: &FxIndexSet<ChunkGroupKey>, parent: usize) -> Result<&ChunkGroupKey> {
        keys.get_index(parent).with_context(|| {
            format!(
                "parent chunk group {parent} of a merged chunk group is not a known chunk group \
                 ({} chunk groups)",
                keys.len()
            )
        })
    }
}

#[turbo_tasks::task_input]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, Encode, Decode)]
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

pub async fn compute_chunk_group_info(
    graph: &ModuleGraph,
    collected_modules: &ReadRef<CollectedModules>,
) -> Result<Vc<ChunkGroupInfo>> {
    let span_outer = tracing::info_span!(
        "compute chunk group info",
        module_count = tracing::field::Empty,
        visit_count = tracing::field::Empty,
        chunk_group_count = tracing::field::Empty
    );

    let span = span_outer.clone();
    async move {
        let mut chunk_groups_map: FxIndexMap<
            ChunkGroupKey,
            FxIndexSet<ResolvedVc<Box<dyn Module>>>,
        > = FxIndexMap::default();

        // For each module, the indices in the bitset store which chunk groups in `chunk_groups_map`
        // that module is part of.
        let mut module_chunk_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset> =
            FxHashMap::default();
        let mut async_loader_chunk_groups: FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset> =
            FxHashMap::default();

        let module_count = graph
            .graphs
            .iter()
            .map(|g| g.graph.node_count())
            .sum::<usize>();
        span.record("module_count", module_count);

        // use all entries from all graphs
        let entries = graph.all_chunk_group_entries().collect::<Vec<_>>();

        // First, rank every module in reverse postorder (so that a module is visited after the
        // modules importing it), and initialize `module_chunk_groups` with empty bitsets. The ranks
        // from the entries of the graph are shared with other analyses of this graph.
        let module_rank = graph.entry_ranks()?;
        module_chunk_groups.reserve(module_rank.len());
        for module in module_rank.keys() {
            module_chunk_groups.insert(*module, Bitset::new());
        }

        // ----

        fn entry_to_chunk_group_id(
            entry: ChunkGroupEntry,
            chunk_groups_map: &mut FxIndexMap<
                ChunkGroupKey,
                FxIndexSet<ResolvedVc<Box<dyn Module>>>,
            >,
        ) -> ChunkGroupKey {
            match entry {
                ChunkGroupEntry::Entry { modules, .. } => ChunkGroupKey::Entry(modules),
                ChunkGroupEntry::Async(entry) => ChunkGroupKey::Async(entry),
                ChunkGroupEntry::Isolated(entry) => ChunkGroupKey::Isolated(entry),
                ChunkGroupEntry::Shared(entry) => ChunkGroupKey::Shared(entry),
                ChunkGroupEntry::SharedMultiple(entries) => ChunkGroupKey::SharedMultiple(entries),
                ChunkGroupEntry::IsolatedMerged {
                    parent,
                    merge_tag,
                    entries: _,
                } => {
                    let parent = entry_to_chunk_group_id(*parent, chunk_groups_map);
                    let parent_entry = chunk_groups_map.entry(parent);
                    let parent_id = parent_entry.index();
                    parent_entry.or_default();

                    ChunkGroupKey::IsolatedMerged {
                        parent: ChunkGroupId::from(parent_id),
                        merge_tag,
                    }
                }
                ChunkGroupEntry::SharedMerged {
                    parent,
                    merge_tag,
                    entries: _,
                } => {
                    let parent = entry_to_chunk_group_id(*parent, chunk_groups_map);
                    let parent_entry = chunk_groups_map.entry(parent);
                    let parent_id = parent_entry.index();
                    parent_entry.or_default();

                    ChunkGroupKey::SharedMerged {
                        parent: ChunkGroupId::from(parent_id),
                        merge_tag,
                    }
                }
            }
        }

        let entry_chunk_group_keys = entries
            .iter()
            .flat_map(|&chunk_group| {
                let chunk_group_key =
                    entry_to_chunk_group_id(chunk_group.clone(), &mut chunk_groups_map);
                chunk_group
                    .entries()
                    .map(move |e| (e, chunk_group_key.clone()))
            })
            .collect::<FxHashMap<_, _>>();

        // `inherits_from[source]` is the set of chunk groups that inherit heuristics from `source`.
        let mut inherits_from: FxHashMap<u32, Bitset> = FxHashMap::default();

        // The async and shared references, recorded during the traversal and resolved to chunk
        // groups afterwards, once every module's chunk groups are final. They connect a chunk group
        // to the chunk groups that chunking it continues into.
        let mut async_references: FxHashSet<AsyncReference> = FxHashSet::default();
        let mut shared_references: FxHashSet<SharedReference> = FxHashSet::default();

        let visit_count = graph.traverse_edges_fixed_point_with_priority(
            entries
                .iter()
                .flat_map(|e| e.entries())
                .map(|e| {
                    Ok((
                        e,
                        Reverse(*module_rank.get(&e).context("Module rank not found")?),
                    ))
                })
                .collect::<Result<Vec<_>>>()?,
            &mut module_chunk_groups,
            |parent_info: Option<(ResolvedVc<Box<dyn Module>>, &'_ RefData, _)>,
             node: ResolvedVc<Box<dyn Module>>,
             _,
             module_chunk_groups: &mut FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset>|
             -> Result<GraphTraversalAction> {
                enum ChunkGroupInheritance<It: Iterator<Item = ChunkGroupKey>> {
                    Inherit(ResolvedVc<Box<dyn Module>>),
                    ChunkGroup(It),
                }
                let chunk_groups = if let Some((parent, ref_data, _)) = parent_info {
                    match &ref_data.chunking_type {
                        ChunkingType::Parallel { .. } => ChunkGroupInheritance::Inherit(parent),
                        ChunkingType::Async => {
                            // The async loader for `node` is emitted in every chunk group that
                            // contains the referencing module, so availability checks for async
                            // loaders can use the same bitmap intersection as regular modules.
                            let parent_groups = module_chunk_groups
                                .get(&parent)
                                .context("Module chunk group not found")?;
                            *async_loader_chunk_groups.entry(node).or_default() |= parent_groups;
                            async_references.insert((parent, node));
                            ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                                ChunkGroupKey::Async(node),
                            )))
                        }
                        ChunkingType::Isolated {
                            merge_tag: None, ..
                        } => ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                            ChunkGroupKey::Isolated(node),
                        ))),
                        ChunkingType::Worker { .. } => ChunkGroupInheritance::ChunkGroup(
                            Either::Left(std::iter::once(ChunkGroupKey::Worker(node))),
                        ),
                        ChunkingType::Shared {
                            merge_tag: None, ..
                        } => {
                            shared_references.insert((parent, node, None));
                            ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                                ChunkGroupKey::Shared(node),
                            )))
                        }
                        ChunkingType::Isolated {
                            merge_tag: Some(merge_tag),
                            ..
                        } => {
                            let parents = module_chunk_groups
                                .get(&parent)
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
                            shared_references.insert((parent, node, Some(merge_tag.clone())));
                            let parents = module_chunk_groups
                                .get(&parent)
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
                        ChunkingType::Traced { .. } => {
                            // Traced modules are not placed in chunk groups
                            return Ok(GraphTraversalAction::Skip);
                        }
                        ChunkingType::Emitted {
                            namespace: _,
                            emit_to_all_entries: _,
                        } => {
                            // TODO ideally this would get the chunk group bitset of the parent
                            // ChunkGroup::Entry
                            ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                                ChunkGroupKey::Collected(node),
                            )))
                        }
                        ChunkingType::Collected { .. } => {
                            // These only exist in the module_batches graph.
                            unreachable!();
                        }
                        ChunkingType::PerEntry => {
                            // A collecting module belongs wherever its importer belongs. The
                            // per-entry behavior is carried by the `chunk_group` argument of
                            // `CollectingModule::as_chunk_item`, not by chunk group membership.
                            // This matches `collect.rs`, which inherits the parent's entry
                            // membership across this edge.
                            ChunkGroupInheritance::Inherit(parent)
                        }
                    }
                } else {
                    ChunkGroupInheritance::ChunkGroup(Either::Left(std::iter::once(
                        // TODO remove clone
                        entry_chunk_group_keys
                            .get(&node)
                            .context("Module chunk group not found")?
                            .clone(),
                    )))
                };

                Ok(match chunk_groups {
                    ChunkGroupInheritance::ChunkGroup(chunk_groups) => {
                        // Start of a new chunk group, don't inherit anything from parent
                        let chunk_group_ids = chunk_groups.map(|chunk_group| {
                            // For merged groups, the parent group id whose heuristics they inherit.
                            let merged_parent = match &chunk_group {
                                ChunkGroupKey::IsolatedMerged { parent, .. }
                                | ChunkGroupKey::SharedMerged { parent, .. } => Some(parent.0),
                                _ => None,
                            };
                            let id = match chunk_groups_map.entry(chunk_group) {
                                Entry::Occupied(mut e) => {
                                    let id = e.index() as u32;
                                    if merged_parent.is_some() {
                                        e.get_mut().insert(node);
                                    }
                                    id
                                }
                                Entry::Vacant(e) => {
                                    let id = e.index() as u32;
                                    let mut set = FxIndexSet::default();
                                    if merged_parent.is_some() {
                                        set.insert(node);
                                    }
                                    e.insert(set);
                                    id
                                }
                            };
                            // Record heuristics-inheritance edges into this chunk group: merged
                            // groups inherit from their specific parent group; all other groups
                            // inherit from every chunk group of the referencing module.
                            if let Some(parent) = merged_parent {
                                inherits_from.entry(parent).or_default().insert(id);
                            } else if let Some((parent_module, _, _)) = parent_info
                                && let Some(parent_groups) = module_chunk_groups.get(&parent_module)
                            {
                                for source in parent_groups.iter() {
                                    inherits_from.entry(source).or_default().insert(id);
                                }
                            }
                            id
                        });

                        let chunk_groups = Bitset::from_iter(chunk_group_ids);

                        // Assign chunk group to the target node (the entry of the chunk group)
                        let bitset = module_chunk_groups
                            .get_mut(&node)
                            .context("Module chunk group not found")?;
                        if bitset.union_with(&chunk_groups) {
                            // Added bits from parent, continue traversal because changed
                            GraphTraversalAction::Continue
                        } else {
                            // Unchanged, no need to forward to children
                            GraphTraversalAction::Skip
                        }
                    }
                    ChunkGroupInheritance::Inherit(parent) => {
                        // Inherit chunk groups from parent, merge parent chunk groups into
                        // current

                        if parent == node {
                            // A self-reference
                            GraphTraversalAction::Skip
                        } else {
                            let [Some(parent_chunk_groups), Some(current_chunk_groups)] =
                                module_chunk_groups.get_disjoint_mut([&parent, &node])
                            else {
                                // All modules are inserted in the previous iteration
                                // Technically unreachable, but could be reached due to eventual
                                // consistency
                                bail!("Module chunk groups not found");
                            };

                            // On the initial visit, `union_with` copies the parent's chunk groups.
                            if current_chunk_groups.union_with(parent_chunk_groups) {
                                // Added bits from parent, continue traversal because changed
                                GraphTraversalAction::Continue
                            } else {
                                // Unchanged, no need to forward to children
                                GraphTraversalAction::Skip
                            }
                        }
                    }
                })
            },
            // Visit modules in reverse postorder (lowest rank first, the traversal visits the
            // highest priority first). This visits a module only after all of the modules
            // importing it (except via cycles), so most modules are visited once, with their final
            // set of chunk groups.
            |successor, _| {
                Ok(Reverse(
                    *module_rank
                        .get(&successor)
                        .context("Module rank not found")?,
                ))
            },
        )?;

        span.record("visit_count", visit_count);
        span.record("chunk_group_count", chunk_groups_map.len());

        static PRINT_CHUNK_GROUP_INFO: LazyLock<bool> =
            LazyLock::new(|| match std::env::var_os("TURBOPACK_PRINT_CHUNK_GROUPS") {
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
                if !key.is_zero() {
                    buckets
                        .entry(key.iter().collect::<Vec<_>>())
                        .or_insert(BTreeSet::new())
                        .insert(module.ident().to_string().await?);
                }
            }

            let mut result = vec![];
            result.push("Chunk Groups:".to_string());
            let keys = chunk_groups_map.keys().cloned().collect::<FxIndexSet<_>>();
            for (i, key) in keys.iter().enumerate() {
                result.push(format!("  {:?}: {}", i, key.debug_str(&keys).await?));
            }
            result.push("# Module buckets:".to_string());
            for (key, modules) in buckets.iter() {
                result.push(format!("## {:?}:", key.iter().collect::<Vec<_>>()));
                for module in modules {
                    result.push(format!("  {module}"));
                }
                result.push("".to_string());
            }
            let f = absolute(format!("chunk_group_info_{}.log", visit_count))?;
            println!("Wrote Chunk Group Info to {}", f.display());
            std::fs::write(f, result.join("\n"))?;
        }

        // Resolve per-chunk-group chunking heuristics. Entry
        // chunk groups carry their route's clusters / priority-route flag; other chunk groups
        // inherit the union of clusters (and OR of the flag) from their referencing chunk groups.
        let mut clusters: Vec<Bitset> = vec![Bitset::new(); chunk_groups_map.len()];
        let mut priority_routes = Bitset::new();

        let mut worklist: Vec<usize> = Vec::new();

        for chunk_group in &entries {
            let ChunkGroupEntry::Entry {
                modules,
                heuristics,
            } = chunk_group
            else {
                continue;
            };
            if heuristics.clusters.is_empty() && !heuristics.high_priority {
                continue;
            }
            if let Some(index) =
                chunk_groups_map.get_index_of(&ChunkGroupKey::Entry(modules.clone()))
            {
                if clusters[index].is_zero() && !priority_routes.contains(index as u32) {
                    worklist.push(index);
                }
                clusters[index].extend(heuristics.clusters.iter().map(|&c| c as u32));
                if heuristics.high_priority {
                    priority_routes.insert(index as u32);
                }
            }
        }

        while let Some(source) = worklist.pop() {
            let source_priority_route = priority_routes.contains(source as u32);
            let Some(targets) = inherits_from.get(&(source as u32)) else {
                continue;
            };
            for target in targets.iter() {
                let target = target as usize;
                if target == source {
                    continue;
                }
                let [source_clusters, target_clusters] =
                    clusters.get_disjoint_mut([source, target]).unwrap();
                let clusters_changed = target_clusters.union_with(source_clusters);
                let changed = (source_priority_route && priority_routes.insert(target as u32))
                    || clusters_changed;
                if changed {
                    worklist.push(target);
                }
            }
        }

        let async_loader_relevant_chunk_groups = compute_async_loader_relevant_chunk_groups(
            &chunk_groups_map,
            &module_chunk_groups,
            &async_loader_chunk_groups,
            &async_references,
            &shared_references,
            collected_modules,
        )?;

        let chunk_group_clusters: Vec<Vec<u16>> = clusters
            .into_iter()
            .map(|bm| bm.iter().map(|id| id as u16).collect())
            .collect();
        let chunk_group_priority_routes = priority_routes;

        Ok(ChunkGroupInfo {
            module_chunk_groups: ResolvedVc::cell(module_chunk_groups),
            async_loader_chunk_groups: ResolvedVc::cell(async_loader_chunk_groups),
            async_loader_relevant_chunk_groups: ResolvedVc::cell(
                async_loader_relevant_chunk_groups,
            ),
            chunk_group_keys: chunk_groups_map.keys().cloned().collect(),
            chunk_group_indices: ResolvedVc::cell(
                chunk_groups_map
                    .keys()
                    .enumerate()
                    .map(|(index, key)| (key.clone(), index as u32))
                    .collect(),
            ),
            chunking_heuristics: ChunkingHeuristicsInfo {
                clusters: chunk_group_clusters,
                priority_routes: chunk_group_priority_routes,
            },
            chunk_groups: chunk_groups_map
                .into_iter()
                .map(|(k, merged_entries)| match k {
                    ChunkGroupKey::Entry(entries) => ChunkGroup::Entry(entries),
                    ChunkGroupKey::Async(module) => ChunkGroup::Async(module),
                    ChunkGroupKey::Collected(module) => ChunkGroup::Collected(module),
                    ChunkGroupKey::Isolated(module) => ChunkGroup::Isolated(module),
                    ChunkGroupKey::Worker(module) => ChunkGroup::Worker(module),
                    ChunkGroupKey::IsolatedMerged { parent, merge_tag } => {
                        ChunkGroup::IsolatedMerged {
                            parent: parent.0 as usize,
                            merge_tag,
                            entries: merged_entries.into_iter().collect(),
                        }
                    }
                    ChunkGroupKey::Shared(module) => ChunkGroup::Shared(module),
                    ChunkGroupKey::SharedMultiple(entries) => ChunkGroup::SharedMultiple(entries),
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

/// An async reference: `(referencing module, referenced module)`.
type AsyncReference = (ResolvedVc<Box<dyn Module>>, ResolvedVc<Box<dyn Module>>);

/// A shared reference: `(referencing module, referenced module, merge tag)`.
type SharedReference = (
    ResolvedVc<Box<dyn Module>>,
    ResolvedVc<Box<dyn Module>>,
    Option<RcStr>,
);

/// Computes [`AsyncLoaderRelevantChunkGroups`] for every async chunk group whose chunking is fully
/// known (see the opaque chunk groups below; the others get no entry and keep their availability).
///
/// Chunking a chunk group `g` traverses the modules reachable from its entries through parallel,
/// shared and collected references, and checks each module's chunk groups (and each async loader's
/// chunk groups) against the available chunk groups. So `g` is affected by an available chunk group
/// only if it is a member of something the traversal visits. Every visited module is a member of a
/// chunk group in the closure of `g` over the chunk group graph built here:
///
/// - `p -> Shared(x)` (or `SharedMerged { parent: p, .. }`) for a shared reference to `x` from a
///   module in `p`,
/// - `p -> Collected(t)` for a collected module `t` of a collecting module in `p`,
/// - `p -> Async(m)` for an async reference to `m` from a module in `p`. Nested async chunk groups
///   are chunked with the availability of their parent, so what they observe is observed by the
///   parent as well.
///
/// The observed sets of `g` are then the chunk groups of every module that is a member of a chunk
/// group in the closure, plus the chunk groups of every async loader created in it. Extra sets are
/// safe (they only make the canonical availability more specific); missing one would change the
/// chunking, so this follows the edges the chunking traverses.
///
/// Cycles (e.g. two modules that import each other dynamically) are handled by computing the
/// closure per strongly connected component. Equal sets are interned, so the closure works on set
/// ids.
///
/// The async chunk group of an [`ActivatableModule`] is a boundary. Its references can appear
/// later, and names derived from the availability of its async loader must not change when they
/// do. So the closure doesn't continue through it: only its own modules are observed, not the
/// async loaders created in it or what it references. It gets no entry (its loader keeps the given
/// availability), and every async chunk group whose closure reaches it uses the subset filter and
/// keeps the entry group (see [`AsyncLoaderRelevantChunkGroups::reaches_activatable`]).
/// Activation can still add chunk groups behind the boundary to the chunk groups of modules above
/// it, but those are never available above it, so the subset-filtered availabilities there don't
/// change.
fn compute_async_loader_relevant_chunk_groups<'a>(
    chunk_groups_map: &FxIndexMap<ChunkGroupKey, FxIndexSet<ResolvedVc<Box<dyn Module>>>>,
    module_chunk_groups: &'a FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset>,
    async_loader_chunk_groups: &'a FxHashMap<ResolvedVc<Box<dyn Module>>, Bitset>,
    async_references: &FxHashSet<AsyncReference>,
    shared_references: &FxHashSet<SharedReference>,
    collected_modules: &ReadRef<CollectedModules>,
) -> Result<FxHashMap<ResolvedVc<Box<dyn Module>>, AsyncLoaderRelevantChunkGroups>> {
    let _span = tracing::info_span!("compute async loader relevant chunk groups").entered();

    let index_of = |key: &ChunkGroupKey| chunk_groups_map.get_index_of(key).map(|i| i as u32);
    let groups_of = |module: &ResolvedVc<Box<dyn Module>>| -> Result<&Bitset> {
        module_chunk_groups
            .get(module)
            .context("Module chunk group not found")
    };

    // Distinct observed sets, by id.
    let mut observed_sets: Vec<&Bitset> = Vec::new();
    let mut observed_ids: FxHashMap<&Bitset, u32> = FxHashMap::default();
    let mut intern = |set: &'a Bitset| -> u32 {
        *observed_ids.entry(set).or_insert_with(|| {
            observed_sets.push(set);
            (observed_sets.len() - 1) as u32
        })
    };

    // The async chunk groups of activatable modules. The closure stops at them: they get no
    // outgoing edges and no loader sets.
    let activatable = chunk_groups_map
        .keys()
        .enumerate()
        .filter_map(|(index, key)| match key {
            ChunkGroupKey::Async(module)
                if ResolvedVc::try_downcast::<Box<dyn ActivatableModule>>(*module).is_some() =>
            {
                Some(index as u32)
            }
            _ => None,
        })
        .collect::<Bitset>();
    // The chunk groups of a module that the closure continues from.
    let outside_activatable = {
        let activatable = &activatable;
        move |groups: &'a Bitset| {
            groups
                .iter()
                .filter(move |group| !activatable.contains(*group))
        }
    };

    // The chunk group graph, the ids of the chunk group sets of async loaders created while
    // chunking a chunk group, and the chunk groups that contain a collecting module.
    let mut graph = DiGraphMap::<u32, ()>::new();
    let mut loader_sets: FxHashMap<u32, Bitset> = FxHashMap::default();
    let mut has_collecting_module = Bitset::new();

    for (parent, child) in async_references {
        let target = index_of(&ChunkGroupKey::Async(*child))
            .context("Async chunk group not found for async reference")?;
        let loader_set = intern(
            async_loader_chunk_groups
                .get(child)
                .context("Async loader chunk groups not found for async reference")?,
        );
        for group in outside_activatable(groups_of(parent)?) {
            graph.add_edge(group, target, ());
            loader_sets.entry(group).or_default().insert(loader_set);
        }
    }

    for (parent, child, merge_tag) in shared_references {
        for group in outside_activatable(groups_of(parent)?) {
            let key = match merge_tag {
                None => ChunkGroupKey::Shared(*child),
                Some(merge_tag) => ChunkGroupKey::SharedMerged {
                    parent: ChunkGroupId(group),
                    merge_tag: merge_tag.clone(),
                },
            };
            let target = index_of(&key).context("Shared chunk group not found")?;
            graph.add_edge(group, target, ());
        }
    }

    // A collecting module reads the entry group, even when nothing is collected into it.
    for (module, groups) in module_chunk_groups {
        if ResolvedVc::try_downcast::<Box<dyn CollectingModule>>(*module).is_some() {
            has_collecting_module |= groups;
        }
    }

    // Every collected module is the entry of a `Collected` chunk group (see the
    // `ChunkingType::Emitted` handling in `compute_chunk_group_info`). Chunking continues into it
    // through the collected reference of the collecting module. Both passes follow the same
    // references, so a collected module without a `Collected` chunk group isn't expected. If there
    // is one anyway, its chunking is unknown: its collecting chunk groups are opaque, and async
    // loaders whose closure contains them keep their availability as is.
    let mut opaque = Bitset::new();
    for (collecting_module, per_entry) in collected_modules.iter() {
        let Some(collecting_groups) = module_chunk_groups.get(collecting_module) else {
            continue;
        };
        let collecting_groups = outside_activatable(collecting_groups).collect::<Bitset>();
        for (_, references) in per_entry {
            for (_, collected_module) in references {
                match index_of(&ChunkGroupKey::Collected(*collected_module)) {
                    Some(target) => {
                        for group in collecting_groups.iter() {
                            graph.add_edge(group, target, ());
                        }
                    }
                    None => opaque |= &collecting_groups,
                }
            }
        }
    }

    // The async chunk groups, and every chunk group reachable from them.
    let async_chunk_groups = chunk_groups_map
        .keys()
        .enumerate()
        .filter_map(|(index, key)| match key {
            ChunkGroupKey::Async(module) => Some((index as u32, *module)),
            _ => None,
        })
        .collect::<Vec<_>>();
    for (index, _) in &async_chunk_groups {
        graph.add_node(*index);
    }
    let mut reachable = Bitset::new();
    let mut stack = async_chunk_groups
        .iter()
        .map(|(index, _)| *index)
        .collect::<Vec<_>>();
    while let Some(group) = stack.pop() {
        if reachable.insert(group) {
            stack.extend(
                graph
                    .neighbors(group)
                    .filter(|successor| !reachable.contains(*successor)),
            );
        }
    }

    // For each reachable chunk group, the ids of the chunk group sets of its modules. Modules
    // reachable through the same references usually have equal chunk groups, so each distinct set
    // is only processed once.
    let mut direct_sets: FxHashMap<u32, Bitset> = FxHashMap::default();
    let mut seen: FxHashSet<&Bitset> = FxHashSet::default();
    for groups in module_chunk_groups.values() {
        if groups.is_disjoint(&reachable) || !seen.insert(groups) {
            continue;
        }
        let set = intern(groups);
        for group in groups.iter().filter(|group| reachable.contains(*group)) {
            direct_sets.entry(group).or_default().insert(set);
        }
    }

    // Close over the chunk group graph, one strongly connected component at a time. `tarjan_scc`
    // returns the components in reverse topological order, so the successors of a component are
    // done before it. A component is either entirely reachable from an async chunk group or not
    // at all, and the unreachable ones are skipped.
    let components = tarjan_scc(&graph);
    let mut component_of: FxHashMap<u32, usize> = FxHashMap::default();
    // Per component: the ids of its observed sets, whether it reaches a collecting module, whether
    // it is opaque, and whether it reaches an activatable chunk group.
    let mut closure: Vec<(Bitset, bool, bool, bool)> = Vec::with_capacity(components.len());
    for (index, component) in components.iter().enumerate() {
        if !reachable.contains(component[0]) {
            closure.push(Default::default());
            continue;
        }
        for group in component {
            component_of.insert(*group, index);
        }
        let mut sets = Bitset::new();
        let mut collecting = false;
        let mut is_opaque = false;
        let mut reaches = false;
        for group in component {
            for group_sets in [direct_sets.get(group), loader_sets.get(group)]
                .into_iter()
                .flatten()
            {
                sets |= group_sets;
            }
            collecting |= has_collecting_module.contains(*group);
            is_opaque |= opaque.contains(*group);
            reaches |= activatable.contains(*group);
            for successor in graph.neighbors(*group) {
                let successor = component_of[&successor];
                if successor != index {
                    let (successor_sets, successor_collecting, successor_opaque, successor_reaches) =
                        &closure[successor];
                    sets |= successor_sets;
                    collecting |= successor_collecting;
                    is_opaque |= successor_opaque;
                    reaches |= successor_reaches;
                }
            }
        }
        closure.push((sets, collecting, is_opaque, reaches));
    }

    Ok(async_chunk_groups
        .into_iter()
        .filter_map(|(index, module)| {
            let (sets, reaches_collecting_module, is_opaque, reaches_activatable) =
                &closure[component_of[&index]];
            if *is_opaque || activatable.contains(index) {
                return None;
            }
            let mut observed_chunk_groups = sets
                .iter()
                .map(|set| observed_sets[set as usize].clone())
                .collect::<Vec<_>>();
            // Interned ids follow hash map order. Sort by content, so that an entry only changes
            // when its sets do.
            observed_chunk_groups.sort_by(|a, b| a.iter().cmp(b.iter()));
            let mut chunk_groups = Bitset::new();
            for set in &observed_chunk_groups {
                chunk_groups |= set;
            }
            Some((
                module,
                AsyncLoaderRelevantChunkGroups {
                    observed_chunk_groups,
                    chunk_groups,
                    reaches_collecting_module: *reaches_collecting_module,
                    reaches_activatable: *reaches_activatable,
                },
            ))
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use turbo_bitset::Bitset;

    use super::AsyncLoaderRelevantChunkGroups;

    /// All subsets of `0..n`, as bitsets.
    fn subsets(n: u32) -> Vec<Bitset> {
        (0..1u32 << n)
            .map(|mask| (0..n).filter(|i| mask & (1 << i) != 0).collect())
            .collect()
    }

    fn hits(observed: &[Bitset], available: &Bitset) -> Vec<bool> {
        observed
            .iter()
            .map(|set| !set.is_disjoint(available))
            .collect()
    }

    fn union(a: &Bitset, b: &Bitset) -> Bitset {
        let mut result = a.clone();
        result |= b;
        result
    }

    /// Exhaustive over a small universe of 4 chunk groups: for every family of up to 3 observed
    /// sets and every availability, the canonical availability answers every observed test the
    /// same way, is a fixed point, and only depends on the answers. Adding chunk groups (as
    /// chunking nested chunk groups does) keeps the answers equal as well. With
    /// `reaches_activatable`, the result answers the same way and is a subset.
    #[test]
    fn canonicalize_preserves_observed_tests() {
        let all = subsets(4);
        let non_empty = &all[1..];
        for (i, a) in non_empty.iter().enumerate() {
            for (j, b) in non_empty.iter().enumerate().skip(i) {
                for c in non_empty.iter().skip(j) {
                    let mut observed = vec![a.clone(), b.clone(), c.clone()];
                    observed.dedup();
                    let mut chunk_groups = Bitset::new();
                    for set in &observed {
                        chunk_groups |= set;
                    }
                    let relevant = AsyncLoaderRelevantChunkGroups {
                        observed_chunk_groups: observed,
                        chunk_groups,
                        reaches_collecting_module: false,
                        reaches_activatable: false,
                    };
                    let observed = &relevant.observed_chunk_groups;
                    let subset_only = AsyncLoaderRelevantChunkGroups {
                        reaches_activatable: true,
                        ..relevant.clone()
                    };
                    let mut by_hits = rustc_hash::FxHashMap::default();
                    for available in &all {
                        // Reaching an activatable chunk group only removes chunk groups.
                        let subset = subset_only.canonicalize(available);
                        assert!(subset.is_subset(available));
                        assert_eq!(hits(observed, available), hits(observed, &subset));

                        let canonical = relevant.canonicalize(available);
                        assert_eq!(hits(observed, available), hits(observed, &canonical));
                        assert_eq!(relevant.canonicalize(&canonical), canonical);
                        let previous = by_hits
                            .entry(hits(observed, available))
                            .or_insert_with(|| canonical.clone());
                        assert_eq!(*previous, canonical);
                        for extra in &all {
                            assert_eq!(
                                hits(observed, &union(available, extra)),
                                hits(observed, &union(&canonical, extra))
                            );
                        }
                    }
                }
            }
        }
    }
}
