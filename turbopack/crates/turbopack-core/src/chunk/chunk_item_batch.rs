use std::{future::Future, hash::Hash, ops::Deref};

use anyhow::Result;
use either::Either;
use rustc_hash::FxHashMap;
use serde::{Deserialize, Serialize};
use smallvec::{SmallVec, smallvec};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryFlatJoinIterExt, TryJoinIterExt,
    Vc, trace::TraceRawVcs,
};

use crate::{
    chunk::{ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkableModule, ChunkingContext},
    module_graph::{
        ModuleGraph,
        async_module_info::AsyncModulesInfo,
        chunk_group_info::RoaringBitmapWrapper,
        module_batch::{ChunkableModuleBatchGroup, ChunkableModuleOrBatch, ModuleBatch},
    },
};

pub async fn attach_async_info_to_chunkable_module(
    module: ResolvedVc<Box<dyn ChunkableModule>>,
    async_module_info: &ReadRef<AsyncModulesInfo>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<ChunkItemWithAsyncModuleInfo> {
    let general_module = ResolvedVc::upcast(module);
    let async_info = if async_module_info.contains(&general_module) {
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
    Ok(ChunkItemWithAsyncModuleInfo {
        chunk_item,
        module: Some(module),
        async_info,
    })
}

#[derive(
    Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs, NonLocalValue, TaskInput,
)]
pub enum ChunkItemOrBatchWithAsyncModuleInfo {
    ChunkItem(ChunkItemWithAsyncModuleInfo),
    Batch(ResolvedVc<ChunkItemBatchWithAsyncModuleInfo>),
}

type ChunkItemOrBatchWithAsyncModuleInfoByChunkType = Either<
    ChunkItemBatchWithAsyncModuleInfoByChunkTypeData,
    ReadRef<ChunkItemBatchWithAsyncModuleInfoByChunkType>,
>;

impl ChunkItemOrBatchWithAsyncModuleInfo {
    pub async fn from_chunkable_module_or_batch(
        chunkable_module_or_batch: ChunkableModuleOrBatch,
        async_module_info: &ReadRef<AsyncModulesInfo>,
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

    pub async fn split_by_chunk_type(
        &self,
    ) -> Result<ChunkItemOrBatchWithAsyncModuleInfoByChunkType> {
        Ok(match self {
            Self::ChunkItem(item) => Either::Left(smallvec![(
                item.chunk_item.ty().to_resolved().await?,
                Self::ChunkItem(item.clone())
            )]),
            Self::Batch(batch) => Either::Right(batch.split_by_chunk_type().await?),
        })
    }
}

#[turbo_tasks::value]
#[derive(Debug, Clone, Hash, TaskInput)]
pub struct ChunkItemBatchWithAsyncModuleInfo {
    pub chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
    pub chunk_groups: Option<RoaringBitmapWrapper>,
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
        let async_module_info = module_graph.async_module_info().await?;
        let batch = batch.await?;
        let chunk_items = batch
            .modules
            .iter()
            .map(|module| {
                attach_async_info_to_chunkable_module(
                    *module,
                    &async_module_info,
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

    #[turbo_tasks::function]
    pub async fn split_by_chunk_type(
        self: Vc<Self>,
    ) -> Result<Vc<ChunkItemBatchWithAsyncModuleInfoByChunkType>> {
        let this = self.await?;
        let mut iter = this.chunk_items.iter().enumerate();
        let Some((_, first)) = iter.next() else {
            return Ok(Vc::cell(SmallVec::new()));
        };
        let chunk_type = first.chunk_item.ty().to_resolved().await?;
        while let Some((i, item)) = iter.next() {
            let ty = item.chunk_item.ty().to_resolved().await?;
            if ty != chunk_type {
                let mut map = FxIndexMap::default();
                map.insert(chunk_type, this.chunk_items[..i].to_vec());
                map.insert(ty, vec![item.clone()]);
                for (_, item) in iter {
                    map.entry(item.chunk_item.ty().to_resolved().await?)
                        .or_default()
                        .push(item.clone());
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

#[turbo_tasks::value]
pub struct ChunkItemBatchGroup {
    pub items: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
    pub chunk_groups: RoaringBitmapWrapper,
}

#[turbo_tasks::value_impl]
impl ChunkItemBatchGroup {
    #[turbo_tasks::function]
    pub async fn from_module_batch_group(
        batch_group: Vc<ChunkableModuleBatchGroup>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Self>> {
        let async_module_info = module_graph.async_module_info().await?;
        let batch_group = batch_group.await?;
        let items = batch_group
            .items
            .iter()
            .map(|&batch| {
                ChunkItemOrBatchWithAsyncModuleInfo::from_chunkable_module_or_batch(
                    batch,
                    &async_module_info,
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
                        },
                    )
                })
                .map(async |(ty, batch_group)| Ok((ty, batch_group.resolved_cell())))
                .try_join()
                .await?
                .into()
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
