use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::ChunkableModuleReference,
    reference::ModuleReference,
    reference_type::CssReferenceSubType,
    resolve::{ModuleResolveResult, origin::ResolveOrigin, parse::Request},
};

use crate::references::css_resolve;

/// A `composes: ... from ...` CSS module reference.
#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CssModuleComposeReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
}

#[turbo_tasks::value_impl]
impl CssModuleComposeReference {
    /// Creates a new [`CssModuleComposeReference`].
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
    ) -> Vc<Self> {
        Self::cell(CssModuleComposeReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CssModuleComposeReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        css_resolve(
            *self.origin,
            *self.request,
            CssReferenceSubType::Compose,
            // TODO: add real issue source, currently impossible
            None,
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CssModuleComposeReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("compose(url) {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for CssModuleComposeReference {}
