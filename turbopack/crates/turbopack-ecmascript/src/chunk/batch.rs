use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, Vc, trace::TraceRawVcs};
use turbopack_core::{
    chunk::{
        ChunkItemBatchGroup, ChunkItemBatchWithAsyncModuleInfo, ChunkItemOrBatchWithAsyncModuleInfo,
    },
    output::{OutputAssetsReference, OutputAssetsWithReferenced},
};

use crate::chunk::EcmascriptChunkItemWithAsyncInfo;

#[derive(
    Debug, Clone, Hash, PartialEq, Eq, TraceRawVcs, NonLocalValue, TaskInput, Encode, Decode,
)]
pub enum EcmascriptChunkItemOrBatchWithAsyncInfo {
    ChunkItem(EcmascriptChunkItemWithAsyncInfo),
    Batch(ResolvedVc<EcmascriptChunkBatchWithAsyncInfo>),
}

impl EcmascriptChunkItemOrBatchWithAsyncInfo {
    pub async fn from_chunk_item_or_batch(
        item: &ChunkItemOrBatchWithAsyncModuleInfo,
    ) -> Result<Self> {
        Ok(match item {
            ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item) => {
                EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(
                    EcmascriptChunkItemWithAsyncInfo::from_chunk_item(chunk_item)?,
                )
            }
            &ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
                EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(
                    EcmascriptChunkBatchWithAsyncInfo::from_batch(*batch)
                        .to_resolved()
                        .await?,
                )
            }
        })
    }

    pub fn references(&self) -> Vc<OutputAssetsWithReferenced> {
        match self {
            EcmascriptChunkItemOrBatchWithAsyncInfo::ChunkItem(item) => {
                item.chunk_item.references()
            }
            EcmascriptChunkItemOrBatchWithAsyncInfo::Batch(batch) => batch.references(),
        }
    }
}

#[turbo_tasks::value]
pub struct EcmascriptChunkBatchWithAsyncInfo {
    pub chunk_items: Vec<EcmascriptChunkItemWithAsyncInfo>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkBatchWithAsyncInfo {
    #[turbo_tasks::function]
    pub async fn from_batch(batch: Vc<ChunkItemBatchWithAsyncModuleInfo>) -> Result<Vc<Self>> {
        Ok(Self {
            chunk_items: batch
                .await?
                .chunk_items
                .iter()
                .map(EcmascriptChunkItemWithAsyncInfo::from_chunk_item)
                .collect::<Result<Vec<_>>>()?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn references(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let mut output_assets = Vec::new();
        let mut referenced_output_assets = Vec::new();
        let mut references = Vec::new();
        // We expect most references to be empty, and avoiding try_join to avoid allocating the Vec
        for item in &self.chunk_items {
            let r = item.chunk_item.references().await?;
            output_assets.extend(r.assets.await?);
            referenced_output_assets.extend(r.referenced_assets.await?);
            references.extend(r.references.await?);
        }
        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(output_assets),
            referenced_assets: ResolvedVc::cell(referenced_output_assets),
            references: ResolvedVc::cell(references),
        }
        .cell())
    }
}

#[turbo_tasks::value]
pub struct EcmascriptChunkItemBatchGroup {
    pub items: Vec<EcmascriptChunkItemOrBatchWithAsyncInfo>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemBatchGroup {
    #[turbo_tasks::function]
    pub async fn from_chunk_item_batch_group(
        batch_group: Vc<ChunkItemBatchGroup>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            items: batch_group
                .await?
                .items
                .iter()
                .map(EcmascriptChunkItemOrBatchWithAsyncInfo::from_chunk_item_or_batch)
                .try_join()
                .await?,
        }
        .cell())
    }
}
