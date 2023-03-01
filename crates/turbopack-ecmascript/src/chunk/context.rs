use anyhow::Result;
use turbo_tasks::ValueToString;
use turbopack_core::chunk::{ChunkItem, ChunkingContext, ChunkingContextVc, ModuleId, ModuleIdVc};

use super::item::EcmascriptChunkItemVc;

#[turbo_tasks::value]
pub(super) struct EcmascriptChunkContext {
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContextVc {
    #[turbo_tasks::function]
    pub fn of(context: ChunkingContextVc) -> EcmascriptChunkContextVc {
        EcmascriptChunkContextVc::cell(EcmascriptChunkContext { context })
    }

    #[turbo_tasks::function]
    pub async fn chunk_item_id(self, chunk_item: EcmascriptChunkItemVc) -> Result<ModuleIdVc> {
        let layer = self.await?.context.layer();
        let mut ident = chunk_item.asset_ident();
        if !layer.await?.is_empty() {
            ident = ident.with_modifier(layer)
        }
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }
}
