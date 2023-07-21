use anyhow::Result;
use indexmap::IndexSet;
use turbo_tasks::{Value, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, chunk_content, chunk_content_split, Chunk,
        ChunkContentResult,
    },
    reference::ModuleReference,
};

use super::{
    item::EcmascriptChunkItem,
    placeable::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceables},
    EcmascriptChunkingContext,
};

#[turbo_tasks::value]
pub struct EcmascriptChunkContent {
    pub chunk_items: Vec<Vc<Box<dyn EcmascriptChunkItem>>>,
    pub chunks: Vec<Vc<Box<dyn Chunk>>>,
    pub external_module_references: Vec<Vc<Box<dyn ModuleReference>>>,
    pub availability_info: AvailabilityInfo,
}

impl From<ChunkContentResult<Vc<Box<dyn EcmascriptChunkItem>>>> for EcmascriptChunkContent {
    fn from(from: ChunkContentResult<Vc<Box<dyn EcmascriptChunkItem>>>) -> Self {
        EcmascriptChunkContent {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            external_module_references: from.external_module_references,
            availability_info: from.availability_info,
        }
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContent {
    #[turbo_tasks::function]
    pub fn filter(
        self: Vc<Self>,
        _other: Vc<EcmascriptChunkContent>,
    ) -> Vc<EcmascriptChunkContent> {
        todo!()
    }
}

#[turbo_tasks::function]
pub(crate) fn ecmascript_chunk_content(
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    main_entries: Vc<EcmascriptChunkPlaceables>,
    omit_entries: Option<Vc<EcmascriptChunkPlaceables>>,
    availability_info: Value<AvailabilityInfo>,
) -> Vc<EcmascriptChunkContent> {
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
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    entries: Vc<EcmascriptChunkPlaceables>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<EcmascriptChunkContent>> {
    let entries = entries.await?;
    let entries = entries.iter().copied();

    let contents = entries
        .map(|entry| ecmascript_chunk_content_single_entry(context, entry, availability_info))
        .collect::<Vec<_>>();

    if contents.len() == 1 {
        return Ok(contents.into_iter().next().unwrap());
    }

    let mut all_chunk_items = IndexSet::<Vc<Box<dyn EcmascriptChunkItem>>>::new();
    let mut all_chunks = IndexSet::<Vc<Box<dyn Chunk>>>::new();
    let mut all_external_module_references = IndexSet::<Vc<Box<dyn ModuleReference>>>::new();

    for content in contents {
        let EcmascriptChunkContent {
            chunk_items,
            chunks,
            external_module_references,
            availability_info: _,
        } = &*content.await?;
        all_chunk_items.extend(chunk_items.iter().copied());
        all_chunks.extend(chunks.iter().copied());
        all_external_module_references.extend(external_module_references.iter().copied());
    }

    Ok(EcmascriptChunkContent {
        chunk_items: all_chunk_items.into_iter().collect(),
        chunks: all_chunks.into_iter().collect(),
        external_module_references: all_external_module_references.into_iter().collect(),
        availability_info: availability_info.into_value(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn ecmascript_chunk_content_single_entry(
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
    entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<EcmascriptChunkContent>> {
    let module = Vc::upcast(entry);

    Ok(EcmascriptChunkContent::cell(
        if let Some(res) = chunk_content::<Box<dyn EcmascriptChunkItem>>(
            Vc::upcast(context),
            module,
            None,
            availability_info,
        )
        .await?
        {
            res
        } else {
            chunk_content_split::<Box<dyn EcmascriptChunkItem>>(
                Vc::upcast(context),
                module,
                None,
                availability_info,
            )
            .await?
        }
        .into(),
    ))
}
