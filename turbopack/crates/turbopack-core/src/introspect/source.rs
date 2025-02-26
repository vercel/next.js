use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};

use super::{utils::content_to_details, Introspectable};
use crate::{asset::Asset, source::Source};

#[turbo_tasks::value]
pub struct IntrospectableSource(ResolvedVc<Box<dyn Source>>);

#[turbo_tasks::value_impl]
impl IntrospectableSource {
    #[turbo_tasks::function]
    pub async fn new(asset: ResolvedVc<Box<dyn Source>>) -> Result<Vc<Box<dyn Introspectable>>> {
        Ok(*ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(asset)
            .unwrap_or_else(|| ResolvedVc::upcast(IntrospectableSource(asset).resolved_cell())))
    }
}

#[turbo_tasks::function]
fn ty() -> Vc<RcStr> {
    Vc::cell("source".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectableSource {
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
}
