use anyhow::Result;
use either::Either;
use tracing::{Level, Span};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    graph::{AdjacencyMap, GraphTraversal, Visit, VisitControlFlow},
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
            referenced_assets: OutputAssets::empty_resolved(),
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

/// A set of [OutputAsset]s
#[turbo_tasks::value(transparent)]
pub struct OutputAssetsSet(FxIndexSet<ResolvedVc<Box<dyn OutputAsset>>>);

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct OutputAssetsWithReferenced {
    pub assets: ResolvedVc<OutputAssets>,
    pub referenced_assets: ResolvedVc<OutputAssets>,
    pub references: ResolvedVc<OutputAssetsReferences>,
}

impl OutputAssetsWithReferenced {
    /// Returns all assets, including referenced assets and nested assets.
    pub fn all_assets(self: Vc<Self>) -> Vc<OutputAssets> {
        self.expand_assets(true)
    }

    /// Returns only direct referenced assets and does not include assets referenced indirectly by
    /// them.
    pub fn direct_assets(self: Vc<Self>) -> Vc<OutputAssets> {
        self.expand_assets(false)
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
        Ok(Self {
            assets: self
                .assets
                .concatenate(*other.await?.assets)
                .to_resolved()
                .await?,
            referenced_assets: self
                .referenced_assets
                .concatenate(*other.await?.referenced_assets)
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

    #[turbo_tasks::function]
    async fn expand_assets(&self, inner_output_assets: bool) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(
            expand_output_assets(
                self.assets
                    .await?
                    .into_iter()
                    .chain(self.referenced_assets.await?.into_iter())
                    .map(|&asset| ExpandOutputAssetsInput::Asset(asset))
                    .chain(
                        self.references
                            .await?
                            .into_iter()
                            .map(|&reference| ExpandOutputAssetsInput::Reference(reference)),
                    ),
                inner_output_assets,
            )
            .await?,
        ))
    }

    #[turbo_tasks::function]
    pub fn assets(&self) -> Vc<OutputAssets> {
        *self.assets
    }

    #[turbo_tasks::function]
    pub async fn referenced_assets(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(
            expand_output_assets(
                self.referenced_assets
                    .await?
                    .into_iter()
                    .copied()
                    .map(ExpandOutputAssetsInput::Asset)
                    .chain(
                        self.references
                            .await?
                            .into_iter()
                            .copied()
                            .map(ExpandOutputAssetsInput::Reference),
                    ),
                false,
            )
            .await?,
        ))
    }
}

struct OutputAssetVisit {
    emit_spans: bool,
    inner_output_assets: bool,
}
impl Visit<(ExpandOutputAssetsInput, Option<ReadRef<RcStr>>)> for OutputAssetVisit {
    type Edge = (ExpandOutputAssetsInput, Option<ReadRef<RcStr>>);
    type EdgesIntoIter = Vec<Self::Edge>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<Self::Edge> {
        VisitControlFlow::Continue(edge)
    }

    fn edges(
        &mut self,
        node: &(ExpandOutputAssetsInput, Option<ReadRef<RcStr>>),
    ) -> Self::EdgesFuture {
        get_referenced_assets(self.emit_spans, self.inner_output_assets, node.0)
    }

    fn span(&mut self, node: &(ExpandOutputAssetsInput, Option<ReadRef<RcStr>>)) -> tracing::Span {
        if let Some(ident) = &node.1 {
            tracing::trace_span!("asset", name = display(ident))
        } else {
            Span::current()
        }
    }
}

/// Computes the list of all chunk children of a given chunk.
async fn get_referenced_assets(
    emit_spans: bool,
    inner_output_assets: bool,
    input: ExpandOutputAssetsInput,
) -> Result<Vec<(ExpandOutputAssetsInput, Option<ReadRef<RcStr>>)>> {
    let refs = match input {
        ExpandOutputAssetsInput::Asset(output_asset) => {
            if !inner_output_assets {
                return Ok(vec![]);
            }
            output_asset.references().await?
        }
        ExpandOutputAssetsInput::Reference(reference) => reference.references().await?,
    };
    let assets = refs
        .assets
        .await?
        .into_iter()
        .chain(refs.referenced_assets.await?.into_iter());
    let assets = if emit_spans {
        Either::Left(
            assets
                .map(async |&asset| {
                    Ok((
                        ExpandOutputAssetsInput::Asset(asset),
                        // INVALIDATION: we don't need to invalidate when the span name changes
                        Some(asset.path_string().untracked().await?),
                    ))
                })
                .try_join()
                .await?
                .into_iter(),
        )
    } else {
        Either::Right(assets.map(|&asset| (ExpandOutputAssetsInput::Asset(asset), None)))
    };
    Ok(assets
        .chain(
            refs.references
                .await?
                .into_iter()
                .map(|&reference| (ExpandOutputAssetsInput::Reference(reference), None)),
        )
        .collect())
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
    let emit_spans = tracing::enabled!(Level::INFO);
    let inputs = if emit_spans {
        let inputs = inputs
            .map(async |asset| {
                Ok((
                    asset,
                    match &asset {
                        ExpandOutputAssetsInput::Asset(output_asset) => {
                            // INVALIDATION: we don't need to invalidate when the span name changes
                            Some(output_asset.path_string().untracked().await?)
                        }
                        ExpandOutputAssetsInput::Reference(_) => None,
                    },
                ))
            })
            .try_join()
            .await?;
        Either::Left(inputs.into_iter())
    } else {
        Either::Right(inputs.map(|asset| (asset, None)))
    };
    let edges = AdjacencyMap::new()
        .skip_duplicates()
        .visit(
            inputs,
            OutputAssetVisit {
                emit_spans,
                inner_output_assets,
            },
        )
        .await
        .completed()?
        .into_inner()
        .into_postorder_topological();

    let mut assets = Vec::new();
    for (input, _) in edges {
        match input {
            ExpandOutputAssetsInput::Asset(asset) => {
                assets.push(asset);
            }
            ExpandOutputAssetsInput::Reference(_) => {}
        }
    }

    Ok(assets)
}
