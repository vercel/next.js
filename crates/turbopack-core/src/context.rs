use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    asset::AssetVc,
    environment::EnvironmentVc,
    resolve::{options::ResolveOptionsVc, parse::RequestVc, ResolveResultVc},
};

/// A context for building an asset graph. It's passed through the assets while
/// creating them. It's needed to resolve assets and upgrade assets to a higher
/// type (e. g. from SourceAsset to ModuleAsset).
#[turbo_tasks::value_trait]
pub trait AssetContext {
    fn environment(&self) -> EnvironmentVc;
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
    fn with_environment(&self, environment: EnvironmentVc) -> AssetContextVc;
    fn with_transition(&self, transition: &str) -> AssetContextVc;
}
