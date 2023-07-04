use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{ResolveResult, ResolveResultVc},
};

/// A reference to an internal CSS asset.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct InternalCssAssetReference {
    asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl InternalCssAssetReferenceVc {
    /// Creates a new [`InternalCssAssetReferenceVc`].
    #[turbo_tasks::function]
    pub fn new(asset: AssetVc) -> Self {
        Self::cell(InternalCssAssetReference { asset })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for InternalCssAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(self.asset).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for InternalCssAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "internal css {}",
            self.asset.ident().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for InternalCssAssetReference {}
