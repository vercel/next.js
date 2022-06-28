use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::AssetVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{options::ResolveOptionsVc, parse::RequestVc, ResolveResultVc},
};

#[turbo_tasks::value_trait]
pub trait AssetContext {
    fn context_path(&self) -> FileSystemPathVc;
    fn resolve_options(&self) -> ResolveOptionsVc;
    fn resolve_asset(
        &self,
        context_path: FileSystemPathVc,
        request: RequestVc,
        resolve_options: ResolveOptionsVc,
    ) -> ResolveResultVc;
    fn process(&self, asset: AssetVc) -> AssetVc;
    fn process_resolve_result(&self, result: ResolveResultVc) -> ResolveResultVc;
    fn with_context_path(&self, path: FileSystemPathVc) -> AssetContextVc;
}

#[turbo_tasks::value(AssetReference)]
pub struct ContextProcessedAssetReference {
    context: AssetContextVc,
    reference: AssetReferenceVc,
}

#[turbo_tasks::value_impl]
impl ContextProcessedAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, reference: AssetReferenceVc) -> Self {
        Self::slot(ContextProcessedAssetReference { context, reference })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ContextProcessedAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        self.context
            .process_resolve_result(self.reference.resolve_reference())
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.reference.description()
    }
}
