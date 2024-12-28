#![allow(rustdoc::private_intra_doc_links)]
use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkGroupType, ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
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
        Ok(Vc::cell(vec![
            ResolvedVc::upcast(
                EcmascriptClientReference::new(
                    *ResolvedVc::upcast(self.client_module),
                    ChunkGroupType::Evaluated,
                    ecmascript_client_reference_client_ref_modifier(),
                )
                .to_resolved()
                .await?,
            ),
            ResolvedVc::upcast(
                EcmascriptClientReference::new(
                    *ResolvedVc::upcast(self.ssr_module),
                    ChunkGroupType::Entry,
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

#[turbo_tasks::value]
pub(crate) struct EcmascriptClientReference {
    module: ResolvedVc<Box<dyn Module>>,
    ty: ChunkGroupType,
    description: ResolvedVc<RcStr>,
}

#[turbo_tasks::value_impl]
impl EcmascriptClientReference {
    #[turbo_tasks::function]
    pub fn new(
        module: ResolvedVc<Box<dyn Module>>,
        ty: ChunkGroupType,
        description: ResolvedVc<RcStr>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptClientReference {
            module,
            ty,
            description,
        })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for EcmascriptClientReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: self.ty,
            // TODO use proper values here
            _merge_tag: None,
            _chunking_context: None,
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for EcmascriptClientReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        ModuleResolveResult::module(self.module).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptClientReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        *self.description
    }
}
