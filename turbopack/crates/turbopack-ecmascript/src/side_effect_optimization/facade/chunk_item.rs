use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
};

use super::module::EcmascriptModuleFacadeModule;
use crate::{
    EcmascriptAnalyzable, EcmascriptOptions,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType,
    },
};

/// The chunk item for [EcmascriptModuleFacadeModule].
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleFacadeChunkItem {
    pub(crate) module: ResolvedVc<EcmascriptModuleFacadeModule>,
    pub(crate) module_graph: ResolvedVc<ModuleGraph>,
    pub(crate) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModuleFacadeChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should never be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let chunking_context = self.chunking_context;
        let module_graph = self.module_graph;

        let content =
            self.module
                .module_content(*module_graph, *chunking_context, async_module_info);

        let async_module_options = self
            .module
            .get_async_module()
            .module_options(async_module_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            *chunking_context,
            EcmascriptOptions::default().cell(),
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
}
