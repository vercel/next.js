use anyhow::{Context, Result};
use roaring::RoaringBitmap;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::module_graph::{
    ModuleGraph,
    chunk_group_info::{ChunkGroupId, ChunkGroupKey, RoaringBitmapWrapper},
};

/// Chunk groups whose content is already available.
///
/// Whether an individual module is available is derived by intersecting this bitmap with the
/// module's chunk group membership bitmap.
///
/// The bitmap holds indices into the [`crate::module_graph::chunk_group_info::ChunkGroupInfo`] of a
/// single [`ModuleGraph`]. The same index means something entirely different in another graph, so
/// the graph is stored alongside the bitmap and every operation asserts that it matches. Use
/// [`AvailableChunkGroups::translate`] to move availability to a different graph.
#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub struct AvailableChunkGroups {
    /// The module graph whose `ChunkGroupInfo` the indices in `chunk_groups` refer to.
    module_graph: ResolvedVc<ModuleGraph>,
    chunk_groups: RoaringBitmapWrapper,
}

impl AvailableChunkGroups {
    /// Panics in debug builds when `module_graph` is not the graph these chunk group indices
    /// belong to. Chunk group indices of a different graph would silently resolve to unrelated
    /// chunk groups, which drops modules from the output.
    pub fn assert_module_graph(&self, module_graph: ResolvedVc<ModuleGraph>) {
        debug_assert_eq!(
            self.module_graph, module_graph,
            "AvailableChunkGroups was created for a different ModuleGraph. Chunk group indices \
             are only valid within the ChunkGroupInfo of the graph that produced them; use \
             AvailableChunkGroups::translate to move them to another graph."
        );
    }

    /// The chunk groups that are available, for `module_graph`.
    pub fn chunk_groups(&self, module_graph: ResolvedVc<ModuleGraph>) -> &RoaringBitmapWrapper {
        self.assert_module_graph(module_graph);
        &self.chunk_groups
    }
}

#[turbo_tasks::value_impl]
impl AvailableChunkGroups {
    #[turbo_tasks::function]
    pub fn new(module_graph: ResolvedVc<ModuleGraph>, chunk_group: u32) -> Vc<Self> {
        let mut chunk_groups = RoaringBitmapWrapper::default();
        chunk_groups.insert(chunk_group);
        Self {
            module_graph,
            chunk_groups,
        }
        .cell()
    }

    /// Adds `chunk_group` to the set. Adding a chunk group that is already available is a no-op:
    /// a chunk group can be reached again further down a chunking chain, and availability is a
    /// set, not a count.
    #[turbo_tasks::function]
    pub fn with_chunk_group(
        &self,
        module_graph: ResolvedVc<ModuleGraph>,
        chunk_group: u32,
    ) -> Vc<Self> {
        self.assert_module_graph(module_graph);
        let mut chunk_groups = self.chunk_groups.clone();
        chunk_groups.insert(chunk_group);
        Self {
            module_graph: self.module_graph,
            chunk_groups,
        }
        .cell()
    }

    /// Re-expresses this availability in terms of `module_graph`'s
    /// [`crate::module_graph::chunk_group_info::ChunkGroupInfo`].
    ///
    /// Every index is mapped to its [`ChunkGroupKey`] in the source graph and back to the index of
    /// that key in the target graph. A chunk group that the target graph doesn't know is dropped,
    /// which is the conservative direction: it can only lead to a module being emitted again,
    /// never to one being omitted.
    #[turbo_tasks::function]
    pub async fn translate(&self, module_graph: ResolvedVc<ModuleGraph>) -> Result<Vc<Self>> {
        if self.module_graph == module_graph {
            return Ok(Self {
                module_graph,
                chunk_groups: self.chunk_groups.clone(),
            }
            .cell());
        }

        let from = self.module_graph.chunk_group_info().await?;
        let to = module_graph.chunk_group_info().await?;

        let mut translated = RoaringBitmap::new();
        for id in self.chunk_groups.iter() {
            if let Some(id) =
                translate_chunk_group(&from.chunk_group_keys, &to.chunk_group_keys, id)
            {
                translated.insert(id);
            }
        }

        Ok(Self {
            module_graph,
            chunk_groups: RoaringBitmapWrapper(translated),
        }
        .cell())
    }

    /// A hash identifying the available chunk groups, used to distinguish assets that are
    /// generated for different availability.
    ///
    /// This value reaches asset idents and therefore output file names (see
    /// [`crate::chunk::availability_info::AvailabilityInfo::ident`]), so it must mean the same
    /// thing everywhere. It is derived from the *identity* of each available chunk group -- module
    /// idents and merge tags -- and never from the chunk group indices themselves: an index is
    /// only meaningful within one [`ModuleGraph`]'s `ChunkGroupInfo` and denotes an unrelated chunk
    /// group in any other graph. Hashing indices would let two different availabilities, coming
    /// from two graphs, claim the same output path with different content.
    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let chunk_group_info = self.module_graph.chunk_group_info().await?;
        let keys = &chunk_group_info.chunk_group_keys;

