use anyhow::Result;
use turbo_tasks::{RcStr, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleModuleReference},
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
    pub inner: Vc<Box<dyn ChunkableModule>>,
}

#[turbo_tasks::value_impl]
impl WorkerLoaderModule {
    #[turbo_tasks::function]
    pub fn new(module: Vc<Box<dyn ChunkableModule>>) -> Vc<Self> {
        Self::cell(WorkerLoaderModule { inner: module })
    }

    #[turbo_tasks::function]
    pub fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Vc<AssetIdent> {
        module.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::function]
fn inner_module_reference_description() -> Vc<RcStr> {
    Vc::cell("worker module".into())
}

#[turbo_tasks::value_impl]
impl Module for WorkerLoaderModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        Self::asset_ident_for(self.inner)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![Vc::upcast(SingleModuleReference::new(
            Vc::upcast(self.await?.inner),
            inner_module_reference_description(),
        ))]))
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
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
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
