use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc};

use super::{
    Introspectable, IntrospectableChildren,
    utils::{children_from_module_references, content_to_details},
};
use crate::{asset::Asset, module::Module};

#[turbo_tasks::value]
pub struct IntrospectableModule(ResolvedVc<Box<dyn Module>>);

#[turbo_tasks::value_impl]
impl IntrospectableModule {
    #[turbo_tasks::function]
    pub fn new(asset: ResolvedVc<Box<dyn Module>>) -> Result<Vc<Box<dyn Introspectable>>> {
        Ok(*ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(asset)
            .unwrap_or_else(|| ResolvedVc::upcast(IntrospectableModule(asset).resolved_cell())))
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectableModule {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("asset"))
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<RcStr> {
        self.0.ident().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        content_to_details(self.0.content())
    }

    #[turbo_tasks::function]
    fn children(&self) -> Vc<IntrospectableChildren> {
        children_from_module_references(self.0.references())
    }
}
