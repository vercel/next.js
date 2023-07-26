use anyhow::{bail, Result};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContent},
        ident::AssetIdent,
        module::Module,
    },
    ecmascript::chunk::EcmascriptChunkPlaceable,
};

/// An [`EcmascriptClientReferenceModule`] is a marker module, used by the
/// [`EcmascriptClientReferenceProxyModule`] to indicate which client reference
/// should appear in the client reference manifest.
#[turbo_tasks::value(transparent)]
pub struct EcmascriptClientReferenceModule {
    pub server_ident: Vc<AssetIdent>,
    pub client_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    pub ssr_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReferenceModule {
    /// Create a new [`EcmascriptClientReferenceModule`].
    ///
    /// # Arguments
    ///
    /// * `server_ident` - The identifier of the server module, used to identify
    ///   the client reference.
    /// * `client_module` - The client module.
    /// * `ssr_module` - The SSR module.
    #[turbo_tasks::function]
    pub fn new(
        server_ident: Vc<AssetIdent>,
        client_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
        ssr_module: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Vc<EcmascriptClientReferenceModule> {
        EcmascriptClientReferenceModule {
            server_ident,
            client_module,
            ssr_module,
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn ecmascript_client_reference_modifier() -> Vc<String> {
    Vc::cell("ecmascript client reference".to_string())
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.server_ident
            .with_modifier(ecmascript_client_reference_modifier())
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        // The ES client reference asset only serves as a marker asset.
        bail!("EcmascriptClientReferenceModule has no content")
    }
}
