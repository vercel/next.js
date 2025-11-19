use anyhow::Result;
use either::Either;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal},
};
use turbo_tasks_fs::FileSystemPath;

use crate::asset::Asset;

#[turbo_tasks::value(transparent)]
pub struct OptionOutputAsset(Option<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_trait]
pub trait OutputAssetsReference {
    /// References to other [OutputAsset]s from this [OutputAssetReference].
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssetsWithReferenced> {
        OutputAssetsWithReferenced {
            assets: OutputAssets::empty_resolved(),
            references: OutputAssetsReferences::empty_resolved(),
        }
        .cell()
    }
}

/// An asset that should be outputted, e. g. written to disk or served from a
/// server.
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

    #[turbo_tasks::function]
    fn size_bytes(self: Vc<Self>) -> Vc<Option<u64>> {
        Vc::cell(None)
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssetsReferences(Vec<ResolvedVc<Box<dyn OutputAssetsReference>>>);

#[turbo_tasks::value_impl]
impl OutputAssetsReferences {
    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        let mut references: FxIndexSet<_> = self.0.iter().copied().collect();
        references.extend(other.await?.iter().copied());
        Ok(Vc::cell(references.into_iter().collect()))
    }

    /// Returns only direct referenced assets and does not include assets referenced indirectly by
    /// them.
    #[turbo_tasks::function]
    pub async fn all_assets(&self) -> Result<Vc<OutputAssets>> {
        let mut assets: FxIndexSet<_> = FxIndexSet::default();
        for reference in &self.0 {
            assets.extend(
                reference
                    .references()
                    .all_assets()
                    .await?
                    .into_iter()
                    .copied(),
            );
        }
        Ok(Vc::cell(assets.into_iter().collect()))
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

#[turbo_tasks::value_impl]
impl OutputAssetsReference for OutputAssetsReferences {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let refs_references = self
            .await?
            .into_iter()
            .map(async |&reference| reference.references().await)
            .try_join()
            .await?;
        let mut assets = Vec::new();
        let mut references = Vec::new();
        for r in refs_references {
            assets.extend(r.assets.await?.iter().copied());
            references.extend(r.references.await?.iter().copied());
        }
        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(assets),
            references: ResolvedVc::cell(references),
        }
        .cell())
    }
}

#[turbo_tasks::value(transparent)]
pub struct OutputAssets(Vec<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value_impl]
impl OutputAssets {
    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        let mut assets: FxIndexSet<_> = self.0.iter().copied().collect();
        assets.extend(other.await?.iter().copied());
        Ok(Vc::cell(assets.into_iter().collect()))
    }

    #[turbo_tasks::function]
    pub async fn concat(other: Vec<Vc<Self>>) -> Result<Vc<Self>> {
        let mut assets: FxIndexSet<_> = FxIndexSet::default();
        for other in other {
            assets.extend(other.await?.iter().copied());
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

#[turbo_tasks::value_impl]
impl OutputAssetsReference for OutputAssets {
    #[turbo_tasks::function]
    fn references(self: ResolvedVc<Self>) -> Vc<OutputAssetsWithReferenced> {
        OutputAssetsWithReferenced {
            assets: self,
            references: OutputAssetsReferences::empty_resolved(),
        }
        .cell()
    }
}

#[turbo_tasks::value(transparent)]
pub struct ExpandedOutputAssets(Vec<ResolvedVc<Box<dyn OutputAsset>>>);

/// A set of [OutputAsset]s
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsSet(FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct OutputAssetsWithReferenced {
    /// Primary output assets. These are e. g. the chunks needed for a chunk group.
    pub assets: ResolvedVc<OutputAssets>,
    /// Secondary output assets that are referenced by the primary assets. These are unresolved
    /// `OutputAssetsReference`s and need to be expanded to get the actual assets. These are e. g.
    /// async loaders that reference other chunk groups.
    pub references: ResolvedVc<OutputAssetsReferences>,
}

impl OutputAssetsWithReferenced {
    async fn expand_assets(
        &self,
        inner_output_assets: bool,
    ) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
        expand_output_assets(
            self.assets
                .await?
                .into_iter()
                .map(|&asset| ExpandOutputAssetsInput::Asset(asset))
                .chain(
                    self.references
                        .await?
                        .into_iter()
                        .map(|&reference| ExpandOutputAssetsInput::Reference(reference)),
                ),
            inner_output_assets,
        )
        .await
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsWithReferenced {
    #[turbo_tasks::function]
    pub fn from_assets(assets: ResolvedVc<OutputAssets>) -> Vc<Self> {
        OutputAssetsWithReferenced {
            assets,
            references: OutputAssetsReferences::empty_resolved(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn concatenate(&self, other: Vc<Self>) -> Result<Vc<Self>> {
        Ok(Self {
            assets: self
                .assets
                .concatenate(*other.await?.assets)
                .to_resolved()
                .await?,
            references: self
                .references
                .concatenate(*other.await?.references)
                .to_resolved()
                .await?,
        }
        .cell())
    }

    /// Returns all assets, including referenced assets and nested assets.
    #[turbo_tasks::function]
    pub async fn expand_all_assets(&self) -> Result<Vc<ExpandedOutputAssets>> {
        Ok(Vc::cell(self.expand_assets(true).await?))
    }

    /// Returns only direct referenced assets and does not include assets referenced indirectly by
    /// them.
    #[turbo_tasks::function]
    pub async fn all_assets(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(self.expand_assets(false).await?))
    }

    /// Returns only primary asset entries. Doesn't expand OutputAssets. Doesn't return referenced
    /// assets.
    #[turbo_tasks::function]
    pub fn primary_assets(&self) -> Vc<OutputAssets> {
        *self.assets
    }

    /// Returns only secondary referenced asset entries. Doesn't return
    /// primary assets.
    #[turbo_tasks::function]
    pub fn references(&self) -> Vc<OutputAssetsReferences> {
        *self.references
    }
}

/// Computes the list of all chunk children of a given chunk.
async fn get_referenced_assets(
    inner_output_assets: bool,
    input: ExpandOutputAssetsInput,
) -> Result<impl Iterator<Item = ExpandOutputAssetsInput>> {
    let refs = match input {
        ExpandOutputAssetsInput::Asset(output_asset) => {
            if !inner_output_assets {
                return Ok(Either::Left(std::iter::empty()));
            }
            output_asset.references().await?
        }
        ExpandOutputAssetsInput::Reference(reference) => reference.references().await?,
    };
    let assets = refs
        .assets
        .await?
        .into_iter()
        .map(|&asset| ExpandOutputAssetsInput::Asset(asset))
        .chain(
            refs.references
                .await?
                .into_iter()
                .map(|&reference| ExpandOutputAssetsInput::Reference(reference)),
        );
    Ok(Either::Right(assets))
}

#[derive(PartialEq, Eq, Hash, Clone, Copy)]
pub enum ExpandOutputAssetsInput {
    Asset(ResolvedVc<Box<dyn OutputAsset>>),
    Reference(ResolvedVc<Box<dyn OutputAssetsReference>>),
}

pub async fn expand_output_assets(
    inputs: impl Iterator<Item = ExpandOutputAssetsInput>,
    inner_output_assets: bool,
) -> Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>> {
    let edges = AdjacencyMap::new()
        .skip_duplicates()
        .visit(inputs, async |input| {
            get_referenced_assets(inner_output_assets, input).await
        })
        .await
        .completed()?
        .into_inner()
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
