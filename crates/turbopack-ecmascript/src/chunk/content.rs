use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::Value;
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, chunk_content, chunk_content_split,
        ChunkContentResult, ChunkGroupVc, ChunkVc,
    },
    reference::AssetReferenceVc,
};

use super::{
    item::EcmascriptChunkItemVc,
    placeable::{EcmascriptChunkPlaceableVc, EcmascriptChunkPlaceablesVc},
    EcmascriptChunkingContextVc,
};

#[turbo_tasks::value]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<EcmascriptChunkItemVc>,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
    pub availability_info: AvailabilityInfo,
}

impl From<ChunkContentResult<EcmascriptChunkItemVc>> for EcmascriptChunkContent {
    fn from(from: ChunkContentResult<EcmascriptChunkItemVc>) -> Self {
        EcmascriptChunkContent {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            async_chunk_groups: from.async_chunk_groups,
            external_asset_references: from.external_asset_references,
            availability_info: from.availability_info,
        }
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContentVc {
    #[turbo_tasks::function]
    pub fn filter(self, _other: EcmascriptChunkContentVc) -> EcmascriptChunkContentVc {
        todo!()
    }
}

#[turbo_tasks::function]
pub(crate) fn ecmascript_chunk_content(
    context: EcmascriptChunkingContextVc,
    main_entries: EcmascriptChunkPlaceablesVc,
    omit_entries: Option<EcmascriptChunkPlaceablesVc>,
    availability_info: Value<AvailabilityInfo>,
) -> EcmascriptChunkContentVc {
    let mut chunk_content =
        ecmascript_chunk_content_internal(context, main_entries, availability_info);
    if let Some(omit_entries) = omit_entries {
        let omit_chunk_content =
            ecmascript_chunk_content_internal(context, omit_entries, availability_info);
        chunk_content = chunk_content.filter(omit_chunk_content);
    }
    chunk_content
}

#[turbo_tasks::function]
async fn ecmascript_chunk_content_internal(
    context: EcmascriptChunkingContextVc,
    entries: EcmascriptChunkPlaceablesVc,
    availability_info: Value<AvailabilityInfo>,
) -> Result<EcmascriptChunkContentVc> {
    let entries = entries.await?;
    let entries = entries.iter().copied();

    let contents = entries
        .map(|entry| ecmascript_chunk_content_single_entry(context, entry, availability_info))
        .collect::<Vec<_>>();

    if contents.len() == 1 {
        return Ok(contents.into_iter().next().unwrap());
    }

    let mut all_chunk_items = IndexSet::<EcmascriptChunkItemVc>::new();
    let mut all_chunks = IndexSet::<ChunkVc>::new();
    let mut all_async_chunk_groups = IndexSet::<ChunkGroupVc>::new();
    let mut all_external_asset_references = IndexSet::<AssetReferenceVc>::new();

    for content in contents {
        let EcmascriptChunkContent {
            chunk_items,
            chunks,
            async_chunk_groups,
            external_asset_references,
            availability_info: _,
        } = &*content.await?;
        all_chunk_items.extend(chunk_items.iter().copied());
        all_chunks.extend(chunks.iter().copied());
        all_async_chunk_groups.extend(async_chunk_groups.iter().copied());
        all_external_asset_references.extend(external_asset_references.iter().copied());
    }

    Ok(EcmascriptChunkContent {
        chunk_items: all_chunk_items.into_iter().collect(),
        chunks: all_chunks.into_iter().collect(),
        async_chunk_groups: all_async_chunk_groups.into_iter().collect(),
        external_asset_references: all_external_asset_references.into_iter().collect(),
        availability_info: availability_info.into_value(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn ecmascript_chunk_content_single_entry(
    context: EcmascriptChunkingContextVc,
    entry: EcmascriptChunkPlaceableVc,
    availability_info: Value<AvailabilityInfo>,
) -> Result<EcmascriptChunkContentVc> {
    let asset = entry.as_asset();

    Ok(EcmascriptChunkContentVc::cell(
        if let Some(res) =
            chunk_content::<EcmascriptChunkItemVc>(context.into(), asset, None, availability_info)
                .await?
        {
            res
        } else {
            chunk_content_split::<EcmascriptChunkItemVc>(
                context.into(),
                asset,
                None,
                availability_info,
            )
            .await?
        }
        .into(),
    ))
}
