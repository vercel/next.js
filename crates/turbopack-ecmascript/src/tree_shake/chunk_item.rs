use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    chunk::{availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
};

use super::{asset::EcmascriptModulePartAsset, part_of_module, split_module};
use crate::{
    chunk::{
        placeable::EcmascriptChunkPlaceable, EcmascriptChunk, EcmascriptChunkItem,
        EcmascriptChunkItemContent, EcmascriptChunkingContext,
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
        let module = this.module.await?;
        let async_module_options = module
            .full_module
            .get_async_module()
            .module_options(availability_info.current_availability_root());
        let is_async_module = async_module_options.await?.is_some();

        let availability_info_needs = *this
            .module
            .analyze()
            .get_availability_info_needs(is_async_module)
            .await?;
        let availability_info = availability_info.reduce_to_needs(availability_info_needs);

        let split_data = split_module(module.full_module);
        let parsed = part_of_module(split_data, module.part);

        let content = EcmascriptModuleContent::new(
            parsed,
            module.full_module.ident(),
            this.chunking_context,
            this.module.analyze(),
            Value::new(availability_info),
        );

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

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    fn as_chunk(&self, availability_info: Value<AvailabilityInfo>) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            Vc::upcast(self.chunking_context),
            Vc::upcast(self.module),
            availability_info,
        ))
    }
}
