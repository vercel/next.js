use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::rope::RopeBuilder;
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, EvaluatableAsset, ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReferences, SingleChunkableModuleReference},
    resolve::{ExportUsage, ModulePart},
};

use crate::{
    EcmascriptModuleAsset,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, ecmascript_chunk_item, item::RewriteSourcePath,
    },
    references::async_module::AsyncModuleOptions,
    runtime_functions::{TURBOPACK_EXPORT_NAMESPACE, TURBOPACK_IMPORT},
    utils::StringifyModuleId,
};

#[turbo_tasks::value]
pub(super) struct SideEffectsModule {
    /// Original module
    pub module: ResolvedVc<EcmascriptModuleAsset>,
    /// The part of the original module that is the binding
    pub part: ModulePart,
    /// The module that is the binding
    pub resolved_as: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    /// Side effects from the original module to the binding.
    pub side_effects: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::value_impl]
impl SideEffectsModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<EcmascriptModuleAsset>,
        part: ModulePart,
        resolved_as: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        side_effects: Vec<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
    ) -> Vc<Self> {
        SideEffectsModule {
            module,
            part,
            resolved_as,
            side_effects,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for SideEffectsModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.module.ident().owned().await?;
        ident.parts.push(self.part.clone());

        ident.add_asset(
            rcstr!("resolved"),
            self.resolved_as.ident().to_resolved().await?,
        );

        ident.add_modifier(rcstr!("side effects"));

        for (i, side_effect) in self.side_effects.iter().enumerate() {
            ident.add_asset(
                RcStr::from(format!("side effect {i}")),
                side_effect.ident().to_resolved().await?,
            );
        }

        Ok(AssetIdent::new(ident))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let mut references = vec![];

        references.extend(
            self.side_effects
                .iter()
                .map(|side_effect| async move {
                    Ok(ResolvedVc::upcast(
                        SingleChunkableModuleReference::new(
                            *ResolvedVc::upcast(*side_effect),
                            rcstr!("side effect"),
                            ExportUsage::evaluation(),
                        )
                        .to_resolved()
                        .await?,
                    ))
                })
                .try_join()
                .await?,
        );

        references.push(ResolvedVc::upcast(
            SingleChunkableModuleReference::new(
                *ResolvedVc::upcast(self.resolved_as),
                rcstr!("resolved as"),
                ExportUsage::all(),
            )
            .to_resolved()
            .await?,
        ));

        Ok(Vc::cell(references))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        // This module exists to collect side effects from references.  So it isn't side effectful
        // but it may depend on side effectful modules.  use this mode to allow inner graph tree
        // shaking to still potentially trim this module and its dependencies.
        ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for SideEffectsModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        self.resolved_as.get_exports()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let module = self.await?;
        let mut code = RopeBuilder::default();
        let mut has_top_level_await = false;

        for &side_effect in module.side_effects.iter() {
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
                    StringifyModuleId(&side_effect.chunk_item_id(chunking_context).await?)
                )
                .as_bytes(),
            );
        }

        code.push_bytes(
            format!(
                "{TURBOPACK_EXPORT_NAMESPACE}({TURBOPACK_IMPORT}({}));\n",
                StringifyModuleId(&module.resolved_as.chunk_item_id(chunking_context).await?)
            )
            .as_bytes(),
        );

        let code = code.build();

        Ok(EcmascriptChunkItemContent {
            inner_code: code,
            source_map: None,
            rewrite_source_path: RewriteSourcePath::None,
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

#[turbo_tasks::value_impl]
impl ChunkableModule for SideEffectsModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for SideEffectsModule {}
