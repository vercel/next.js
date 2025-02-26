use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    trace::TraceRawVcs, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt, Vc,
};

use crate::{
    chunk::{ChunkItemWithAsyncModuleInfo, ChunkableModule, ChunkingContext},
    module_graph::{
        async_module_info::AsyncModulesInfo,
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
    None,
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
        let chunk_items = batch
            .await?
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
        Ok(Self { chunk_items }.cell())
    }
}
