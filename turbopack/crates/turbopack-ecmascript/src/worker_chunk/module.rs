use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkGroupType, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
};

use super::{chunk_item::WorkerLoaderChunkItem, worker_type::WorkerType};

/// The WorkerLoaderModule is a module that creates a separate root chunk group for the given module
/// and exports a URL (for web workers) or file path (for Node.js workers) to pass to the worker
/// constructor.
#[turbo_tasks::value]
pub struct WorkerLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
    pub worker_type: WorkerType,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderModule {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn ChunkableModule>>,
        worker_type: WorkerType,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(WorkerLoaderModule {
            inner: module,
            worker_type,
            asset_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl Module for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.inner
            .ident()
            .with_modifier(self.worker_type.modifier_str())
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

#[turbo_tasks::value_impl]
impl ChunkableModule for WorkerLoaderModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        let this = self.await?;
        Ok(Vc::upcast(
            WorkerLoaderChunkItem {
                module: self,
                module_graph,
                chunking_context,
                worker_type: this.worker_type,
                asset_context: this.asset_context,
            }
            .cell(),
        ))
    }
}

#[turbo_tasks::value]
struct WorkerModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
    worker_type: WorkerType,
}

#[turbo_tasks::value_impl]
impl WorkerModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>, worker_type: WorkerType) -> Vc<Self> {
        Self::cell(WorkerModuleReference {
            module,
            worker_type,
        })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for WorkerModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: match self.worker_type {
                WorkerType::SharedWebWorker | WorkerType::WebWorker => ChunkGroupType::Evaluated,
                WorkerType::NodeWorkerThread => ChunkGroupType::Entry,
            },
            merge_tag: None,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WorkerModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(match self.worker_type {
            WorkerType::WebWorker => rcstr!("web worker module"),
            WorkerType::NodeWorkerThread => rcstr!("node worker thread module"),
            WorkerType::SharedWebWorker => rcstr!("shared web worker module"),
        })
    }
}
