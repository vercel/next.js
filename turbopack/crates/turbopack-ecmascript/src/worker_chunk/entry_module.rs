use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    chunk::{ChunkableModule, worker_type::WorkerType},
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    reference::ModuleReferences,
};

use super::module::WorkerModuleReference;

/// A graph-level marker that sits where `WorkerLoaderModule` used to live.
/// It carries the information needed to construct a `WorkerLoaderModule` late
/// during chunking (with the chunk group's `new_availability_info`), plus a
/// `WorkerModuleReference` to the inner module so the module graph retains
/// reachability and the worker chunk group's DFS works correctly.
#[turbo_tasks::value]
pub struct WorkerEntryModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub worker_type: WorkerType,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WorkerEntryModule {
    #[turbo_tasks::function]
    pub fn new(
        inner: ResolvedVc<Box<dyn ChunkableModule>>,
        worker_type: WorkerType,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(WorkerEntryModule {
            inner,
            worker_type,
            asset_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl Module for WorkerEntryModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .inner
            .ident()
            .owned()
            .await?
            .with_modifier(self.worker_type.modifier_str())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            WorkerModuleReference::new(*ResolvedVc::upcast(this.inner), this.worker_type)
                .to_resolved()
                .await?,
        )]))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}
