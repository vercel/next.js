use std::future::Future;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Upcast, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{ModuleResolveResult, options::ResolveOptions, parse::Request};
use crate::{context::AssetContext, reference_type::ReferenceType};

/// A location where resolving can occur from. It carries some meta information
/// that are needed for resolving from here.
#[turbo_tasks::value_trait]
pub trait ResolveOrigin {
    /// The origin path where resolving starts. This is pointing to a file,
    /// since that might be needed to infer custom resolving options for that
    /// specific file. But usually only the directory is relevant for the real
    /// resolving.
    fn origin_path(&self) -> FileSystemPath;

    /// The AssetContext that carries the configuration for building that
    /// subgraph.
    fn asset_context(&self) -> ResolvedVc<Box<dyn AssetContext>>;

    /// Get the resolve options that apply for this origin.
    fn resolve_options(&self) -> Vc<ResolveOptions> {
        self.asset_context().resolve_options(self.origin_path())
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
        reference_type: ReferenceType,
    ) -> impl Future<Output = Result<Vc<ModuleResolveResult>>> + Send;

    /// Adds a transition that is used for resolved assets.
    fn with_transition(
        self: ResolvedVc<Self>,
        transition: RcStr,
    ) -> impl Future<Output = Result<Vc<Box<dyn ResolveOrigin>>>> + Send;
}

impl<T> ResolveOriginExt for T
where
    T: ResolveOrigin + Upcast<Box<dyn ResolveOrigin>>,
{
    async fn resolve_asset(
        self: Vc<Self>,
        request: Vc<Request>,
        options: Vc<ResolveOptions>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ModuleResolveResult>> {
        let origin = Vc::upcast_non_strict::<Box<dyn ResolveOrigin>>(self)
            .into_trait_ref()
            .await?;
        Ok(origin.asset_context().resolve_asset(
            origin.origin_path(),
            *request.to_resolved().await?,
            *options.to_resolved().await?,
            reference_type,
        ))
    }

    async fn with_transition(
        self: ResolvedVc<Self>,
        transition: RcStr,
    ) -> Result<Vc<Box<dyn ResolveOrigin>>> {
        let origin = Vc::upcast_non_strict::<Box<dyn ResolveOrigin>>(*self)
            .into_trait_ref()
            .await?;
        Ok(Vc::upcast(
            ResolveOriginWithTransition {
                origin_path: origin.origin_path(),
                asset_context: origin
                    .asset_context()
                    .with_transition(transition)
                    .to_resolved()
                    .await?,
            }
            .cell(),
        ))
    }
}

/// A resolve origin for some path and context without additional modifications.
#[turbo_tasks::value]
pub struct PlainResolveOrigin {
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    origin_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl PlainResolveOrigin {
    #[turbo_tasks::function]
    pub fn new(
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        origin_path: FileSystemPath,
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
    fn origin_path(&self) -> FileSystemPath {
        self.origin_path.clone()
    }

    fn asset_context(&self) -> ResolvedVc<Box<dyn AssetContext>> {
        self.asset_context
    }
}

/// Wraps a ResolveOrigin to add a transition.
///
/// The transition is applied to the wrapped origin's [`AssetContext`] eagerly at
/// construction (see [`ResolveOriginExt::with_transition`]) so that the trait
/// methods can be synchronous.
#[turbo_tasks::value]
struct ResolveOriginWithTransition {
    origin_path: FileSystemPath,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for ResolveOriginWithTransition {
    fn origin_path(&self) -> FileSystemPath {
        self.origin_path.clone()
    }

    fn asset_context(&self) -> ResolvedVc<Box<dyn AssetContext>> {
        self.asset_context
    }
}
