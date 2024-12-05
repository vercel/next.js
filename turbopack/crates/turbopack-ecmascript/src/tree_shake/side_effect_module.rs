use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbo_tasks_fs::glob::Glob;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkableModule, ChunkingContext, EvaluatableAsset},
    ident::AssetIdent,
    module::Module,
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
    pub part: ResolvedVc<ModulePart>,
    /// The module that is the binding
    pub resolved_as: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    /// Side effects from the original module to the binding.
    pub side_effects: Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>,
}

#[turbo_tasks::value_impl]
impl SideEffectsModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<EcmascriptModuleAsset>,
        part: ResolvedVc<ModulePart>,
        resolved_as: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        side_effects: Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>,
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
        let mut ident = self.module.ident().await?.clone_value();
        ident.parts.push(self.part);

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

        for &side_effect in self.side_effects.iter() {
            references.push(ResolvedVc::upcast(
                SingleChunkableModuleReference::new(
                    Vc::upcast(side_effect),
                    Vc::cell(RcStr::from("side effect")),
                )
                .to_resolved()
                .await?,
            ));
        }

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
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            SideEffectsModuleChunkItem {
                module: self.to_resolved().await?,
                chunking_context: chunking_context.to_resolved().await?,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for SideEffectsModule {}
