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

// #[turbo_tasks::value_impl]
// impl ParseCss for CssClientReferenceModule {
//     #[turbo_tasks::function]
//     async fn parse_css(&self) -> Result<Vc<ParseCssResult>> {
//         let imp = ResolvedVc::try_sidecast_sync::<Box<dyn ParseCss>>(self.client_module)
//             .context("CSS client reference client module must be CSS parseable")?;

//         Ok(imp.parse_css())
//     }
// }

// #[turbo_tasks::value_impl]
// impl ProcessCss for CssClientReferenceModule {
//     #[turbo_tasks::function]
//     async fn get_css_with_placeholder(&self) -> Result<Vc<CssWithPlaceholderResult>> {
//         let imp = ResolvedVc::try_sidecast_sync::<Box<dyn ProcessCss>>(self.client_module)
//             .context("CSS client reference client module must be CSS processable")?;

//         Ok(imp.get_css_with_placeholder())
//     }

//     #[turbo_tasks::function]
//     async fn finalize_css(
//         &self,
//         module_graph: Vc<ModuleGraph>,
//         chunking_context: Vc<Box<dyn ChunkingContext>>,
//         minify_type: MinifyType,
//     ) -> Result<Vc<FinalCssResult>> {
//         let imp = ResolvedVc::try_sidecast_sync::<Box<dyn ProcessCss>>(self.client_module)
//             .context("CSS client reference client module must be CSS processable")?;

//         Ok(imp.finalize_css(module_graph, chunking_context, minify_type))
//     }
// }
