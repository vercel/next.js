use anyhow::Result;
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbo_tasks_fs::rope::RopeBuilder;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkItem, ChunkType, ChunkingContext, ModuleChunkItemIdExt},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
};

use super::asset::EcmascriptModulePartAsset;
use crate::{
    EcmascriptAnalyzableExt,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType,
    },
    references::async_module::AsyncModuleOptions,
    runtime_functions::{TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_IMPORT},
    tree_shake::side_effect_module::SideEffectsModule,
    utils::StringifyModuleId,
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

#[turbo_tasks::value(shared)]
pub(super) struct SideEffectsModuleChunkItem {
    pub module: ResolvedVc<SideEffectsModule>,
    pub module_graph: ResolvedVc<ModuleGraph>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for SideEffectsModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<Box<dyn ChunkType>> {
        Vc::upcast(EcmascriptChunkType::value_default())
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for SideEffectsModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let mut code = RopeBuilder::default();
        let mut has_top_level_await = false;

        let module = self.module.await?;

        for &side_effect in self.module.await?.side_effects.iter() {
            let need_await = 'need_await: {
                let async_module = *side_effect.get_async_module().await?;
                if let Some(async_module) = async_module
                    && async_module.await?.has_top_level_await
                {
                    break 'need_await true;
                }
                false
            };

            if !has_top_level_await && need_await {
                has_top_level_await = true;
            }

            code.push_bytes(
                format!(
                    "{}{TURBOPACK_IMPORT}({});\n",
                    if need_await { "await " } else { "" },
                    StringifyModuleId(&*side_effect.chunk_item_id(*self.chunking_context).await?)
                )
                .as_bytes(),
            );
        }

        code.push_bytes(
            format!(
                "{TURBOPACK_EXPORT_NAMESPACE}({TURBOPACK_IMPORT}({}));\n",
                StringifyModuleId(
                    &*module
                        .resolved_as
                        .chunk_item_id(*self.chunking_context)
                        .await?
                )
            )
            .as_bytes(),
        );

        let code = code.build();

        Ok(EcmascriptChunkItemContent {
            inner_code: code,
            source_map: None,
            rewrite_source_path: None,
            options: EcmascriptChunkItemOptions {
                strict: true,
                async_module: if has_top_level_await {
                    Some(AsyncModuleOptions {
                        has_top_level_await: true,
                    })
                } else {
                    None
                },
                ..Default::default()
            },
            additional_ids: Default::default(),
            placeholder_for_future_extensions: (),
        }
        .cell())
    }
}
