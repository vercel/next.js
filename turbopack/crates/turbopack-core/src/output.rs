use anyhow::Result;
use either::Either;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ResolvedVc, ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};
use turbo_tasks_fs::FileSystemPath;

use crate::asset::Asset;

#[turbo_tasks::value(transparent)]
pub struct OptionOutputAsset(Option<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_trait]
pub trait OutputAssetsReference {
    /// References to other [`OutputAsset`]s from this [`OutputAssetsReference`].
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssetsWithReferenced> {
        OutputAssetsWithReferenced {
            assets: OutputAssets::empty_resolved(),
            referenced_assets: OutputAssets::empty_resolved(),
            references: OutputAssetsReferences::empty_resolved(),
        }
        .cell()
    }
}

/// An asset that should be outputted, e. g. written to disk or served from a server.
///
/// For documentation about where this is used and how it fits into the rest of Turbopack, see
/// [`crate::_layers`].
#[turbo_tasks::value_trait]
pub trait OutputAsset: Asset + OutputAssetsReference {
    /// The identifier of the [OutputAsset]. It's expected to be unique and
    /// capture all properties of the [OutputAsset].
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath>;

    /// The identifier of the [OutputAsset] as string. It's expected to be unique and
    /// capture all properties of the [OutputAsset].
    #[turbo_tasks::function]
    fn path_string(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssetsReferences(Vec<ResolvedVc<Box<dyn OutputAssetsReference>>>);

#[turbo_tasks::value_impl]
impl OutputAssetsReferences {
    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        let mut references: FxIndexSet<_> = self.0.iter().copied().collect();
        references.extend(turbo_tasks::read!(other)?.iter().copied());
        Ok(Vc::cell(references.into_iter().collect()))
    }
}
impl OutputAssetsReferences {
    pub fn empty() -> Vc<Self> {
        Vc::cell(vec![])
    }

    pub fn empty_resolved() -> ResolvedVc<Self> {
        ResolvedVc::cell(vec![])
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssets(Vec<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_impl]
impl OutputAssets {
    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        let mut assets: FxIndexSet<_> = self.0.iter().copied().collect();
        assets.extend(turbo_tasks::read!(other)?.iter().copied());
        Ok(Vc::cell(assets.into_iter().collect()))
    }

    #[turbo_tasks::function]
    pub async fn concat_asset(&self, asset: ResolvedVc<Box<dyn OutputAsset>>) -> Result<Vc<Self>> {
        let mut assets: FxIndexSet<_> = self.0.iter().copied().collect();
        assets.extend([asset]);
        Ok(Vc::cell(assets.into_iter().collect()))
    }

    #[turbo_tasks::function]
    pub async fn concat(other: Vec<Vc<Self>>) -> Result<Vc<Self>> {
        let mut assets: FxIndexSet<_> = FxIndexSet::default();
        for other in other {
            assets.extend(turbo_tasks::read!(other)?.iter().copied());
        }
        Ok(Vc::cell(assets.into_iter().collect()))
    }
}

impl OutputAssets {
    pub fn empty() -> Vc<Self> {
        Vc::cell(vec![])
    }

