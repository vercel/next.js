use std::{future::Future, hash::Hash, ops::Deref};

use anyhow::Result;
use bincode::{Decode, Encode};
use either::Either;
use rustc_hash::FxHashMap;
use smallvec::{SmallVec, smallvec};
use turbo_bitset::Bitset;
use turbo_tasks::{FxIndexMap, ReadRef, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};

use crate::{
    chunk::{ChunkItemWithAsyncModuleInfo, ChunkType, ChunkableModule, ChunkingContext},
    module_graph::{
        ModuleGraph,
        async_module_info::AsyncModulesInfo,
        module_batch::{ChunkableModuleBatchGroup, ChunkableModuleOrBatch, ModuleBatch},
    },
};

/// Converts a [`ChunkableModule`] into a [`ChunkItemWithAsyncModuleInfo`] by resolving its chunk
/// item and, if the module is async, looking up its referenced async modules from the graph.
///
/// Uses keyed access on `async_module_info` so only the queried module's entry is read,
/// enabling per-key invalidation via `cell = "keyed"` on [`AsyncModulesInfo`].
pub async fn attach_async_info_to_chunkable_module(
    module: ResolvedVc<Box<dyn ChunkableModule>>,
    async_module_info: Vc<AsyncModulesInfo>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<ChunkItemWithAsyncModuleInfo> {
    let general_module = ResolvedVc::upcast(module);
    let async_info = if async_module_info.is_async(general_module).await? {
        Some(
            module_graph
                .referenced_async_modules(*general_module)
                .to_resolved()
                .await?,
        )
    } else {
        None
    };
    let chunk_item = module
        .as_chunk_item(module_graph, chunking_context)
        .to_resolved()
        .await?;
    let chunk_type = chunk_item
        .into_trait_ref()
        .await?
        .ty()
        .to_resolved()
        .await?;
    Ok(ChunkItemWithAsyncModuleInfo {
        chunk_item,
        chunk_type,
        module: Some(ResolvedVc::upcast(module)),
        async_info,
    })
}

#[turbo_tasks::task_input]
#[derive(Debug, Clone, PartialEq, Eq, Hash, Encode, Decode)]
pub enum ChunkItemOrBatchWithAsyncModuleInfo {
    ChunkItem(ChunkItemWithAsyncModuleInfo),
    Batch(ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>),
}

type ChunkItemOrBatchWithAsyncModuleInfoByChunkType = Either<
    ChunkItemBatchWithAsyncModuleInfoByChunkTypeData,
    ReadRef<ChunkItemBatchWithAsyncModuleInfoByChunkType>,
>;

#[turbo_tasks::value(transparent)]
pub struct ChunkItemOrBatchWithAsyncModuleInfos(Vec<ChunkItemOrBatchWithAsyncModuleInfo>);

impl ChunkItemOrBatchWithAsyncModuleInfo {
    pub async fn from_chunkable_module_or_batch(
        chunkable_module_or_batch: ChunkableModuleOrBatch,
        async_module_info: Vc<AsyncModulesInfo>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Option<Self>> {
        Ok(match chunkable_module_or_batch {
            ChunkableModuleOrBatch::Module(module) => Some(Self::ChunkItem(
                attach_async_info_to_chunkable_module(
                    module,
                    async_module_info,
                    module_graph,
                    chunking_context,
                )
                .await?,
            )),
            ChunkableModuleOrBatch::Batch(batch) => Some(Self::Batch(
                ChunkItemBatchWithAsyncModuleInfo::from_module_batch(
                    *batch,
                    module_graph,
                    chunking_context,
                )
                .to_resolved()
                .await?,
            )),
            ChunkableModuleOrBatch::None(_) => None,
        })
    }

    /// See [`ChunkItemBatchWithAsyncModuleInfo::without_chunk_groups`].
    pub async fn without_chunk_groups(&self) -> Result<Self> {
        Ok(match self {
            Self::ChunkItem(item) => Self::ChunkItem(*item),
            Self::Batch(batch) => Self::Batch(batch.without_chunk_groups().to_resolved().await?),
        })
    }

    pub async fn split_by_chunk_type(
        &self,
    ) -> Result<ChunkItemOrBatchWithAsyncModuleInfoByChunkType> {
        Ok(match self {
            Self::ChunkItem(item) => {
                Either::Left(smallvec![(item.chunk_type, Self::ChunkItem(*item))])
            }
            Self::Batch(batch) => Either::Right(batch.split_by_chunk_type().await?),
        })
    }
}

#[turbo_tasks::value]
#[derive(Debug, Clone, Hash)]
pub struct ChunkItemBatchWithAsyncModuleInfo {
    pub chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
    pub chunk_groups: Option<Bitset>,
}

#[turbo_tasks::value_impl]
impl ChunkItemBatchWithAsyncModuleInfo {
    #[turbo_tasks::function]
    pub fn new(chunk_items: Vec<ChunkItemWithAsyncModuleInfo>) -> Vc<Self> {
        Self {
            chunk_items,
            chunk_groups: None,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn from_module_batch(
        batch: Vc<ModuleBatch>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Self>> {
        let async_module_info = module_graph.async_module_info();
        let batch = batch.await?;
        let chunk_items = batch
            .modules
            .iter()
            .map(|module| {
                attach_async_info_to_chunkable_module(
                    *module,
                    async_module_info,
                    module_graph,
                    chunking_context,
                )
            })
            .try_join()
            .await?;
        Ok(Self {
            chunk_items,
            chunk_groups: batch.chunk_groups.clone(),
        }
        .cell())
    }

    /// The same batch without its chunk groups, i.e. identified only by its chunk items.
    ///
    /// The chunk groups are only needed to decide how batches are chunked. A chunk refers to its
    /// batches through this, so that a batch whose chunk groups change (e.g. because a module of
    /// it is imported from one more page) doesn't change the identity of every chunk that
    /// contains it.
    #[turbo_tasks::function]
    pub async fn without_chunk_groups(self: Vc<Self>) -> Result<Vc<Self>> {
        let this = self.await?;
        if this.chunk_groups.is_none() {
            return Ok(self);
        }
        Ok(Self::new(this.chunk_items.clone()))
    }

    #[turbo_tasks::function]
    pub async fn split_by_chunk_type(
        self: Vc<Self>,
    ) -> Result<Vc<ChunkItemBatchWithAsyncModuleInfoByChunkType>> {
        let this = self.await?;
        let mut iter = this.chunk_items.iter().enumerate();
        let Some((_, first)) = iter.next() else {
            return Ok(Vc::cell(SmallVec::new()));
        };
        let chunk_type = first.chunk_type;
        for (i, item) in iter.by_ref() {
            let ty = item.chunk_type;
            if ty != chunk_type {
                let mut map = FxIndexMap::default();
                map.insert(chunk_type, this.chunk_items[..i].to_vec());
                map.insert(ty, vec![*item]);
                for (_, item) in iter {
                    map.entry(item.chunk_type).or_default().push(*item);
                }
                return Ok(Vc::cell(
                    map.into_iter()
                        .map(|(ty, chunk_items)| {
                            let item = if chunk_items.len() == 1 {
                                ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(
                                    chunk_items.into_iter().next().unwrap(),
                                )
                            } else {
                                ChunkItemOrBatchWithAsyncModuleInfo::Batch(
                                    Self {
                                        chunk_items,
                                        chunk_groups: this.chunk_groups.clone(),
                                    }
                                    .resolved_cell(),
                                )
                            };
                            (ty, item)
                        })
                        .collect(),
                ));
            }
        }
        Ok(Vc::cell(smallvec![(
            chunk_type,
            ChunkItemOrBatchWithAsyncModuleInfo::Batch(self.to_resolved().await?)
        )]))
    }
}

type ChunkItemBatchWithAsyncModuleInfoByChunkTypeData = SmallVec<
    [(
        ResolvedVc<Box<dyn ChunkType>>,
        ChunkItemOrBatchWithAsyncModuleInfo,
    ); 1],
>;

#[turbo_tasks::value(transparent)]
pub struct ChunkItemBatchWithAsyncModuleInfoByChunkType(
    ChunkItemBatchWithAsyncModuleInfoByChunkTypeData,
);

type ChunkItemBatchGroupByChunkTypeT = SmallVec<
    [(
        ResolvedVc<Box<dyn ChunkType>>,
        ResolvedVc<ChunkItemBatchGroup>,
    ); 1],
>;

#[turbo_tasks::value(transparent)]
pub struct ChunkItemBatchGroupByChunkType(ChunkItemBatchGroupByChunkTypeT);

#[turbo_tasks::value(transparent)]
pub struct ChunkItemBatchGroups(Vec<ResolvedVc<ChunkItemBatchGroup>>);

#[turbo_tasks::value]
pub struct ChunkItemBatchGroup {
    pub items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
    pub chunk_groups: Bitset,
}

#[turbo_tasks::value_impl]
impl ChunkItemBatchGroup {
    /// A batch group with the given items and no chunk groups.
    #[turbo_tasks::function]
    fn from_items(items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>) -> Vc<Self> {
        Self {
            items,
            chunk_groups: Bitset::new(),
        }
        .cell()
    }

    /// The same batch group without chunk groups, also for its batches, i.e. identified only by
    /// its chunk items. See [`ChunkItemBatchWithAsyncModuleInfo::without_chunk_groups`].
    #[turbo_tasks::function]
    pub async fn without_chunk_groups(&self) -> Result<Vc<Self>> {
        let items = self
            .items
            .iter()
            .map(ChunkItemOrBatchWithAsyncModuleInfo::without_chunk_groups)
            .try_join()
            .await?;
        Ok(Self::from_items(items))
    }

    #[turbo_tasks::function]
    pub async fn from_module_batch_group(
        batch_group: Vc<ChunkableModuleBatchGroup>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Self>> {
        let async_module_info = module_graph.async_module_info();
        let batch_group = batch_group.await?;
        let items = batch_group
            .items
            .iter()
            .map(|&batch| {
                ChunkItemOrBatchWithAsyncModuleInfo::from_chunkable_module_or_batch(
                    batch,
                    async_module_info,
                    module_graph,
                    chunking_context,
                )
            })
            .try_flat_join()
            .await?;
        Ok(Self {
            items,
            chunk_groups: batch_group.chunk_groups.clone(),
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn split_by_chunk_type(self: Vc<Self>) -> Result<Vc<ChunkItemBatchGroupByChunkType>> {
        let this = self.await?;
        // TODO it could avoid the FxIndexMap with some iterator magic...
        let mut map: FxIndexMap<_, Vec<_>> = FxIndexMap::default();
        for item in &this.items {
            let split = item.split_by_chunk_type().await?;
            for (ty, value) in split.iter() {
                map.entry(*ty).or_default().push(value.clone());
            }
        }
        let result = if map.len() == 1 {
            let (ty, _) = map.into_iter().next().unwrap();
            smallvec![(ty, self.to_resolved().await?)]
        } else {
            map.into_iter()
                .map(|(ty, items)| {
                    (
                        ty,
                        ChunkItemBatchGroup {
                            items,
                            chunk_groups: this.chunk_groups.clone(),
                        }
                        .resolved_cell(),
                    )
                })
                .collect()
        };
        Ok(Vc::cell(result))
    }
}

pub async fn batch_info<'a, BatchGroup, Item, Info, BatchGroupInfo, A, B>(
    batch_groups: &[ResolvedVc<BatchGroup>],
    items: &[Item],
    get_batch_group_info: impl Fn(Vc<BatchGroup>) -> A + Send + 'a,
    get_item_info: impl Fn(&Item) -> B + Send + 'a,
) -> Result<Vec<Info>>
where
    A: Future<Output = Result<BatchGroupInfo>> + Send + 'a,
    B: Future<Output = Result<Info>> + Send + 'a,
    BatchGroup: Send,
    Item: Send + Eq + Hash,
    BatchGroupInfo: Deref<Target = FxHashMap<Item, Info>> + Send,
    Info: Clone + Send,
{
    let batch_group_info: Vec<BatchGroupInfo> = batch_groups
        .iter()
        .map(|&batch_group| get_batch_group_info(*batch_group))
        .try_join()
        .await?;
    let batch_group_info = batch_group_info
        .iter()
        .flat_map(|info| info.iter())
        .collect::<FxHashMap<_, _>>();
    items
        .iter()
        .map(async |item| {
            Ok(if let Some(&info) = batch_group_info.get(item) {
                info.clone()
            } else {
                get_item_info(item).await?
            })
        })
        .try_join()
        .await
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use turbo_bitset::Bitset;
    use turbo_tasks::Vc;
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo, ChunkItemOrBatchWithAsyncModuleInfo,
    };

    /// Whether `without_chunk_groups` gives equal results for batches and batch groups that only
    /// differ in their chunk groups, and different results for different items.
    #[turbo_tasks::value(transparent)]
    struct Identities(Vec<bool>);

    #[turbo_tasks::function(operation, root)]
    async fn without_chunk_groups_identities() -> Result<Vc<Identities>> {
        // Batches without chunk items: creating chunk items needs a chunking context, and the
        // identity only depends on the items, whatever they are.
        let batch = |chunk_groups: Option<Bitset>| {
            ChunkItemBatchWithAsyncModuleInfo {
                chunk_items: Vec::new(),
                chunk_groups,
            }
            .resolved_cell()
        };
        let in_groups_1 = batch(Some(Bitset::from_iter([1])));
        let in_groups_2 = batch(Some(Bitset::from_iter([1, 2])));
        let normalized_1 = in_groups_1.without_chunk_groups().to_resolved().await?;
        let normalized_2 = in_groups_2.without_chunk_groups().to_resolved().await?;
        let normalized_again = normalized_1.without_chunk_groups().to_resolved().await?;

        let group = |items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>, chunk_groups: Bitset| {
            ChunkItemBatchGroup {
                items,
                chunk_groups,
            }
            .resolved_cell()
        };
        let group_1 = group(
            vec![ChunkItemOrBatchWithAsyncModuleInfo::Batch(in_groups_1)],
            Bitset::from_iter([1]),
        );
        let group_2 = group(
            vec![ChunkItemOrBatchWithAsyncModuleInfo::Batch(in_groups_2)],
            Bitset::from_iter([1, 2]),
        );
        let group_other = group(
            vec![
                ChunkItemOrBatchWithAsyncModuleInfo::Batch(in_groups_1),
                ChunkItemOrBatchWithAsyncModuleInfo::Batch(in_groups_2),
            ],
            Bitset::from_iter([1]),
        );
        let group_1 = group_1.without_chunk_groups().to_resolved().await?;
        let group_2 = group_2.without_chunk_groups().to_resolved().await?;
        let group_other = group_other.without_chunk_groups().to_resolved().await?;

        Ok(Vc::cell(vec![
            in_groups_1 != in_groups_2,
            normalized_1 == normalized_2,
            normalized_1 == normalized_again,
            normalized_1.await?.chunk_groups.is_none(),
            group_1 == group_2,
            group_1.await?.chunk_groups.is_zero(),
            group_1 != group_other,
        ]))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn without_chunk_groups_only_depends_on_the_items() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            let identities = without_chunk_groups_identities()
                .read_strongly_consistent()
                .await?;
            assert_eq!(*identities, vec![true; 7]);
            Ok(())
        })
        .await
        .unwrap();
    }
}
