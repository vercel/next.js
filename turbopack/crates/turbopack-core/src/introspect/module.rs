use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ValueToString, Vc};

use super::{
    utils::{children_from_module_references, content_to_details},
    Introspectable, IntrospectableChildren,
};
use crate::{asset::Asset, module::Module};

#[turbo_tasks::value(local)]
pub struct IntrospectableModule(Vc<Box<dyn Module>>);

#[turbo_tasks::value_impl]
impl IntrospectableModule {
    #[turbo_tasks::function]
    pub async fn new(asset: Vc<Box<dyn Module>>) -> Result<Vc<Box<dyn Introspectable>>> {
        Ok(Vc::try_resolve_sidecast::<Box<dyn Introspectable>>(asset)
            .await?
            .unwrap_or_else(|| Vc::upcast(IntrospectableModule(asset).cell())))
    }
}

#[turbo_tasks::function]
fn ty() -> Vc<RcStr> {
    Vc::cell("asset".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectableModule {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        ty()
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
