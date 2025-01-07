use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkGroupType, ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
};

use super::chunk_item::WorkerLoaderChunkItem;

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("worker loader".into())
}

/// The WorkerLoaderModule is a module that creates a separate root chunk group for the given module
/// and exports a URL to pass to the worker constructor.
#[turbo_tasks::value]
pub struct WorkerLoaderModule {
    pub inner: ResolvedVc<Box<dyn ChunkableModule>>,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderModule {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn ChunkableModule>>) -> Vc<Self> {
        Self::cell(WorkerLoaderModule { inner: module })
    }

    #[turbo_tasks::function]
    pub fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Vc<AssetIdent> {
        module.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::value_impl]
impl Module for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        Self::asset_ident_for(*self.inner)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![ResolvedVc::upcast(
            WorkerModuleReference::new(*ResolvedVc::upcast(self.await?.inner))
                .to_resolved()
                .await?,
        )]))
    }
}

#[turbo_tasks::value_impl]
impl Asset for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            WorkerLoaderChunkItem {
                chunking_context,
                module: self,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct WorkerModuleReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl WorkerModuleReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(WorkerModuleReference { module })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for WorkerModuleReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: ChunkGroupType::Evaluated,
            _merge_tag: None,
            _chunking_context: None,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for WorkerModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        ModuleResolveResult::module(self.module).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WorkerModuleReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("worker module".into())
    }
}
