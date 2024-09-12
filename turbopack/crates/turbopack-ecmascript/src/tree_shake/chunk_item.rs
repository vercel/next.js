use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
};

use super::{asset::EcmascriptModulePartAsset, part_of_module, split_module};
use crate::{
    chunk::{EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType},
    EcmascriptModuleContent,
};

/// This is an implementation of [ChunkItem] for
/// [Vc<EcmascriptModulePartAsset>].
///
/// This is a pointer to a part of an ES module.
#[turbo_tasks::value(shared)]
pub struct EcmascriptModulePartChunkItem {
    pub(super) module: Vc<EcmascriptModulePartAsset>,
    pub(super) chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModulePartChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should never be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let module = this.module.await?;

        let split_data = split_module(module.full_module);
        let parsed = part_of_module(split_data, module.part);

        let analyze = this.module.analyze().await?;
        let async_module_options = analyze.async_module.module_options(async_module_info);

        let module_type_result = *module.full_module.determine_module_type().await?;

        let content = EcmascriptModuleContent::new(
            parsed,
            module.full_module.ident(),
            module_type_result.module_type,
            this.chunking_context,
            analyze.references,
            analyze.code_generation,
            analyze.async_module,
            analyze.source_map,
            analyze.exports,
            async_module_info,
        );

        Ok(EcmascriptChunkItemContent::new(
            content,
            this.chunking_context,
            module.full_module.await?.options,
            async_module_options,
        ))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
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
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }

    #[turbo_tasks::function]
    fn is_self_async(&self) -> Vc<bool> {
        self.module.is_async_module()
    }
}
