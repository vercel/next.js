use std::sync::LazyLock;

use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::ChunkingType, module::Module, reference::ModuleReference, resolve::ModuleResolveResult,
};

#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("Next.js server utility {}", self.asset.ident())]
pub struct NextServerUtilityModuleReference {
    asset: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl NextServerUtilityModuleReference {
    #[turbo_tasks::function]
    pub fn new(asset: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        NextServerUtilityModuleReference { asset }.cell()
    }
}

pub static NEXT_SERVER_UTILITY_MERGE_TAG: LazyLock<RcStr> =
    LazyLock::new(|| rcstr!("next-server-utility"));

#[turbo_tasks::value_impl]
impl ModuleReference for NextServerUtilityModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.asset)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Shared {
            inherit_async: true,
            merge_tag: Some(NEXT_SERVER_UTILITY_MERGE_TAG.clone()),
        })
    }
}
