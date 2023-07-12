use anyhow::{bail, Result};
use turbo_tasks::primitives::StringVc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContentVc, AssetVc},
        ident::AssetIdentVc,
        module::{Module, ModuleVc},
        reference::AssetReferencesVc,
    },
    turbopack::css::{chunk::CssChunkPlaceableVc, ParseCss, ParseCssResultVc, ParseCssVc},
};

/// A [`CssClientReferenceModule`] is a marker module used to indicate which
/// client reference should appear in the client reference manifest.
#[turbo_tasks::value(transparent)]
pub struct CssClientReferenceModule {
    pub client_module: CssChunkPlaceableVc,
}

#[turbo_tasks::value_impl]
impl CssClientReferenceModuleVc {
    /// Create a new [`CssClientReferenceModule`] from the given source CSS
    /// module.
    #[turbo_tasks::function]
    pub fn new(client_module: CssChunkPlaceableVc) -> CssClientReferenceModuleVc {
        CssClientReferenceModule { client_module }.cell()
    }
}

#[turbo_tasks::function]
fn css_client_reference_modifier() -> StringVc {
    StringVc::cell("css client reference".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for CssClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.client_module
            .ident()
            .with_modifier(css_client_reference_modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<AssetContentVc> {
        // The client reference asset only serves as a marker asset.
        bail!("CssClientReferenceModule has no content")
    }

    #[turbo_tasks::function]
    fn references(_self_vc: CssClientReferenceModuleVc) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl ParseCss for CssClientReferenceModule {
    #[turbo_tasks::function]
    async fn parse_css(&self) -> Result<ParseCssResultVc> {
        let Some(parse_css) = ParseCssVc::resolve_from(self.client_module).await? else {
            bail!("CSS client reference client module must be CSS parseable");
        };

        Ok(parse_css.parse_css())
    }
}

#[turbo_tasks::value_impl]
impl Module for CssClientReferenceModule {}
