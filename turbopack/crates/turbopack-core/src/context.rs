use anyhow::{bail, Result};
use turbo_tasks::{RcStr, Value, Vc};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};

use crate::{
    compile_time_info::CompileTimeInfo,
    issue::{module::ModuleIssue, IssueExt, StyledString},
    module::{Module, OptionModule},
    reference_type::ReferenceType,
    resolve::{options::ResolveOptions, parse::Request, ModuleResolveResult, ResolveResult},
    source::Source,
};

#[turbo_tasks::value(shared)]
pub enum ProcessResult {
    /// A module was created.
    Module(Vc<Box<dyn Module>>),

    /// A module could not be created (according to the rules, e.g. no module type as assigned)
    Unknown(Vc<Box<dyn Source>>),

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
                ProcessResult::emit_unknown_error(*source).await?;
                None
            }
            ProcessResult::Ignore => None,
        }))
    }

    #[turbo_tasks::function]
    pub fn emit_unknown_error(source: Vc<Box<dyn Source>>) {
        ModuleIssue {
            ident: source.ident(),
            title: StyledString::Text("Unknown module type".into()).cell(),
            description: StyledString::Text(
                r"This module doesn't have an associated type. Use a known file extension, or register a loader for it.

    Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders".into(),
            )
            .cell(),
        }
        .cell()
        .emit();
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
        origin_path: Vc<FileSystemPath>,
        result: Vc<ResolveResult>,
        reference_type: Value<ReferenceType>,
        ignore_unknown: bool,
    ) -> Vc<ModuleResolveResult>;

    /// Gets a new AssetContext with the transition applied.
    fn with_transition(self: Vc<Self>, transition: RcStr) -> Vc<Box<dyn AssetContext>>;

    fn side_effect_free_packages(self: Vc<Self>) -> Vc<Glob>;
}
