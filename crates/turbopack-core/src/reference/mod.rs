use std::collections::{HashSet, VecDeque};

use anyhow::Result;
use turbo_tasks::{
    graph::{AdjacencyMap, GraphTraversal},
    TryJoinIterExt, ValueToString, Vc,
};

use crate::{
    asset::Asset,
    issue::IssueContextExt,
    module::{convert_asset_to_module, Module, Modules},
    output::{OutputAsset, OutputAssets},
    resolve::{PrimaryResolveResult, ResolveResult},
};
pub mod source_map;

pub use source_map::SourceMapReference;

/// A reference to one or multiple [Asset]s or other special things.
/// There are a bunch of optional traits that can influence how these references
/// are handled. e. g. [ChunkableModuleReference]
///
/// [Asset]: crate::asset::Asset
/// [ChunkableModuleReference]: crate::chunk::ChunkableModuleReference
#[turbo_tasks::value_trait]
pub trait AssetReference: ValueToString {
    fn resolve_reference(self: Vc<Self>) -> Vc<ResolveResult>;
    // TODO think about different types
    // fn kind(&self) -> Vc<AssetReferenceType>;
}

/// Multiple [AssetReference]s
#[turbo_tasks::value(transparent)]
pub struct AssetReferences(Vec<Vc<Box<dyn AssetReference>>>);

#[turbo_tasks::value_impl]
impl AssetReferences {
    /// An empty list of [AssetReference]s
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(Vec::new())
    }
}

/// A reference that always resolves to a single asset.
#[turbo_tasks::value]
pub struct SingleAssetReference {
    asset: Vc<Box<dyn Asset>>,
    description: Vc<String>,
}

impl SingleAssetReference {
    /// Returns the asset that this reference resolves to.
    pub fn asset_ref(&self) -> Vc<Box<dyn Asset>> {
        self.asset
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for SingleAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ResolveResult> {
        ResolveResult::asset(self.asset).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for SingleAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<String> {
        self.description
    }
}

#[turbo_tasks::value_impl]
impl SingleAssetReference {
    /// Create a new [Vc<SingleAssetReference>] that resolves to the given
    /// asset.
    #[turbo_tasks::function]
    pub fn new(asset: Vc<Box<dyn Asset>>, description: Vc<String>) -> Vc<Self> {
        Self::cell(SingleAssetReference { asset, description })
    }

    /// The [Vc<Box<dyn Asset>>] that this reference resolves to.
    #[turbo_tasks::function]
    pub async fn asset(self: Vc<Self>) -> Result<Vc<Box<dyn Asset>>> {
        Ok(self.await?.asset)
    }
}

/// Aggregates all [Asset]s referenced by an [Asset]. [AssetReference]
/// This does not include transitively references [Asset]s, but it includes
/// primary and secondary [Asset]s referenced.
///
/// [Asset]: crate::asset::Asset
#[turbo_tasks::function]
pub async fn all_referenced_modules(module: Vc<Box<dyn Module>>) -> Result<Vc<Modules>> {
    let references_set = module.references().await?;
    let mut assets = Vec::new();
    let mut queue = VecDeque::with_capacity(32);
    for reference in references_set.iter() {
        queue.push_back(reference.resolve_reference());
    }
    // that would be non-deterministic:
    // while let Some(result) = race_pop(&mut queue).await {
    // match &*result? {
    while let Some(resolve_result) = queue.pop_front() {
        let ResolveResult {
            primary,
            references,
        } = &*resolve_result.await?;
        for result in primary {
            if let PrimaryResolveResult::Asset(asset) = *result {
                assets.push(asset);
            }
        }
        for reference in references {
            queue.push_back(reference.resolve_reference());
        }
    }
    let modules = assets.into_iter().map(convert_asset_to_module).collect();
    Ok(Vc::cell(modules))
}

/// Aggregates all primary [Module]s referenced by an [Module]. [AssetReference]
/// This does not include transitively references [Module]s, only includes
/// primary [Module]s referenced.
///
/// [Module]: crate::module::Module
#[turbo_tasks::function]
pub async fn primary_referenced_modules(module: Vc<Box<dyn Module>>) -> Result<Vc<Modules>> {
    let modules = module
        .references()
        .await?
        .iter()
        .map(|reference| async {
            let ResolveResult { primary, .. } = &*reference.resolve_reference().await?;
            Ok(primary
                .iter()
                .filter_map(|result| {
                    if let PrimaryResolveResult::Asset(asset) = *result {
                        Some(asset)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>())
        })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .map(|asset| async move { Ok(Vc::try_resolve_downcast::<Box<dyn Module>>(asset).await?) })
        .try_join()
        .await?
        .into_iter()
        .flatten()
        .collect();
    Ok(Vc::cell(modules))
}

/// Aggregates all [Module]s referenced by an [Module] including transitively
/// referenced [Module]s. This basically gives all [Module]s in a subgraph
/// starting from the passed [Module].
#[turbo_tasks::function]
pub async fn all_modules(asset: Vc<Box<dyn Module>>) -> Result<Vc<Modules>> {
    // TODO need to track import path here
    let mut queue = VecDeque::with_capacity(32);
    queue.push_back((asset, all_referenced_modules(asset)));
    let mut assets = HashSet::new();
    assets.insert(asset);
    while let Some((parent, references)) = queue.pop_front() {
        let references = references
            .issue_context(parent.ident().path(), "expanding references of asset")
            .await?;
        for asset in references.await?.iter() {
            if assets.insert(*asset) {
                queue.push_back((*asset, all_referenced_modules(*asset)));
            }
        }
    }
    Ok(Vc::cell(assets.into_iter().collect()))
}

/// Walks the asset graph from multiple assets and collect all referenced
/// assets.
#[turbo_tasks::function]
pub async fn all_assets_from_entries(entries: Vc<OutputAssets>) -> Result<Vc<OutputAssets>> {
    Ok(Vc::cell(
        AdjacencyMap::new()
            .skip_duplicates()
            .visit(
                entries.await?.iter().copied().map(Vc::upcast),
                get_referenced_assets,
            )
            .await
            .completed()?
            .into_inner()
            .into_reverse_topological()
            .collect(),
    ))
}

/// Computes the list of all chunk children of a given chunk.
pub async fn get_referenced_assets(
    asset: Vc<Box<dyn OutputAsset>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn OutputAsset>>> + Send> {
    Ok(asset
        .references()
        .await?
        .iter()
        .copied()
        .collect::<Vec<_>>()
        .into_iter())
}
