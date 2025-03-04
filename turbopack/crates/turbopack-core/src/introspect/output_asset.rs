use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};

use super::{
    utils::{children_from_output_assets, content_to_details},
    Introspectable, IntrospectableChildren,
};
use crate::{asset::Asset, output::OutputAsset};

#[turbo_tasks::value]
pub struct IntrospectableOutputAsset(ResolvedVc<Box<dyn OutputAsset>>);

#[turbo_tasks::value_impl]
impl IntrospectableOutputAsset {
    #[turbo_tasks::function]
    pub async fn new(
        asset: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Box<dyn Introspectable>>> {
        Ok(
            *ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(asset).unwrap_or_else(|| {
                ResolvedVc::upcast(IntrospectableOutputAsset(asset).resolved_cell())
            }),
        )
    }
}

#[turbo_tasks::function]
fn ty() -> Vc<RcStr> {
    Vc::cell("output asset".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectableOutputAsset {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        ty()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<RcStr> {
        self.0.path().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        content_to_details(self.0.content())
    }

    #[turbo_tasks::function]
    fn children(&self) -> Vc<IntrospectableChildren> {
        children_from_output_assets(self.0.references())
    }
}
