use anyhow::Result;
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbo_tasks_fs::rope::RopeBuilder;
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext,
    },
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
};

use super::{asset::EcmascriptModulePartAsset, part_of_module, split_module};
use crate::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType,
    },
    references::async_module::AsyncModuleOptions,
    runtime_functions::{TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_IMPORT},
    tree_shake::side_effect_module::SideEffectsModule,
    utils::StringifyModuleId,
    EcmascriptModuleContent,
};

/// This is an implementation of [ChunkItem] for
/// [Vc<EcmascriptModulePartAsset>].
///
/// This is a pointer to a part of an ES module.
#[turbo_tasks::value(shared)]
pub struct EcmascriptModulePartChunkItem {
    pub(super) module: ResolvedVc<EcmascriptModulePartAsset>,
    pub(super) module_graph: ResolvedVc<ModuleGraph>,
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
        let module = self.module.await?;

        let split_data = split_module(*module.full_module);
        let parsed = part_of_module(split_data, module.part.clone());

        let analyze = self.module.analyze().await?;
        let async_module_options = analyze.async_module.module_options(async_module_info);

        let module_type_result = *module.full_module.determine_module_type().await?;
        let generate_source_map = self
            .chunking_context
            .reference_module_source_maps(*ResolvedVc::upcast(self.module));

        let content = EcmascriptModuleContent::new(
            parsed,
            self.module.ident(),
            module_type_result.module_type,
            *self.module_graph,
            *self.chunking_context,
            *analyze.references,
            *analyze.code_generation,
            *analyze.async_module,
            generate_source_map,
            *analyze.source_map,
            *analyze.exports,
            async_module_info,
        );

        Ok(EcmascriptChunkItemContent::new(
            content,
            *self.chunking_context,
            *module.full_module.await?.options,
            async_module_options,
        ))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
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
                if let Some(async_module) = async_module {
                    if async_module.await?.has_top_level_await {
                        break 'need_await true;
                    }
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
                    StringifyModuleId(
                        &*side_effect
                            .as_chunk_item(*self.module_graph, *self.chunking_context)
                            .id()
                            .await?
                    )
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
                        .as_chunk_item(*self.module_graph, *self.chunking_context)
                        .id()
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
                exports: true,
                async_module: if has_top_level_await {
                    Some(AsyncModuleOptions {
                        has_top_level_await: true,
                    })
                } else {
                    None
                },
                ..Default::default()
            },
            placeholder_for_future_extensions: (),
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}
