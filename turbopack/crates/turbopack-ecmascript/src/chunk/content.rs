use turbo_tasks::ResolvedVc;
use turbopack_core::{chunk::AsyncModuleInfo, output::OutputAsset};

use super::item::EcmascriptChunkItem;

type EcmascriptChunkItemWithAsyncInfo = (
    ResolvedVc<Box<dyn EcmascriptChunkItem>>,
    Option<ResolvedVc<AsyncModuleInfo>>,
);

#[turbo_tasks::value(shared)]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemWithAsyncInfo>,
    pub referenced_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>,
}
