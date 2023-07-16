use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    compile_time_info::CompileTimeInfo,
    module::Module,
    reference_type::ReferenceType,
    resolve::{options::ResolveOptions, parse::Request, ResolveResult},
    source::Source,
};

/// A context for building an asset graph. It's passed through the assets while
/// creating them. It's needed to resolve assets and upgrade assets to a higher
/// type (e. g. from FileSource to ModuleAsset).
#[turbo_tasks::value_trait]
pub trait AssetContext {
    fn compile_time_info(self: Vc<Self>) -> Vc<CompileTimeInfo>;
    fn resolve_options(
        self: Vc<Self>,
        origin_path: Vc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ResolveOptions>;
    fn resolve_asset(
        self: Vc<Self>,
        origin_path: Vc<FileSystemPath>,
        request: Vc<Request>,
        resolve_options: Vc<ResolveOptions>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ResolveResult>;
    fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<Box<dyn Module>>;
    fn process_resolve_result(
        self: Vc<Self>,
        result: Vc<ResolveResult>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ResolveResult>;
    fn with_transition(self: Vc<Self>, transition: String) -> Vc<Box<dyn AssetContext>>;
}
