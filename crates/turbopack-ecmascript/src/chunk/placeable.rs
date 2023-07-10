use anyhow::Result;
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkableModule, ChunkableModuleVc},
    module::{Module, ModuleVc},
};

use super::{item::EcmascriptChunkItemVc, EcmascriptChunkingContextVc};
use crate::references::esm::EsmExportsVc;

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkableModule + Module + Asset {
    fn as_chunk_item(&self, context: EcmascriptChunkingContextVc) -> EcmascriptChunkItemVc;
    fn get_exports(&self) -> EcmascriptExportsVc;
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkPlaceables(Vec<EcmascriptChunkPlaceableVc>);

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceablesVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Self::cell(Vec::new())
    }
}

#[turbo_tasks::value(shared)]
pub enum EcmascriptExports {
    EsmExports(EsmExportsVc),
    DynamicNamespace,
    CommonJs,
    Value,
    None,
}
