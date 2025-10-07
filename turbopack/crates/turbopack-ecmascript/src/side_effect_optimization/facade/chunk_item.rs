use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
};

use super::module::EcmascriptModuleFacadeModule;
use crate::{
    EcmascriptAnalyzableExt,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType,
    },
};

/// The chunk item for [EcmascriptModuleFacadeModule].
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleFacadeChunkItem {
    pub(crate) module: ResolvedVc<EcmascriptModuleFacadeModule>,
    pub(crate) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModuleFacadeChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should never be called");
    }

    #[turbo_tasks::function]
    fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunking_context = self.chunking_context;

        let content = self
            .module
            .module_content(*chunking_context, async_module_info);

        let async_module_options = self
            .module
            .get_async_module()
            .module_options(async_module_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            *chunking_context,
            async_module_options,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModuleFacadeChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
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
}