    pub fn empty_resolved() -> ResolvedVc<Self> {
        ResolvedVc::cell(vec![])
    }
}

#[turbo_tasks::value(transparent)]
pub struct ExpandedOutputAssets(Vec<ResolvedVc<Box<dyn OutputAsset>>>);

/// A set of [OutputAsset]s
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsSet(
    #[bincode(with = "turbo_bincode::indexset")] FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>>,
);

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct OutputAssetsWithReferenced {
    /// Primary output assets. These are e. g. the chunks needed for a chunk group.
    pub assets: ResolvedVc<OutputAssets>,
    /// Secondary output assets that are referenced by the primary assets.
    pub referenced_assets: ResolvedVc<OutputAssets>,
    /// Secondary output assets that are referenced by the primary assets. These are unresolved
    /// `OutputAssetsReference`s and need to be expanded to get the actual assets. These are e. g.
    /// async loaders that reference other chunk groups.
    pub references: ResolvedVc<OutputAssetsReferences>,
}

impl OutputAssetsWithReferenced {
    turbo_tasks::dual_fn! {
    fn expand_assets(
        &self,
        inner_output_assets: bool,
    ) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
        turbo_tasks::read!(expand_output_assets(
            turbo_tasks::read!(self.assets)?
                .into_iter()
                .chain(turbo_tasks::read!(self.referenced_assets)?)
                .map(ExpandOutputAssetsInput::Asset)
                .chain(
                    turbo_tasks::read!(self.references)?
                        .into_iter()
                        .map(ExpandOutputAssetsInput::Reference),
                ),
            inner_output_assets,
        ))
    }
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsWithReferenced {
    #[turbo_tasks::function]
    pub fn from_assets(assets: ResolvedVc<OutputAssets>) -> Vc<Self> {
        OutputAssetsWithReferenced {
            assets,
            referenced_assets: OutputAssets::empty_resolved(),
            references: OutputAssetsReferences::empty_resolved(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        let other = turbo_tasks::read!(other)?;
        Ok(Self {
            assets: turbo_tasks::read!(self.assets.concatenate(*other.assets).to_resolved())?,
            referenced_assets: turbo_tasks::read!(
                self.referenced_assets
                    .concatenate(*other.referenced_assets)
                    .to_resolved()
            )?,
            references: turbo_tasks::read!(
                self.references.concatenate(*other.references).to_resolved()
            )?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn concatenate_asset(
        &self,
        asset: ResolvedVc<Box<dyn OutputAsset>>,
    ) -> Result<Vc<Self>> {
        Ok(Self {
            assets: turbo_tasks::read!(self.assets.concat_asset(*asset).to_resolved())?,
            referenced_assets: self.referenced_assets,
            references: self.references,
        }
        .cell())
    }

    /// Returns all assets, including referenced assets and nested assets.
    #[turbo_tasks::function]
    pub async fn expand_all_assets(&self) -> Result<Vc<ExpandedOutputAssets>> {
        Ok(Vc::cell(turbo_tasks::read!(self.expand_assets(true))?))
    }

    /// Returns only direct referenced assets and does not include assets referenced indirectly by
    /// them.
    #[turbo_tasks::function]
    pub async fn all_assets(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(turbo_tasks::read!(self.expand_assets(false))?))
    }

    /// Returns only primary asset entries. Doesn't expand OutputAssets. Doesn't return referenced
    /// assets.
    #[turbo_tasks::function]
    pub fn primary_assets(&self) -> Vc<OutputAssets> {
        *self.assets
    }

    /// Returns only secondary referenced asset entries. Doesn't expand OutputAssets. Doesn't return
    /// primary assets.
    #[turbo_tasks::function]
    pub async fn referenced_assets(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(turbo_tasks::read!(expand_output_assets(
            turbo_tasks::read!(self.referenced_assets)?
                .into_iter()
                .map(ExpandOutputAssetsInput::Asset)
                .chain(
                    turbo_tasks::read!(self.references)?
                        .into_iter()
                        .map(ExpandOutputAssetsInput::Reference),
                ),
            false,
        ))?))
    }
}

turbo_tasks::dual_fn! {
/// Computes the list of all chunk children of a given chunk.
fn get_referenced_assets(
    inner_output_assets: bool,
    input: ExpandOutputAssetsInput,
) -> Result<impl Iterator<Item = ExpandOutputAssetsInput>> {
    let refs = match input {
        ExpandOutputAssetsInput::Asset(output_asset) => {
            if !inner_output_assets {
                return Ok(Either::Left(std::iter::empty()));
            }
            turbo_tasks::read!(output_asset.references())?
        }
        ExpandOutputAssetsInput::Reference(reference) => turbo_tasks::read!(reference.references())?,
    };
    let assets = turbo_tasks::read!(refs
        .assets)?
        .into_iter()
        .chain(turbo_tasks::read!(refs.referenced_assets)?)
        .map(ExpandOutputAssetsInput::Asset)
        .chain(
            turbo_tasks::read!(refs.references)?
                .into_iter()
                .map(ExpandOutputAssetsInput::Reference),
        );
    Ok(Either::Right(assets))
}
}

#[derive(PartialEq, Eq, Hash, Clone, Copy)]
pub enum ExpandOutputAssetsInput {
    Asset(ResolvedVc<Box<dyn OutputAsset>>),
    Reference(ResolvedVc<Box<dyn OutputAssetsReference>>),
}

turbo_tasks::dual_fn! {
pub fn expand_output_assets(
    inputs: impl Iterator<Item = ExpandOutputAssetsInput>,
    inner_output_assets: bool,
) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
    let edges = turbo_tasks::read!(AdjacencyMap::new()
        .visit(inputs, |input| get_referenced_assets(
            inner_output_assets,
            input
        )))
        .completed()?
        .into_postorder_topological();

    let mut assets = Vec::new();
    for input in edges {
        match input {
            ExpandOutputAssetsInput::Asset(asset) => {
                assets.push(asset);
            }
            ExpandOutputAssetsInput::Reference(_) => {}
        }
    }

    Ok(assets)
}
}
