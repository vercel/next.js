use turbo_tasks::Vc;
use turbopack_core::{asset::Asset, chunk::ChunkableModule, module::Module};

use super::{item::EcmascriptChunkItem, EcmascriptChunkingContext};
use crate::references::{async_module::OptionAsyncModule, esm::EsmExports};

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkableModule + Module + Asset {
    fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>>;
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports>;
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        Vc::cell(None)
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkPlaceables(Vec<Vc<Box<dyn EcmascriptChunkPlaceable>>>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceables {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

#[turbo_tasks::value(shared)]
pub enum EcmascriptExports {
    EsmExports(Vc<EsmExports>),
    DynamicNamespace,
    CommonJs,
    Value,
    None,
}
