#![allow(rustdoc::private_intra_doc_links)]
use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReferences, SingleModuleReference},
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

/// A marker module used by the
/// [super::ecmascript_client_reference_proxy_module::EcmascriptClientReferenceProxyModule] to
/// indicate which client reference should appear in the client reference manifest.
#[turbo_tasks::value]
pub struct EcmascriptClientReferenceModule {
    pub server_ident: ResolvedVc<AssetIdent>,
    pub client_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    pub ssr_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReferenceModule {
    /// Create a new [EcmascriptClientReferenceModule].
    ///
    /// # Arguments
    ///
    /// * `server_ident` - The identifier of the server module, used to identify the client
    ///   reference.
    /// * `client_module` - The client module.
    /// * `ssr_module` - The SSR module.
    #[turbo_tasks::function]
    pub fn new(
        server_ident: ResolvedVc<AssetIdent>,
        client_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        ssr_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
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
fn ecmascript_client_reference_modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript client reference module".into())
}

#[turbo_tasks::function]
fn ecmascript_client_reference_client_ref_modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript client reference to client".into())
}

#[turbo_tasks::function]
fn ecmascript_client_reference_ssr_ref_modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript client reference to ssr".into())
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.server_ident
            .with_modifier(ecmascript_client_reference_modifier())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let client_module = ResolvedVc::upcast(self.client_module);
        let ssr_module = ResolvedVc::upcast(self.ssr_module);
        Ok(Vc::cell(vec![
            ResolvedVc::upcast(
                SingleModuleReference::new(
                    *client_module,
                    ecmascript_client_reference_client_ref_modifier(),
                )
                .to_resolved()
                .await?,
            ),
            ResolvedVc::upcast(
                SingleModuleReference::new(
                    *ssr_module,
                    ecmascript_client_reference_ssr_ref_modifier(),
                )
                .to_resolved()
                .await?,
            ),
        ]))
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
