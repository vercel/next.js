use anyhow::Result;
use turbo_tasks::{FxIndexSet, ResolvedVc, Vc};

use crate::{asset::Asset, ident::AssetIdent};

#[turbo_tasks::value(transparent)]
pub struct OptionOutputAsset(Option<ResolvedVc<Box<dyn OutputAsset>>>);

/// An asset that should be outputted, e. g. written to disk or served from a
/// server.
#[turbo_tasks::value_trait(local)]
pub trait OutputAsset: Asset {
    // TODO change this to path() -> Vc<FileSystemPath>
    /// The identifier of the [OutputAsset]. It's expected to be unique and
    /// capture all properties of the [OutputAsset]. Only path must be used.
    fn ident(&self) -> Vc<AssetIdent>;

    /// Other references [OutputAsset]s from this [OutputAsset].
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAssets::empty()
    }

    fn size_bytes(self: Vc<Self>) -> Vc<Option<u64>> {
        Vc::cell(None)
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssets(Vec<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_impl]
impl OutputAssets {
    #[turbo_tasks::function]
    pub fn new(assets: Vec<ResolvedVc<Box<dyn OutputAsset>>>) -> Vc<Self> {
        Vc::cell(assets)
    }

    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        let mut assets: FxIndexSet<_> = self.0.iter().copied().collect();
        assets.extend(other.await?.iter().copied());
        Ok(Vc::cell(assets.into_iter().collect()))
    }
}

impl OutputAssets {
    pub fn empty() -> Vc<Self> {
        Self::new(vec![])
    }

    pub fn empty_resolved() -> ResolvedVc<Self> {
        ResolvedVc::cell(vec![])
    }
}

/// A set of [OutputAsset]s
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsSet(FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>>);

// TODO All Vc::try_resolve_downcast::<Box<dyn OutputAsset>> calls should be
// removed
