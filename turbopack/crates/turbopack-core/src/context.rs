use anyhow::{bail, Result};
use turbo_tasks::{RcStr, Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};

use crate::{
    compile_time_info::CompileTimeInfo,
    module::Module,
    reference_type::ReferenceType,
    resolve::{options::ResolveOptions, parse::Request, ModuleResolveResult, ResolveResult},
    source::Source,
};

#[turbo_tasks::value(shared)]
pub enum ProcessResult {
    /// A module was created.
    Module(Vc<Box<dyn Module>>),

    /// Reference is ignored. This should lead to no module being included by
    /// the reference.
    Ignore,
}

#[turbo_tasks::value_impl]
impl ProcessResult {
    #[turbo_tasks::function]
    pub async fn module(&self) -> Result<Vc<Box<dyn Module>>> {
        match *self {
            ProcessResult::Module(m) => Ok(m),
            ProcessResult::Ignore => {
                bail!("Expected process result to be a module, but it was ignored")
            }
        }
    }
}

/// A context for building an asset graph. It's passed through the assets while
/// creating them. It's needed to resolve assets and upgrade assets to a higher
/// type (e. g. from FileSource to ModuleAsset).
#[turbo_tasks::value_trait]
pub trait AssetContext {
    /// Gets the compile time info of the asset context.
    fn compile_time_info(self: Vc<Self>) -> Vc<CompileTimeInfo>;

    /// Gets the layer of the asset context.
    fn layer(self: Vc<Self>) -> Vc<RcStr>;

    /// Gets the resolve options for a given path.
    fn resolve_options(
        self: Vc<Self>,
        origin_path: Vc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ResolveOptions>;

    /// Resolves an request to an [ModuleResolveResult].
    fn resolve_asset(
        self: Vc<Self>,
        origin_path: Vc<FileSystemPath>,
        request: Vc<Request>,
        resolve_options: Vc<ResolveOptions>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ModuleResolveResult>;

    /// Process a source into a module.
    fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ProcessResult>;

    /// Process an [ResolveResult] into an [ModuleResolveResult].
    fn process_resolve_result(
        self: Vc<Self>,
        result: Vc<ResolveResult>,
        reference_type: Value<ReferenceType>,
    ) -> Vc<ModuleResolveResult>;

    /// Gets a new AssetContext with the transition applied.
    fn with_transition(self: Vc<Self>, transition: RcStr) -> Vc<Box<dyn AssetContext>>;

    fn side_effect_free_packages(self: Vc<Self>) -> Vc<Glob>;
}
