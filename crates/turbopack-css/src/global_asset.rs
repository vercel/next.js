use anyhow::{bail, Result};
use turbo_tasks::{primitives::StringVc, Value};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{PassthroughAsset, PassthroughAssetVc},
    context::{AssetContext, AssetContextVc},
    ident::AssetIdentVc,
    reference::AssetReferencesVc,
    reference_type::{CssReferenceSubType, ReferenceType},
};

use crate::references::internal::InternalCssAssetReferenceVc;

#[turbo_tasks::value]
#[derive(Clone)]
pub struct GlobalCssAsset {
    source: AssetVc,
    context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl GlobalCssAssetVc {
    /// Creates a new CSS asset. The CSS is treated as global CSS.
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
        Self::cell(GlobalCssAsset { source, context })
    }
}

#[turbo_tasks::value_impl]
impl GlobalCssAssetVc {
    #[turbo_tasks::function]
    async fn inner(self) -> Result<AssetVc> {
        let this = self.await?;
        // The underlying CSS is processed through an internal CSS reference.
        // This can then be picked up by other rules to treat CSS assets in
        // a special way. For instance, in the Next App Router implementation,
        // RSC CSS assets will be added to the client references manifest.
        Ok(this.context.process(
            this.source,
            Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for GlobalCssAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<AssetContentVc> {
        bail!("CSS global asset has no contents")
    }

    #[turbo_tasks::function]
    fn references(self_vc: GlobalCssAssetVc) -> AssetReferencesVc {
        AssetReferencesVc::cell(vec![
            InternalCssAssetReferenceVc::new(self_vc.inner()).into()
        ])
    }
}

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("global css".to_string())
}

/// A GlobalAsset is a transparent wrapper around an actual CSS asset.
#[turbo_tasks::value_impl]
impl PassthroughAsset for GlobalCssAsset {}
