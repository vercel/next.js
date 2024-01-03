use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
};

use super::module::EcmascriptModuleLocalsModule;
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptChunkingContext,
    },
    EcmascriptModuleContent,
};

/// The chunk item for [EcmascriptModuleLocalsModule].
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleLocalsChunkItem {
    pub(super) module: Vc<EcmascriptModuleLocalsModule>,
    pub(super) chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModuleLocalsChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should never be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let module = self.module.await?;
        let chunking_context = self.chunking_context;
        let exports = self.module.get_exports();
        let original_module = module.module;
        let async_module_options = original_module
            .get_async_module()
            .module_options(async_module_info);
        let parsed = original_module.parse().resolve().await?;

        let analyze_result = original_module.analyze().await?.clone_value();

        let module_type_result = *original_module.determine_module_type().await?;

        let content = EcmascriptModuleContent::new(
            parsed,
            self.module.ident(),
            module_type_result.module_type,
            chunking_context,
            analyze_result.local_references,
            analyze_result.code_generation,
            analyze_result.source_map,
            exports,
            async_module_info,
        );
        Ok(EcmascriptChunkItemContent::new(
            content,
            self.chunking_context,
            async_module_options,
        ))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModuleLocalsChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn asset_ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self.module.ident())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
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
}
