use anyhow::Result;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkItemTy, ChunkItems},
    output::OutputAsset,
};

use super::item::EcmascriptChunkItem;

type EcmascriptChunkItemWithAsyncInfo = (
    ChunkItemTy,
    ResolvedVc<Box<dyn EcmascriptChunkItem>>,
    Option<ResolvedVc<AsyncModuleInfo>>,
);

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemWithAsyncInfo>,
    pub referenced_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContent {
    #[turbo_tasks::function]
    pub async fn included_chunk_items(&self) -> Result<Vc<ChunkItems>> {
        Ok(ChunkItems(
            self.chunk_items
                .iter()
                .filter_map(|(ty, item, _)| {
                    if matches!(ty, ChunkItemTy::Included) {
                        Some(item)
                    } else {
                        None
                    }
                })
                .map(|item| ResolvedVc::upcast::<Box<dyn ChunkItem>>(*item))
                .collect(),
        )
        .cell())
    }
}
