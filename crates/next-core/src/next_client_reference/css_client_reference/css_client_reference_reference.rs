use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkGroupType, ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    module::Module,
    reference::ModuleReference,
    resolve::ModuleResolveResult,
};

#[turbo_tasks::value]
pub(crate) struct CssClientReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl CssClientReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(CssClientReference { module })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CssClientReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: ChunkGroupType::Evaluated,
            merge_tag: Some("client".into()),
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CssClientReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        ModuleResolveResult::module(self.module).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CssClientReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("css client reference to client".into())
    }
}
