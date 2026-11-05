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

    /// The ident shared by this marker and the `WorkerLoaderModule` that is created from it
    /// during chunking.
    ///
    /// Both must route through this single memoized function, not just compute an equal
    /// `AssetIdent`: the module id map is keyed by the resolved `Vc<AssetIdent>`, so a lookup
    /// only hits when the ident originates from the same memoized call. The marker is the
    /// module that appears in the module graph (and therefore the one registered in the id
    /// map), while the loader is what actually becomes the chunk item — they have to agree on
    /// the id. This mirrors `AsyncLoaderModule::asset_ident_for`.
    #[turbo_tasks::function]
    pub async fn asset_ident_for(
        inner: Vc<Box<dyn ChunkableModule>>,
        worker_type: WorkerType,
    ) -> Result<Vc<AssetIdent>> {
        Ok(inner
            .ident()
            .owned()
            .await?
            .with_modifier(worker_type.modifier_str())
            .into_vc())
    }
}

#[turbo_tasks::value_impl]
impl Module for WorkerEntryModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        Self::asset_ident_for(*self.inner, self.worker_type)
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
