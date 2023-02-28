use std::fmt::Write;

use anyhow::Result;
use turbo_tasks::ValueToString;
use turbopack_core::chunk::{ChunkingContext, ChunkingContextVc, ModuleId, ModuleIdVc};

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
        let layer = &*self.await?.context.layer().await?;
        let mut s = chunk_item.to_string().await?.clone_value();
        if !layer.is_empty() {
            if s.ends_with(')') {
                s.pop();
                write!(s, ", {layer})")?;
            } else {
                write!(s, " ({layer})")?;
            }
        }
        Ok(ModuleId::String(s).cell())
    }
}
