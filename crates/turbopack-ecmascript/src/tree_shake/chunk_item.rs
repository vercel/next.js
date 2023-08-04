use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    chunk::{availability_info::AvailabilityInfo, ChunkItem},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
};

use super::{asset::EcmascriptModulePartAsset, part_of_module, split_module};
use crate::{
    chunk::{
        placeable::EcmascriptChunkPlaceable, EcmascriptChunkItem, EcmascriptChunkItemContent,
        EcmascriptChunkingContext,
    },
    EcmascriptModuleContent,
};

/// This is an implementation of [ChunkItem] for
/// [Vc<EcmascriptModulePartAsset>].
///
/// This is a pointer to a part of an ES module.
#[turbo_tasks::value(shared)]
pub struct EcmascriptModulePartChunkItem {
    pub(super) module: Vc<EcmascriptModulePartAsset>,
    pub(super) chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModulePartChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        self.content_with_availability_info(Value::new(AvailabilityInfo::Untracked))
    }

    #[turbo_tasks::function]
    async fn content_with_availability_info(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let availability_info = if *this.module.analyze().needs_availability_info().await? {
            availability_info
        } else {
            Value::new(AvailabilityInfo::Untracked)
        };

        let module = this.module.await?;
        let split_data = split_module(module.full_module);
        let parsed = part_of_module(split_data, module.part);

        let content = EcmascriptModuleContent::new(
            parsed,
            module.full_module.ident(),
            this.chunking_context,
            this.module.analyze(),
            availability_info,
        );

        let async_module_options = module
            .full_module
            .get_async_module()
            .module_options(availability_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            this.chunking_context,
            async_module_options,
        ))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModulePartChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    async fn asset_ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self.module.ident())
    }
}
