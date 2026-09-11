use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    chunk::{ChunkableModule, worker_type::WorkerType},
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    reference::{ModuleReferences, SingleChunkableModuleReference},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::ExportUsage,
};

use super::module::WorkerModuleReference;
use crate::embed_js::embed_fs;

/// The `createWorker` runtime helper for `worker_type`, resolved through `asset_context`.
///
/// Shared by [`WorkerEntryModule`] (which references it so the module graph's initial
/// construction discovers it, making it reachable and giving it an id) and
/// `WorkerLoaderModule` (whose generated code embeds its chunk item id). Both must call this
/// *same* memoized function with the same arguments so they resolve to the identical `Vc`,
/// and therefore the identical chunk item — the marker only carries the dependency, it does
/// not itself become a chunk item.
#[turbo_tasks::function]
pub(crate) async fn create_worker_module(
    asset_context: Vc<Box<dyn AssetContext>>,
    worker_type: WorkerType,
) -> Result<Vc<Box<dyn Module>>> {
    let helper = match worker_type {
        WorkerType::WebWorker | WorkerType::SharedWebWorker => {
            rcstr!("worker/browser/createWorker.ts")
        }
        WorkerType::NodeWorkerThread => rcstr!("worker/node/createWorker.ts"),
    };
    Ok(asset_context
        .process(
            Vc::upcast(FileSource::new(
                embed_fs()
                    .to_resolved()
                    .await?
                    .root()
                    .await?
                    .join(&helper)?,
            )),
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Import),
        )
        .module())
}

/// A graph-level marker that sits where `WorkerLoaderModule` used to live.
/// It carries the information needed to construct a `WorkerLoaderModule` late
/// during chunking (with the chunk group's `new_availability_info`), plus the
/// two dependencies that the late-created loader needs to be chunked alongside:
/// a `WorkerModuleReference` to the inner module (so the module graph retains
/// reachability and the worker chunk group's DFS works correctly), and a
/// reference to the `createWorker` runtime helper (so it gets a module id and
/// is chunked into the same group as the loader — the loader itself is never
/// part of the initial module-graph construction, so it cannot expose this
/// dependency on its own).
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
        Ok(Vc::cell(vec![
            ResolvedVc::upcast(
                WorkerModuleReference::new(*ResolvedVc::upcast(this.inner), this.worker_type)
                    .to_resolved()
                    .await?,
            ),
            // The late-created `WorkerLoaderModule` embeds this helper's chunk item id in its
            // generated code, but it is not part of the module graph, so it cannot contribute
            // this edge itself. Declare it here so the helper is discovered during graph
            // construction (getting a module id) and chunked into the group that ends up
            // holding the loader.
            ResolvedVc::upcast(
                SingleChunkableModuleReference::new(
                    create_worker_module(*this.asset_context, this.worker_type),
                    rcstr!("createWorker"),
                    ExportUsage::named(rcstr!("default")),
                )
                .to_resolved()
                .await?,
            ),
        ]))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
    }
}
