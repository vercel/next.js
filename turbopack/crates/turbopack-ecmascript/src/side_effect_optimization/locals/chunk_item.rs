use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
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
        EcmascriptChunkType,
    },
    EcmascriptModuleContent,
};

/// The chunk item for [EcmascriptModuleLocalsModule].
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleLocalsChunkItem {
    pub(super) module: ResolvedVc<EcmascriptModuleLocalsModule>,
    pub(super) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
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
        let parsed = original_module.parse().resolve().await?;

        let analyze_result = original_module.analyze().await?;
        let async_module_options = analyze_result
            .async_module
            .module_options(async_module_info);

        let module_type_result = *original_module.determine_module_type().await?;

        let content = EcmascriptModuleContent::new(
            parsed,
            self.module.ident(),
            module_type_result.module_type,
            *chunking_context,
            *analyze_result.local_references,
            *analyze_result.code_generation,
            *analyze_result.async_module,
            *analyze_result.source_map,
            exports,
            async_module_info,
        );

        Ok(EcmascriptChunkItemContent::new(
            content,
            *chunking_context,
            *original_module.await?.options,
            async_module_options,
        ))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModuleLocalsChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }

    #[turbo_tasks::function]
    async fn is_self_async(&self) -> Result<Vc<bool>> {
        let module = self.module.await?;
        let analyze = module.module.analyze().await?;
        if let Some(async_module) = *analyze.async_module.await? {
            let is_self_async = async_module.is_self_async(*analyze.local_references);
            Ok(is_self_async)
        } else {
            Ok(Vc::cell(false))
        }
    }
}
