use anyhow::Result;
use serde::{Deserialize, Serialize};
use smallvec::{smallvec, SmallVec};
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt,
    Vc,
};

use crate::{
    chunk::{ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType, ChunkableModule, ChunkingContext},
    module_graph::{
        async_module_info::AsyncModulesInfo,
        chunk_group_info::RoaringBitmapWrapper,
        module_batch::{ChunkableModuleOrBatch, ModuleBatch},
        ModuleGraph,
    },
};

async fn attach_async_info_to_chunkable_module(
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
            ChunkableModuleOrBatch::None => None,
        })
    }
}

#[turbo_tasks::value]
pub struct ChunkItemBatchWithAsyncModuleInfo {
    pub chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
    pub chunk_groups: Option<RoaringBitmapWrapper>,
}

#[turbo_tasks::value_impl]
impl ChunkItemBatchWithAsyncModuleInfo {
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
                map.insert(
                    chunk_type,
                    this.chunk_items[..i].iter().cloned().collect::<Vec<_>>(),
                );
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

#[turbo_tasks::value(transparent)]
pub struct ChunkItemBatchWithAsyncModuleInfoByChunkType(
    SmallVec<
        [(
            ResolvedVc<Box<dyn ChunkType>>,
            ChunkItemOrBatchWithAsyncModuleInfo,
        ); 1],
    >,
);
