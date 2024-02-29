use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::PassthroughModule,
    context::{AssetContext, ProcessResult},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
    reference_type::{CssReferenceSubType, ReferenceType},
    source::Source,
};

use crate::references::internal::InternalCssAssetReference;

#[turbo_tasks::value]
#[derive(Clone)]
pub struct GlobalCssAsset {
    source: Vc<Box<dyn Source>>,
    asset_context: Vc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl GlobalCssAsset {
    /// Creates a new CSS asset. The CSS is treated as global CSS.
    #[turbo_tasks::function]
    pub fn new(source: Vc<Box<dyn Source>>, asset_context: Vc<Box<dyn AssetContext>>) -> Vc<Self> {
        Self::cell(GlobalCssAsset {
            source,
            asset_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl GlobalCssAsset {
    #[turbo_tasks::function]
    async fn inner(self: Vc<Self>) -> Result<Vc<ProcessResult>> {
        let this = self.await?;
        // The underlying CSS is processed through an internal CSS reference.
        // This can then be picked up by other rules to treat CSS assets in
        // a special way. For instance, in the Next App Router implementation,
        // RSC CSS assets will be added to the client references manifest.
        Ok(this.asset_context.process(
            this.source,
            Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for GlobalCssAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier())
            .with_layer(self.asset_context.layer())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(match *self.inner().await? {
            ProcessResult::Module(inner) => vec![Vc::upcast(InternalCssAssetReference::new(inner))],
            ProcessResult::Ignore => vec![],
        }))
    }
}

#[turbo_tasks::value_impl]
impl Asset for GlobalCssAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(FileContent::NotFound.cell()))
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("global css".to_string())
}

/// A GlobalAsset is a transparent wrapper around an actual CSS asset.
#[turbo_tasks::value_impl]
impl PassthroughModule for GlobalCssAsset {}
