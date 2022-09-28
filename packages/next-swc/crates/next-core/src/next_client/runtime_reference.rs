use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbopack::ecmascript::resolve::cjs_resolve;
use turbopack_core::{
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

#[turbo_tasks::value(shared)]
pub struct RuntimeAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl RuntimeAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::cell(RuntimeAssetReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for RuntimeAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for RuntimeAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "runtime {}",
            self.request.to_string().await?
        )))
    }
}
