use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    reference::ModuleReferences,
};

use crate::next_client_reference::css_client_reference::css_client_reference_reference::CssClientReference;

/// A [`CssClientReferenceModule`] is a marker module used to indicate which
/// client reference should appear in the client reference manifest.
#[turbo_tasks::value]
pub struct CssClientReferenceModule {
    /// The CSS module (in the client context)
    pub client_module: ResolvedVc<Box<dyn CssChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl CssClientReferenceModule {
    /// Create a new [`CssClientReferenceModule`] from the given source CSS
    /// module.
    #[turbo_tasks::function]
    pub fn new(
        client_module: ResolvedVc<Box<dyn CssChunkPlaceable>>,
    ) -> Vc<CssClientReferenceModule> {
        CssClientReferenceModule { client_module }.cell()
    }
}

#[turbo_tasks::function]
fn css_client_reference_modifier() -> Vc<RcStr> {
    Vc::cell("css client reference".into())
}

#[turbo_tasks::value_impl]
impl Module for CssClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.client_module
            .ident()
            .with_modifier(css_client_reference_modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let CssClientReferenceModule { client_module, .. } = &*self.await?;

        Ok(Vc::cell(vec![ResolvedVc::upcast(
            CssClientReference::new(*ResolvedVc::upcast(*client_module))
                .to_resolved()
                .await?,
        )]))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssClientReferenceModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        // The client reference asset only serves as a marker asset.
        bail!("CssClientReferenceModule has no content")
    }
}
