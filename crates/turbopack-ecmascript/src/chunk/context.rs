use anyhow::Result;
use turbo_tasks::{Value, ValueToString};
use turbopack_core::chunk::{
    availability_info::AvailabilityInfo, ChunkItem, ChunkableAssetVc, ChunkingContext,
    ChunkingContextVc, ModuleId, ModuleIdVc,
};

use super::item::EcmascriptChunkItemVc;

/// [`EcmascriptChunkingContext`] must be implemented by [`ChunkingContext`]
/// implementors that want to operate on [`EcmascriptChunk`]s.
#[turbo_tasks::value_trait]
pub trait EcmascriptChunkingContext: ChunkingContext {
    /// Returns the loader item that is used to load the given manifest asset.
    fn manifest_loader_item(
        &self,
        asset: ChunkableAssetVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> EcmascriptChunkItemVc;

    async fn chunk_item_id(&self, chunk_item: EcmascriptChunkItemVc) -> Result<ModuleIdVc> {
        let layer = self.layer();
        let mut ident = chunk_item.asset_ident();
        if !layer.await?.is_empty() {
            ident = ident.with_modifier(layer)
        }
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }
}
