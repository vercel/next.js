use std::iter::once;

use anyhow::Result;
use turbo_tasks::{
    graph::{GraphTraversal, ReverseTopological},
    primitives::{BoolVc, U64Vc},
    TryJoinIterExt, ValueToString,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use super::{ChunkableAssetReference, ChunkableAssetReferenceVc, ChunkingType};
use crate::{
    asset::{Asset, AssetVc, AssetsSetVc},
    reference::AssetReference,
};

/// Allows to gather information about which assets are already available.
/// Adding more roots will form a linked list like structure to allow caching
/// `include` queries.
#[turbo_tasks::value]
pub struct AvailableAssets {
    parent: Option<AvailableAssetsVc>,
    roots: Vec<AssetVc>,
}

#[turbo_tasks::value_impl]
impl AvailableAssetsVc {
    #[turbo_tasks::function]
    fn new_normalized(parent: Option<AvailableAssetsVc>, roots: Vec<AssetVc>) -> Self {
        AvailableAssets { parent, roots }.cell()
    }

    #[turbo_tasks::function]
    pub fn new(roots: Vec<AssetVc>) -> Self {
        Self::new_normalized(None, roots)
    }

    #[turbo_tasks::function]
    pub async fn with_roots(self, roots: Vec<AssetVc>) -> Result<Self> {
        let roots = roots
            .into_iter()
            .map(|root| async move { Ok((self.includes(root).await?, root)) })
            .try_join()
            .await?
            .into_iter()
            .filter_map(|(included, root)| (!*included).then_some(root))
            .collect();
        Ok(Self::new_normalized(Some(self), roots))
    }

    #[turbo_tasks::function]
    pub async fn hash(self) -> Result<U64Vc> {
        let this = self.await?;
        let mut hasher = Xxh3Hash64Hasher::new();
        if let Some(parent) = this.parent {
            hasher.write_value(parent.hash().await?);
        } else {
            hasher.write_value(0u64);
        }
        for root in &this.roots {
            hasher.write_value(root.ident().to_string().await?);
        }
        Ok(U64Vc::cell(hasher.finish()))
    }

    #[turbo_tasks::function]
    pub async fn includes(self, asset: AssetVc) -> Result<BoolVc> {
        let this = self.await?;
        if let Some(parent) = this.parent {
            if *parent.includes(asset).await? {
                return Ok(BoolVc::cell(true));
            }
        }
        for root in this.roots.iter() {
            if chunkable_assets_set(*root).await?.contains(&asset) {
                return Ok(BoolVc::cell(true));
            }
        }
        Ok(BoolVc::cell(false))
    }
}

#[turbo_tasks::function]
async fn chunkable_assets_set(root: AssetVc) -> Result<AssetsSetVc> {
    let assets = ReverseTopological::new()
        .skip_duplicates()
        .visit(once(root), |&asset: &AssetVc| async move {
            let mut results = Vec::new();
            for reference in asset.references().await?.iter() {
                if let Some(chunkable) = ChunkableAssetReferenceVc::resolve_from(reference).await? {
                    if matches!(
                        &*chunkable.chunking_type().await?,
                        Some(
                            ChunkingType::Parallel
                                | ChunkingType::PlacedOrParallel
                                | ChunkingType::Placed
                        )
                    ) {
                        results.extend(
                            chunkable
                                .resolve_reference()
                                .primary_assets()
                                .await?
                                .iter()
                                .copied(),
                        );
                    }
                }
            }
            Ok(results)
        })
        .await
        .completed()?;
    Ok(AssetsSetVc::cell(assets.into_inner().into_iter().collect()))
}
