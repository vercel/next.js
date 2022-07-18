use turbo_tasks::primitives::StringVc;
use turbopack_core::{
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use crate::references;

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug)]
pub struct UrlAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl UrlAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::cell(UrlAssetReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for UrlAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> anyhow::Result<ResolveResultVc> {
        let context_path = self.context.context_path();
        let options = self.context.resolve_options();
        let result = self
            .context
            .resolve_asset(context_path, self.request, options);

        references::handle_resolve_error(result, context_path, self.request).await
    }

    #[turbo_tasks::function]
    async fn description(&self) -> anyhow::Result<StringVc> {
        Ok(StringVc::cell(format!(
            "url {}",
            self.request.to_string().await?,
        )))
    }
}
