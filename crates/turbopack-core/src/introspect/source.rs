use anyhow::Result;
use turbo_tasks::{ValueToString, Vc};

use super::{utils::content_to_details, Introspectable};
use crate::{asset::Asset, source::Source};

#[turbo_tasks::value]
pub struct IntrospectableSource(Vc<Box<dyn Source>>);

#[turbo_tasks::value_impl]
impl IntrospectableSource {
    #[turbo_tasks::function]
    pub async fn new(asset: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Introspectable>>> {
        Ok(Vc::try_resolve_sidecast::<Box<dyn Introspectable>>(asset)
            .await?
            .unwrap_or_else(|| Vc::upcast(IntrospectableSource(asset).cell())))
    }
}

#[turbo_tasks::function]
fn ty() -> Vc<String> {
    Vc::cell("source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectableSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        ty()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        self.0.ident().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<String> {
        content_to_details(self.0.content())
    }
}
