use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::ChunkableModuleReference, module::Module, reference::ModuleReference,
    resolve::ModuleResolveResult,
};

/// A reference to an internal CSS asset.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
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
        ModuleResolveResult::module(self.module).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for InternalCssAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("internal css {}", self.module.ident().to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for InternalCssAssetReference {}
