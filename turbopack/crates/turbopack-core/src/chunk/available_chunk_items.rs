use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, TryFlatJoinIterExt, TryJoinIterExt, ValueToString,
    Vc,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use super::ChunkItem;

#[derive(PartialEq, Eq, TraceRawVcs, Copy, Clone, Serialize, Deserialize, ValueDebugFormat)]
pub struct AvailableChunkItemInfo {
    pub is_async: bool,
}

#[turbo_tasks::value(transparent)]
pub struct OptionAvailableChunkItemInfo(Option<AvailableChunkItemInfo>);

#[turbo_tasks::value(transparent)]
pub struct AvailableChunkItemInfoMap(IndexMap<Vc<Box<dyn ChunkItem>>, AvailableChunkItemInfo>);

/// Allows to gather information about which assets are already available.
/// Adding more roots will form a linked list like structure to allow caching
/// `include` queries.
#[turbo_tasks::value]
pub struct AvailableChunkItems {
    parent: Option<Vc<AvailableChunkItems>>,
    chunk_items: Vc<AvailableChunkItemInfoMap>,
}

#[turbo_tasks::value_impl]
impl AvailableChunkItems {
    #[turbo_tasks::function]
    pub fn new(chunk_items: Vc<AvailableChunkItemInfoMap>) -> Vc<Self> {
        AvailableChunkItems {
            parent: None,
            chunk_items,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn with_chunk_items(
        self: Vc<Self>,
        chunk_items: Vc<AvailableChunkItemInfoMap>,
    ) -> Result<Vc<Self>> {
        let chunk_items = chunk_items
            .await?
            .into_iter()
            .map(|(&chunk_item, &info)| async move {
                Ok(self
                    .get(chunk_item)
                    .await?
                    .is_none()
                    .then_some((chunk_item, info)))
            })
            .try_flat_join()
            .await?;
        Ok(AvailableChunkItems {
            parent: Some(self),
            chunk_items: Vc::cell(chunk_items.into_iter().collect()),
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn hash(self: Vc<Self>) -> Result<Vc<u64>> {
        let this = self.await?;
        let mut hasher = Xxh3Hash64Hasher::new();
        if let Some(parent) = this.parent {
            hasher.write_value(parent.hash().await?);
        } else {
            hasher.write_value(0u64);
        }
        let item_idents = this
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
        self: Vc<Self>,
        chunk_item: Vc<Box<dyn ChunkItem>>,
    ) -> Result<Vc<OptionAvailableChunkItemInfo>> {
        let this = self.await?;
        if let Some(&info) = this.chunk_items.await?.get(&chunk_item) {
            return Ok(Vc::cell(Some(info)));
        };
        if let Some(parent) = this.parent {
            return Ok(parent.get(chunk_item));
        }
        Ok(Vc::cell(None))
    }
}
