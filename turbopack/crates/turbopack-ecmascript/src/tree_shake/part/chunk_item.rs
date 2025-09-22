use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext},
    ident::AssetIdent,
    module::Module,
};

use crate::{
    EcmascriptAnalyzableExt,
    chunk::{EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkType},
    tree_shake::part::module::EcmascriptModulePartAsset,
};

/// This is an implementation of [ChunkItem] for
/// [Vc<EcmascriptModulePartAsset>].
///
/// This is a pointer to a part of an ES module.
#[turbo_tasks::value(shared)]
pub struct EcmascriptModulePartChunkItem {
    pub(super) module: ResolvedVc<EcmascriptModulePartAsset>,
    pub(super) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for EcmascriptModulePartChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should never be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        &self,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let analyze = self.module.analyze();
        let analyze_ref = analyze.await?;
        let async_module_options = analyze_ref.async_module.module_options(async_module_info);

        let content = self
            .module
            .module_content(*self.chunking_context, async_module_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            *self.chunking_context,
            async_module_options,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for EcmascriptModulePartChunkItem {
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
