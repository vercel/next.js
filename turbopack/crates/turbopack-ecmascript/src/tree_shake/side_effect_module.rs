use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, Value, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkableModule, ChunkingContext, EvaluatableAsset},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    reference::{ModuleReferences, SingleChunkableModuleReference},
    resolve::ModulePart,
};

use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    tree_shake::chunk_item::SideEffectsModuleChunkItem,
    EcmascriptModuleAsset,
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
            ResolvedVc::cell(RcStr::from("resolved")),
            self.resolved_as.ident().to_resolved().await?,
        );

        ident.add_modifier(ResolvedVc::cell(RcStr::from("side effects")));

        for (i, side_effect) in self.side_effects.iter().enumerate() {
            ident.add_asset(
                ResolvedVc::cell(RcStr::from(format!("side effect {}", i))),
                side_effect.ident().to_resolved().await?,
            );
        }

        Ok(AssetIdent::new(Value::new(ident)))
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
                            Vc::cell(RcStr::from("side effect")),
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
                Vc::cell(RcStr::from("resolved as")),
            )
            .to_resolved()
            .await?,
        ));

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for SideEffectsModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        unreachable!("SideEffectsModule has no content")
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for SideEffectsModule {
    #[turbo_tasks::function]
    async fn get_exports(&self) -> Vc<EcmascriptExports> {
        self.resolved_as.get_exports()
    }

    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(self: Vc<Self>, _: Vc<Glob>) -> Vc<bool> {
        Vc::cell(true)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for SideEffectsModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            SideEffectsModuleChunkItem {
                module: self.to_resolved().await?,
                module_graph,
                chunking_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for SideEffectsModule {}
