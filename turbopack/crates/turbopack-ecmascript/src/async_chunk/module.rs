use anyhow::Result;
use turbo_tasks::{RcStr, Value, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{availability_info::AvailabilityInfo, ChunkableModule, ChunkingContext},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleModuleReference},
};

use crate::async_chunk::chunk_item::AsyncLoaderChunkItem;

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("async loader".into())
}

/// The AsyncLoaderModule is a module that loads another module async, by
/// putting it into a separate chunk group.
#[turbo_tasks::value]
pub struct AsyncLoaderModule {
    pub inner: Vc<Box<dyn ChunkableModule>>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value_impl]
impl AsyncLoaderModule {
    #[turbo_tasks::function]
    pub fn new(
        module: Vc<Box<dyn ChunkableModule>>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Self> {
        Self::cell(AsyncLoaderModule {
            inner: module,
            chunking_context,
            availability_info: availability_info.into_value(),
        })
    }

    #[turbo_tasks::function]
    pub fn asset_ident_for(module: Vc<Box<dyn ChunkableModule>>) -> Vc<AssetIdent> {
        module.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::function]
fn inner_module_reference_description() -> Vc<RcStr> {
    Vc::cell("async module".into())
}

#[turbo_tasks::value_impl]
impl Module for AsyncLoaderModule {
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
impl Asset for AsyncLoaderModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        todo!()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for AsyncLoaderModule {
    #[turbo_tasks::function]
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
        Ok(Vc::upcast(
            AsyncLoaderChunkItem {
                chunking_context,
                module: self,
            }
            .cell(),
        ))
    }
}
