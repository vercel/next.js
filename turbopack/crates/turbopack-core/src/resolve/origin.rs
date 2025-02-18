use std::future::Future;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Upcast, Value, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{options::ResolveOptions, parse::Request, ModuleResolveResult};
use crate::{context::AssetContext, module::OptionModule, reference_type::ReferenceType};

/// A location where resolving can occur from. It carries some meta information
/// that are needed for resolving from here.
#[turbo_tasks::value_trait]
pub trait ResolveOrigin {
    /// The origin path where resolving starts. This is pointing to a file,
    /// since that might be needed to infer custom resolving options for that
    /// specific file. But usually only the directory is relevant for the real
    /// resolving.
    fn origin_path(self: Vc<Self>) -> Vc<FileSystemPath>;

    /// The AssetContext that carries the configuration for building that
    /// subgraph.
    fn asset_context(self: Vc<Self>) -> Vc<Box<dyn AssetContext>>;

    /// Get an inner asset form this origin that doesn't require resolving but
    /// is directly attached
    fn get_inner_asset(self: Vc<Self>, request: Vc<Request>) -> Vc<OptionModule> {
        let _ = request;
        Vc::cell(None)
    }
}

// TODO it would be nice if these methods can be moved to the trait to allow
// overriding it, but currently we explicitly disallow it due to the way
// transitions work. Maybe transitions should be decorators on ResolveOrigin?
pub trait ResolveOriginExt: Send {
    /// Resolve to an asset from that origin. Custom resolve options can be
    /// passed. Otherwise provide `origin.resolve_options()` unmodified.
    fn resolve_asset(
        self: Vc<Self>,
        request: Vc<Request>,
        options: Vc<ResolveOptions>,
        reference_type: Value<ReferenceType>,
    ) -> impl Future<Output = Result<Vc<ModuleResolveResult>>> + Send;

    /// Get the resolve options that apply for this origin.
    fn resolve_options(self: Vc<Self>, reference_type: Value<ReferenceType>) -> Vc<ResolveOptions>;

    /// Adds a transition that is used for resolved assets.
    fn with_transition(self: ResolvedVc<Self>, transition: RcStr) -> Vc<Box<dyn ResolveOrigin>>;
}

impl<T> ResolveOriginExt for T
where
    T: ResolveOrigin + Upcast<Box<dyn ResolveOrigin>>,
{
    fn resolve_asset(
        self: Vc<Self>,
        request: Vc<Request>,
        options: Vc<ResolveOptions>,
        reference_type: Value<ReferenceType>,
    ) -> impl Future<Output = Result<Vc<ModuleResolveResult>>> + Send {
        resolve_asset(Vc::upcast(self), request, options, reference_type)
    }

    fn resolve_options(self: Vc<Self>, reference_type: Value<ReferenceType>) -> Vc<ResolveOptions> {
        self.asset_context()
            .resolve_options(self.origin_path(), reference_type)
    }

    fn with_transition(self: ResolvedVc<Self>, transition: RcStr) -> Vc<Box<dyn ResolveOrigin>> {
        Vc::upcast(
            ResolveOriginWithTransition {
                previous: ResolvedVc::upcast(self),
                transition,
            }
            .cell(),
        )
    }
}

async fn resolve_asset(
    resolve_origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    reference_type: Value<ReferenceType>,
) -> Result<Vc<ModuleResolveResult>> {
    if let Some(asset) = *resolve_origin.get_inner_asset(request).await? {
        return Ok(ModuleResolveResult::module(asset).cell());
    }
    Ok(resolve_origin
        .asset_context()
        .resolve()
        .await?
        .resolve_asset(
            resolve_origin.origin_path().resolve().await?,
            request.resolve().await?,
            options.resolve().await?,
            reference_type,
        ))
}

/// A resolve origin for some path and context without additional modifications.
#[turbo_tasks::value]
pub struct PlainResolveOrigin {
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    origin_path: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PlainResolveOrigin {
    #[turbo_tasks::function]
    pub fn new(
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        origin_path: ResolvedVc<FileSystemPath>,
    ) -> Vc<Self> {
        PlainResolveOrigin {
            asset_context,
            origin_path,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for PlainResolveOrigin {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        *self.origin_path
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        *self.asset_context
    }
}

/// Wraps a ResolveOrigin to add a transition.
#[turbo_tasks::value]
struct ResolveOriginWithTransition {
    previous: ResolvedVc<Box<dyn ResolveOrigin>>,
    transition: RcStr,
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for ResolveOriginWithTransition {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.previous.origin_path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        self.previous
            .asset_context()
            .with_transition(self.transition.clone())
    }

    #[turbo_tasks::function]
    fn get_inner_asset(&self, request: Vc<Request>) -> Vc<OptionModule> {
        self.previous.get_inner_asset(request)
    }
}
