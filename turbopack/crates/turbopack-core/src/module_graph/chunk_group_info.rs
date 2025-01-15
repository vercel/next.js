use std::{
    collections::{hash_map::Entry, HashMap},
    hash::{DefaultHasher, Hash, Hasher},
    ops::{Deref, DerefMut},
};

use anyhow::Result;
use roaring::RoaringBitmap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use turbo_tasks::{debug::ValueDebugFormat, trace::TraceRawVcs, NonLocalValue, ResolvedVc, Vc};

use crate::{
    chunk::ChunkingType,
    module::Module,
    module_graph::{GraphTraversalAction, ModuleGraph},
};

#[derive(Clone, Debug, PartialEq, TraceRawVcs, ValueDebugFormat)]
struct RoaringBitmapWrapper(#[turbo_tasks(trace_ignore)] pub RoaringBitmap);
unsafe impl NonLocalValue for RoaringBitmapWrapper {}

// RoaringBitmap doesn't impl Eq, not sure why: https://github.com/RoaringBitmap/roaring-rs/issues/302
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

impl Serialize for RoaringBitmapWrapper {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::Error;
        let mut bytes = vec![];
        self.0.serialize_into(&mut bytes).map_err(Error::custom)?;
        serializer.serialize_bytes(bytes.as_slice())
    }
}

impl<'de> Deserialize<'de> for RoaringBitmapWrapper {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        use serde::de::Error;
        let bytes = <&[u8]>::deserialize(deserializer)?;
        let map = RoaringBitmap::deserialize_unchecked_from(bytes).map_err(Error::custom)?;
        Ok(RoaringBitmapWrapper(map))
    }
}

#[turbo_tasks::value(transparent)]
pub struct ChunkGroupInfo(HashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper>);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ChunkGroup {
    /// e.g. a page
    Entry(ResolvedVc<Box<dyn Module>>),
    /// a module that has an incoming async edge
    Async(ResolvedVc<Box<dyn Module>>),
    /// a module with a incoming non-merged isolated edge
    Isolated(ResolvedVc<Box<dyn Module>>),
    /// a module with a incoming merging isolated edge
    IsolatedMerged(ChunkGroupHash, /* hash(merge_tag): */ usize),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ChunkGroupHash(u64);

impl ChunkGroup {
    fn hashed(&self) -> ChunkGroupHash {
        let mut hasher = DefaultHasher::new();
        self.hash(&mut hasher);
        ChunkGroupHash(hasher.finish())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct ChunkGroupId(u32);

pub async fn compute_chunk_group_info(graph: &ModuleGraph) -> Result<Vc<ChunkGroupInfo>> {
    let mut next_chunk_group_id = 0u32;
    let mut chunk_groups_to_id: HashMap<ChunkGroup, ChunkGroupId> = HashMap::new();
    let mut chunk_groups_from_id: HashMap<ChunkGroupId, ChunkGroup> = HashMap::new();

    let mut module_chunk_groups: HashMap<ResolvedVc<Box<dyn Module>>, RoaringBitmapWrapper> =
        HashMap::new();

    let mut module_depth: HashMap<ResolvedVc<Box<dyn Module>>, usize> = HashMap::new();

    let entries = &graph.graphs.last().unwrap().await?.entries;

    graph.traverse_edges_from_entries_topological(
        entries,
        &mut (),
        |parent, node, _| {
            if let Some((parent, _)) = parent {
                let parent_depth = *module_depth.get(&parent.module).unwrap();
                let entry = module_depth.entry(node.module);
                match entry {
                    Entry::Occupied(mut e) => {
                        if (parent_depth + 1) < *e.get() {
                            e.insert(parent_depth + 1);
                        }
                    }
                    Entry::Vacant(e) => {
                        e.insert(parent_depth + 1);
                    }
                };
            } else {
                module_depth.insert(node.module, 0);
            };

            let chunk_group = if let Some((parent, chunking_type)) = parent {
                match chunking_type {
                    ChunkingType::Parallel | ChunkingType::ParallelInheritAsync => None,
                    ChunkingType::Async => Some(ChunkGroup::Async(node.module)),
                    ChunkingType::Isolated {
                        merge_tag: None, ..
                    } => Some(ChunkGroup::Isolated(node.module)),
                    // ChunkingType::Isolated {
                    //     merge_tag: Some(merge_tag),
                    //     ..
                    // } => {
                    //     let parent_chunk_groups = module_chunk_groups
                    //         .get(&parent.module)
                    //         .unwrap()
                    //         .iter()
                    //         .map(|id| {
                    //             chunk_groups_from_id
                    //                 .get(&ChunkGroupId(id))
                    //                 .unwrap()
                    //                 .hashed()
                    //         });

                    //     Some(ChunkGroup::IsolatedMerged(parent_hash, merge_tag.clone()))
                    // }
                    ChunkingType::Passthrough => None,
                    ChunkingType::Traced => unreachable!(),
                    _ => None,
                }
            } else {
                // entry
                Some(ChunkGroup::Entry(node.module))
            };

            if let Some(chunk_group) = chunk_group {
                let chunk_group_id = ChunkGroupId(next_chunk_group_id);
                next_chunk_group_id += 1;
                chunk_groups_to_id.insert(chunk_group.clone(), chunk_group_id);
                chunk_groups_from_id.insert(chunk_group_id, chunk_group.clone());

                // assign chunk group to the target node (the entry of the chunk group)
                module_chunk_groups.insert(
                    node.module.clone(),
                    RoaringBitmapWrapper(
                        RoaringBitmap::from_sorted_iter(std::iter::once(chunk_group_id.0)).unwrap(),
                    ),
                );
            }

            GraphTraversalAction::Continue
        },
        |parent, node, _| {},
    );

    Ok(Vc::cell(module_chunk_groups))
}

// #[turbo_tasks::function]
// pub fn chunking_graph(&self) -> Vc<ChunkGroupInfo> {
//     ChunkGroupInfo
// }
