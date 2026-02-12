use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkingType, ChunkingTypeOption},
    module::Module,
    reference::ModuleReference,
    resolve::ModuleResolveResult,
};

/// A reference to an internal CSS asset.
#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("internal css {}", self.module.ident())]
pub struct InternalCssAssetReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl InternalCssAssetReference {
    /// Creates a new [`Vc<InternalCssAssetReference>`].
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(InternalCssAssetReference { module })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for InternalCssAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }

    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        }))
    }
}
