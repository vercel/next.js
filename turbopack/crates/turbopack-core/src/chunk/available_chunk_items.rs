use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, NonLocalValue, ResolvedVc,
    TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use super::ChunkItem;

#[derive(
    PartialEq, Eq, TraceRawVcs, Copy, Clone, Serialize, Deserialize, ValueDebugFormat, NonLocalValue,
)]
pub struct AvailableChunkItemInfo {
    pub is_async: bool,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAvailableChunkItemInfo(Option<AvailableChunkItemInfo>);

#[turbo_tasks::value(transparent)]
pub struct AvailableChunkItemInfoMap(
    FxIndexMap<ResolvedVc<Box<dyn ChunkItem>>, AvailableChunkItemInfo>,
);

/// Allows to gather information about which assets are already available.
/// Adding more roots will form a linked list like structure to allow caching
/// `include` queries.
#[turbo_tasks::value]
pub struct AvailableChunkItems {
    parent: Option<ResolvedVc<AvailableChunkItems>>,
    chunk_items: ResolvedVc<AvailableChunkItemInfoMap>,
}

#[turbo_tasks::value_impl]
impl AvailableChunkItems {
    #[turbo_tasks::function]
    pub fn new(chunk_items: ResolvedVc<AvailableChunkItemInfoMap>) -> Vc<Self> {
        AvailableChunkItems {
            parent: None,
            chunk_items,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn with_chunk_items(
        self: ResolvedVc<Self>,
        chunk_items: ResolvedVc<AvailableChunkItemInfoMap>,
    ) -> Result<Vc<Self>> {
        let chunk_items = chunk_items
            .await?
            .into_iter()
            .map(|(&chunk_item, &info)| async move {
                Ok(self
                    .get(*chunk_item)
                    .await?
                    .is_none()
                    .then_some((chunk_item, info)))
            })
            .try_flat_join()
            .await?;
        Ok(AvailableChunkItems {
            parent: Some(self),
            chunk_items: ResolvedVc::cell(chunk_items.into_iter().collect()),
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn hash(&self) -> Result<Vc<u64>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        if let Some(parent) = self.parent {
            hasher.write_value(parent.hash().await?);
        } else {
            hasher.write_value(0u64);
        }
        let item_idents = self
            .chunk_items
            .await?
            .iter()
            .map(|(&chunk_item, _)| chunk_item.asset_ident().to_string())
            .try_join()
            .await?;
        for ident in item_idents {
            hasher.write_value(ident);
        }
        Ok(Vc::cell(hasher.finish()))
    }

    #[turbo_tasks::function]
    pub async fn get(
        &self,
        chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
    ) -> Result<Vc<OptionAvailableChunkItemInfo>> {
        if let Some(&info) = self.chunk_items.await?.get(&chunk_item) {
            return Ok(Vc::cell(Some(info)));
        };
        if let Some(parent) = self.parent {
            return Ok(parent.get(*chunk_item));
        }
        Ok(Vc::cell(None))
    }
}
