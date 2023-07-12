use anyhow::{bail, Result};
use turbo_tasks::primitives::StringVc;
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetContentVc, AssetVc},
        ident::AssetIdentVc,
        module::{Module, ModuleVc},
        reference::AssetReferencesVc,
    },
    ecmascript::chunk::EcmascriptChunkPlaceableVc,
};

/// An [`EcmascriptClientReferenceModule`] is a marker module, used by the
/// [`EcmascriptClientReferenceProxyModule`] to indicate which client reference
/// should appear in the client reference manifest.
#[turbo_tasks::value(transparent)]
pub struct EcmascriptClientReferenceModule {
    pub server_ident: AssetIdentVc,
    pub client_module: EcmascriptChunkPlaceableVc,
    pub ssr_module: EcmascriptChunkPlaceableVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReferenceModuleVc {
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
        server_ident: AssetIdentVc,
        client_module: EcmascriptChunkPlaceableVc,
        ssr_module: EcmascriptChunkPlaceableVc,
    ) -> EcmascriptClientReferenceModuleVc {
        EcmascriptClientReferenceModule {
            server_ident,
            client_module,
            ssr_module,
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn ecmascript_client_reference_modifier() -> StringVc {
    StringVc::cell("ecmascript client reference".to_string())
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.server_ident
            .with_modifier(ecmascript_client_reference_modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<AssetContentVc> {
        // The ES client reference asset only serves as a marker asset.
        bail!("EcmascriptClientReferenceModule has no content")
    }

    #[turbo_tasks::function]
    fn references(_self_vc: EcmascriptClientReferenceModuleVc) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceModule {}
