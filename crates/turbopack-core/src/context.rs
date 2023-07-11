use anyhow::Result;
use turbo_tasks::Value;
use turbo_tasks_fs::FileSystemPathVc;

use crate::{
    compile_time_info::CompileTimeInfoVc,
    module::ModuleVc,
    reference_type::ReferenceType,
    resolve::{options::ResolveOptionsVc, parse::RequestVc, ResolveResultVc},
    source::SourceVc,
};

/// A context for building an asset graph. It's passed through the assets while
/// creating them. It's needed to resolve assets and upgrade assets to a higher
/// type (e. g. from FileSource to ModuleAsset).
#[turbo_tasks::value_trait]
pub trait AssetContext {
    fn compile_time_info(&self) -> CompileTimeInfoVc;
    fn resolve_options(
        &self,
        origin_path: FileSystemPathVc,
        reference_type: Value<ReferenceType>,
    ) -> ResolveOptionsVc;
    fn resolve_asset(
        &self,
        origin_path: FileSystemPathVc,
        request: RequestVc,
        resolve_options: ResolveOptionsVc,
        reference_type: Value<ReferenceType>,
    ) -> ResolveResultVc;
    fn process(&self, asset: SourceVc, reference_type: Value<ReferenceType>) -> ModuleVc;
    fn process_resolve_result(
        &self,
        result: ResolveResultVc,
        reference_type: Value<ReferenceType>,
    ) -> ResolveResultVc;
    fn with_transition(&self, transition: &str) -> AssetContextVc;
}
