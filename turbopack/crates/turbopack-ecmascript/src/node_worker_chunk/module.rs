use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkGroupType, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
};

use super::chunk_item::NodeWorkerLoaderChunkItem;

/// The NodeWorkerLoaderModule is a module that creates a separate root chunk group for the given
/// module and exports a file path to pass to the Node.js Worker constructor.
///
/// Unlike the browser WorkerLoaderModule which exports a blob URL, this module exports the actual
/// file path to the worker entry chunk, which is required by Node.js worker_threads.
#[turbo_tasks::value]
pub struct NodeWorkerLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
}

#[turbo_tasks::value_impl]
impl NodeWorkerLoaderModule {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn ChunkableModule>>) -> Vc<Self> {
        Self::cell(NodeWorkerLoaderModule { inner: module })
    }

    #[turbo_tasks::function]
    pub fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Vc<AssetIdent> {
        module.ident().with_modifier(rcstr!("node worker loader"))
    }
}

#[turbo_tasks::value_impl]
impl Module for NodeWorkerLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        Self::asset_ident_for(*self.inner)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            NodeWorkerModuleReference::new(*ResolvedVc::upcast(self.await?.inner))
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
impl Asset for NodeWorkerLoaderModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        panic!("content() should not be called");
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for NodeWorkerLoaderModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        eprintln!("fetching node worker chunk item");
        Vc::upcast(
            NodeWorkerLoaderChunkItem {
                module: self,
                module_graph,
                chunking_context,
            }
            .cell(),
        )
    }
}

/// Internal reference that creates an Isolated chunk group for the worker module.
/// This ensures the worker gets its own entry point with fresh runtime context.
#[turbo_tasks::value]
struct NodeWorkerModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl NodeWorkerModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(NodeWorkerModuleReference { module })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for NodeWorkerModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        eprintln!("NodeWorkerModuleReference::chunking_type called");
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: ChunkGroupType::Evaluated,
            merge_tag: None,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for NodeWorkerModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for NodeWorkerModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("node worker module"))
    }
}
