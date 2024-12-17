use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::ChunkableModuleReference,
    reference::ModuleReference,
    reference_type::CssReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
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
            Value::new(CssReferenceSubType::Compose),
            // TODO: add real issue source, currently impossible because `CssClassName` doesn't
            // contain the source span
            // https://docs.rs/swc_css_modules/0.21.16/swc_css_modules/enum.CssClassName.html
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
