use anyhow::{bail, Result};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        chunk::ChunkingContext,
        ident::AssetIdent,
        module::Module,
    },
    turbopack::css::{
        chunk::CssChunkPlaceable, CssWithPlaceholderResult, FinalCssResult, ParseCss,
        ParseCssResult, ProcessCss,
    },
};

/// A [`CssClientReferenceModule`] is a marker module used to indicate which
/// client reference should appear in the client reference manifest.
#[turbo_tasks::value(transparent)]
pub struct CssClientReferenceModule {
    pub client_module: Vc<Box<dyn CssChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl CssClientReferenceModule {
    /// Create a new [`CssClientReferenceModule`] from the given source CSS
    /// module.
    #[turbo_tasks::function]
    pub fn new(client_module: Vc<Box<dyn CssChunkPlaceable>>) -> Vc<CssClientReferenceModule> {
        CssClientReferenceModule { client_module }.cell()
    }
}

#[turbo_tasks::function]
fn css_client_reference_modifier() -> Vc<String> {
    Vc::cell("css client reference".to_string())
}

#[turbo_tasks::value_impl]
impl Module for CssClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.client_module
            .ident()
            .with_modifier(css_client_reference_modifier())
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

#[turbo_tasks::value_impl]
impl ParseCss for CssClientReferenceModule {
    #[turbo_tasks::function]
    async fn parse_css(&self) -> Result<Vc<ParseCssResult>> {
        let Some(parse_css) =
            Vc::try_resolve_sidecast::<Box<dyn ParseCss>>(self.client_module).await?
        else {
            bail!("CSS client reference client module must be CSS parseable");
        };

        Ok(parse_css.parse_css())
    }
}

#[turbo_tasks::value_impl]
impl ProcessCss for CssClientReferenceModule {
    #[turbo_tasks::function]
    async fn get_css_with_placeholder(&self) -> Result<Vc<CssWithPlaceholderResult>> {
        let Some(imp) = Vc::try_resolve_sidecast::<Box<dyn ProcessCss>>(self.client_module).await?
        else {
            bail!("CSS client reference client module must be CSS processable");
        };

        dbg!("imp.get_css_with_placeholder");

        Ok(imp.get_css_with_placeholder())
    }

    #[turbo_tasks::function]
    async fn finalize_css(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<FinalCssResult>> {
        let Some(imp) = Vc::try_resolve_sidecast::<Box<dyn ProcessCss>>(self.client_module).await?
        else {
            bail!("CSS client reference client module must be CSS processable");
        };

        dbg!("imp.finalize_css");

        Ok(imp.finalize_css(chunking_context))
    }
}