        let idents = self
            .chunk_groups
            .iter()
            .map(async |id| {
                let key = keys.get_index(id as usize).with_context(|| {
                    format!(
                        "available chunk group {id} is not a chunk group of the module graph it \
                         belongs to"
                    )
                })?;
                key.ident_str(keys).await
            })
            .try_join()
            .await?;

        Ok(Vc::cell(hash_chunk_group_idents(idents)))
    }
}

/// Hashes the identities of the available chunk groups.
///
/// The identities are sorted first: chunk groups are iterated in index order, which differs
/// between graphs, so the set has to be put into an order that only depends on the identities
/// themselves.
fn hash_chunk_group_idents(mut idents: Vec<String>) -> u64 {
    idents.sort_unstable();

    let mut hasher = Xxh3Hash64Hasher::new();
    hasher.write_value(idents.len());
    for ident in &idents {
        hasher.write_value(ident);
    }
    hasher.finish()
}

/// Maps a chunk group index of `from` to the index of the same chunk group in `to`, or `None` when
/// `to` doesn't contain that chunk group.
///
/// Merged chunk group keys identify their parent by index, so the parent is translated first and a
/// merged group whose parent is unknown to `to` is dropped along with it.
fn translate_chunk_group(
    from: &FxIndexSet<ChunkGroupKey>,
    to: &FxIndexSet<ChunkGroupKey>,
    id: u32,
) -> Option<u32> {
    let key = from.get_index(id as usize)?;
    let key = match key {
        ChunkGroupKey::IsolatedMerged { parent, merge_tag } => ChunkGroupKey::IsolatedMerged {
            parent: ChunkGroupId::from(translate_chunk_group(from, to, **parent)? as usize),
            merge_tag: merge_tag.clone(),
        },
        ChunkGroupKey::SharedMerged { parent, merge_tag } => ChunkGroupKey::SharedMerged {
            parent: ChunkGroupId::from(translate_chunk_group(from, to, **parent)? as usize),
            merge_tag: merge_tag.clone(),
        },
        key => key.clone(),
    };
    to.get_index_of(&key).map(|id| id as u32)
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks::FxIndexSet;

    use crate::{
        chunk::available_chunk_groups::{hash_chunk_group_idents, translate_chunk_group},
        module_graph::chunk_group_info::{ChunkGroupId, ChunkGroupKey},
    };

    fn isolated_merged(parent: usize, merge_tag: &str) -> ChunkGroupKey {
        ChunkGroupKey::IsolatedMerged {
            parent: ChunkGroupId::from(parent),
            merge_tag: merge_tag.into(),
        }
    }

    /// The hash `AvailableChunkGroups::hash` produces for the chunk groups `ids` of `keys`.
    ///
    /// Renders the keys the way `hash` does. Every key here is module-free, so rendering resolves
    /// no module idents and needs no turbo-tasks context.
    async fn hash_of(keys: &FxIndexSet<ChunkGroupKey>, ids: &[u32]) -> u64 {
        let mut idents = Vec::new();
        for &id in ids {
            idents.push(
                keys[id as usize]
                    .ident_str(keys)
                    .await
                    .expect("rendering a chunk group without modules cannot fail"),
            );
        }
        hash_chunk_group_idents(idents)
    }

    #[test]
    fn translates_chunk_groups_by_key_not_by_index() {
        // The same chunk groups, but discovered in a different order, so the indices differ.
        let from = FxIndexSet::from_iter([
            ChunkGroupKey::Entry(vec![]),
            ChunkGroupKey::SharedMultiple(vec![]),
        ]);
        let to = FxIndexSet::from_iter([
            ChunkGroupKey::SharedMultiple(vec![]),
            ChunkGroupKey::Entry(vec![]),
        ]);

        assert_eq!(translate_chunk_group(&from, &to, 0), Some(1));
        assert_eq!(translate_chunk_group(&from, &to, 1), Some(0));
    }

    #[test]
    fn translates_a_merged_group_parent_too() {
        let from = FxIndexSet::from_iter([ChunkGroupKey::Entry(vec![]), isolated_merged(0, "x")]);
        let to = FxIndexSet::from_iter([
            ChunkGroupKey::SharedMultiple(vec![]),
            ChunkGroupKey::Entry(vec![]),
            isolated_merged(1, "x"),
        ]);

        // The merged group's parent moved from index 0 to index 1, so the key only matches when
        // the parent is translated first.
        assert_eq!(translate_chunk_group(&from, &to, 1), Some(2));
    }

    #[test]
    fn drops_chunk_groups_the_target_graph_does_not_have() {
        let from = FxIndexSet::from_iter([
            ChunkGroupKey::Entry(vec![]),
            ChunkGroupKey::SharedMultiple(vec![]),
            isolated_merged(0, "x"),
            isolated_merged(1, "y"),
        ]);
        let to = FxIndexSet::from_iter([ChunkGroupKey::Entry(vec![]), isolated_merged(0, "x")]);

        // Unknown group.
        assert_eq!(translate_chunk_group(&from, &to, 1), None);
        // Known group with a known parent.
        assert_eq!(translate_chunk_group(&from, &to, 2), Some(1));
        // Merged group whose parent the target graph doesn't have.
        assert_eq!(translate_chunk_group(&from, &to, 3), None);
        // Out of range.
        assert_eq!(translate_chunk_group(&from, &to, 4), None);
    }

    #[test]
    fn rcstr_merge_tags_compare_by_value() {
        let from = FxIndexSet::from_iter([
            ChunkGroupKey::Entry(vec![]),
            isolated_merged(0, rcstr!("x").as_str()),
        ]);
        let to = FxIndexSet::from_iter([ChunkGroupKey::Entry(vec![]), isolated_merged(0, "x")]);

        assert_eq!(translate_chunk_group(&from, &to, 1), Some(1));
    }

    #[tokio::test]
    async fn hash_does_not_depend_on_chunk_group_order() {
        // The same chunk groups, discovered in a different order by each graph, so the same
        // availability is a *different* set of indices in each: {0,2} here, {2,1} there.
        let one = FxIndexSet::from_iter([
            ChunkGroupKey::Entry(vec![]),
            ChunkGroupKey::SharedMultiple(vec![]),
            isolated_merged(0, "x"),
        ]);
        let other = FxIndexSet::from_iter([
            ChunkGroupKey::SharedMultiple(vec![]),
            isolated_merged(2, "x"),
            ChunkGroupKey::Entry(vec![]),
        ]);

        // Hashing the bitmaps would compare {0,2} against {1,2} and call the same availability
        // different.
        assert_eq!(
            hash_of(&one, &[0, 2]).await,
            hash_of(&other, &[2, 1]).await,
            "the same chunk groups must hash equally regardless of their index"
        );
    }

    #[tokio::test]
    async fn hash_distinguishes_equal_indices_in_different_graphs() {
        // This is the collision that motivated hashing identities: when a consumer builds more
        // than one module graph, the same index denotes an unrelated chunk group in each, so
        // hashing the bitmap made two different availabilities claim one output path.
        let one = FxIndexSet::from_iter([
            ChunkGroupKey::Entry(vec![]),
            ChunkGroupKey::SharedMultiple(vec![]),
        ]);
        let other = FxIndexSet::from_iter([
            ChunkGroupKey::SharedMultiple(vec![]),
            ChunkGroupKey::Entry(vec![]),
        ]);

        // Both are the bitmap {0}, but they mean different chunk groups.
        assert_ne!(
            hash_of(&one, &[0]).await,
            hash_of(&other, &[0]).await,
            "different chunk groups must not share a hash just because they share an index"
        );
    }

    #[tokio::test]
    async fn hash_distinguishes_different_chunk_groups() {
        let keys = FxIndexSet::from_iter([
            ChunkGroupKey::Entry(vec![]),
            ChunkGroupKey::SharedMultiple(vec![]),
            isolated_merged(0, "x"),
            isolated_merged(0, "y"),
        ]);

        // Different variants, different merge tags and different set sizes must all stay apart.
        assert_ne!(hash_of(&keys, &[0]).await, hash_of(&keys, &[1]).await);
        assert_ne!(hash_of(&keys, &[2]).await, hash_of(&keys, &[3]).await);
        assert_ne!(hash_of(&keys, &[0]).await, hash_of(&keys, &[0, 1]).await);
    }

    #[tokio::test]
    async fn hash_never_contains_a_chunk_group_index() {
        // A merged group identifies its parent by index. Two graphs that agree on the groups but
        // not on their order must still render the parent identically.
        let one = FxIndexSet::from_iter([ChunkGroupKey::Entry(vec![]), isolated_merged(0, "x")]);
        let other = FxIndexSet::from_iter([
            ChunkGroupKey::SharedMultiple(vec![]),
            ChunkGroupKey::Entry(vec![]),
            isolated_merged(1, "x"),
        ]);

        assert_eq!(hash_of(&one, &[1]).await, hash_of(&other, &[2]).await);
    }
}
