use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::AssetVc,
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
    fn with_context_path(&self, path: FileSystemPathVc) -> AssetContextVc;
}
