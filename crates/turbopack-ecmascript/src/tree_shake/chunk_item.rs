use anyhow::Result;
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkItem, ChunkItemVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
};

use super::{asset::EcmascriptModulePartAssetVc, part_of_module, split_module};
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContentVc, EcmascriptChunkItemVc,
        EcmascriptChunkingContextVc,
    },
    gen_content,
};

/// This is an implementation of [ChunkItem] for [EcmascriptModulePartAssetVc].
///
/// This is a pointer to a part of an ES module.
#[turbo_tasks::value(shared)]
pub struct EcmascriptModulePartChunkItem {
    pub(super) module: EcmascriptModulePartAssetVc,
    pub(super) context: EcmascriptChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModulePartChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        let module = self.module.await?;
        let split_data = split_module(module.full_module);
        let parsed = part_of_module(split_data, module.part);

        Ok(gen_content(
            self.context,
            self.module.analyze(),
            parsed,
            module.full_module.ident(),
        ))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModulePartChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }

    #[turbo_tasks::function]
    async fn asset_ident(&self) -> Result<AssetIdentVc> {
        Ok(self.module.ident())
    }
}
