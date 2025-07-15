use anyhow::{Result, bail};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};

use crate::{
    compile_time_info::CompileTimeInfo,
    ident::Layer,
    issue::module::emit_unknown_module_type_error,
    module::{Module, OptionModule},
    reference_type::ReferenceType,
    resolve::{ModuleResolveResult, ResolveResult, options::ResolveOptions, parse::Request},
    source::Source,
};

#[turbo_tasks::value(shared)]
pub enum ProcessResult {
    /// A module was created.
    Module(ResolvedVc<Box<dyn Module>>),

    /// A module could not be created (according to the rules, e.g. no module type was assigned)
    Unknown(ResolvedVc<Box<dyn Source>>),

    /// Reference is ignored. This should lead to no module being included by
    /// the reference.
    Ignore,
}

#[turbo_tasks::value_impl]
impl ProcessResult {
    #[turbo_tasks::function]
    pub fn module(&self) -> Result<Vc<Box<dyn Module>>> {
        match *self {
            ProcessResult::Module(m) => Ok(*m),
            ProcessResult::Ignore => {
                bail!("Expected process result to be a module, but it was ignored")
            }
            ProcessResult::Unknown(_) => {
                bail!("Expected process result to be a module, but it could not be processed")
            }
        }
    }

    /// Unwrap the module, or return None and emit an issue
    #[turbo_tasks::function]
    pub async fn try_into_module(&self) -> Result<Vc<OptionModule>> {
        Ok(Vc::cell(match self {
            ProcessResult::Module(module) => Some(*module),
            ProcessResult::Unknown(source) => {
                emit_unknown_module_type_error(**source).await?;
                None
            }
            ProcessResult::Ignore => None,
        }))
    }
}

/// A context for building an asset graph. It's passed through the assets while
/// creating them. It's needed to resolve assets and upgrade assets to a higher
/// type (e. g. from FileSource to ModuleAsset).
#[turbo_tasks::value_trait]
pub trait AssetContext {
    /// Gets the compile time info of the asset context.
    #[turbo_tasks::function]
    fn compile_time_info(self: Vc<Self>) -> Vc<CompileTimeInfo>;

    /// Gets the layer of the asset context.
    fn layer(&self) -> Layer;

    /// Gets the resolve options for a given path.
    #[turbo_tasks::function]
    fn resolve_options(
        self: Vc<Self>,
        origin_path: FileSystemPath,
        reference_type: ReferenceType,
    ) -> Vc<ResolveOptions>;

    /// Resolves an request to an [ModuleResolveResult].
    #[turbo_tasks::function]
    fn resolve_asset(
        self: Vc<Self>,
        origin_path: FileSystemPath,
        request: Vc<Request>,
        resolve_options: Vc<ResolveOptions>,
        reference_type: ReferenceType,
    ) -> Vc<ModuleResolveResult>;

    /// Process a source into a module.
    #[turbo_tasks::function]
    fn process(
        self: Vc<Self>,
        asset: Vc<Box<dyn Source>>,
        reference_type: ReferenceType,
    ) -> Vc<ProcessResult>;

    /// Process an [ResolveResult] into an [ModuleResolveResult].
    #[turbo_tasks::function]
    fn process_resolve_result(
        self: Vc<Self>,
        result: Vc<ResolveResult>,
        reference_type: ReferenceType,
    ) -> Vc<ModuleResolveResult>;

    /// Gets a new AssetContext with the transition applied.
    #[turbo_tasks::function]
    fn with_transition(self: Vc<Self>, transition: RcStr) -> Vc<Box<dyn AssetContext>>;

    #[turbo_tasks::function]
    fn side_effect_free_packages(self: Vc<Self>) -> Vc<Glob>;
}
