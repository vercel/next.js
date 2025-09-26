use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack::css::chunk::CssChunkPlaceable;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkGroupType, ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    resolve::ModuleResolveResult,
};

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

#[turbo_tasks::value_impl]
impl Module for CssClientReferenceModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.client_module
            .ident()
            .with_modifier(rcstr!("css client reference"))
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

#[turbo_tasks::value]
pub(crate) struct CssClientReference {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl CssClientReference {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(CssClientReference { module })
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CssClientReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Isolated {
            _ty: ChunkGroupType::Evaluated,
            merge_tag: Some(rcstr!("client")),
        }))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CssClientReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(self.module)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CssClientReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("css client reference to client"))
    }
}
