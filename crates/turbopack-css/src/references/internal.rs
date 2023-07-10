use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::Asset,
    chunk::{ChunkableModuleReference, ChunkableModuleReferenceVc},
    module::ModuleVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// A reference to an internal CSS asset.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct InternalCssAssetReference {
    module: ModuleVc,
}

#[turbo_tasks::value_impl]
impl InternalCssAssetReferenceVc {
    /// Creates a new [`InternalCssAssetReferenceVc`].
    #[turbo_tasks::function]
    pub fn new(module: ModuleVc) -> Self {
        Self::cell(InternalCssAssetReference { module })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for InternalCssAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(self.module.into()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for InternalCssAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "internal css {}",
            self.module.ident().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for InternalCssAssetReference {}
