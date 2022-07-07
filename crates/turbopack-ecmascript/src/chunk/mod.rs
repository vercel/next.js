pub mod loader;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::Asset,
    chunk::{
        chunk_content, Chunk, ChunkContentResult, ChunkContext, ChunkContextVc,
        ChunkGroupReferenceVc, ChunkGroupVc, ChunkItemVc, ChunkPlaceableVc, ChunkReferenceVc,
        ChunkVc, ChunkableAssetVc, ChunkingContextVc, FromChunkableAsset, ModuleIdVc,
    },
    reference::{AssetReferenceVc, AssetReferencesVc},
};
use turbopack_core::asset::AssetVc;

use self::loader::ChunkGroupLoaderChunkItemVc;

#[turbo_tasks::value(Chunk, Asset, ValueToString)]
pub struct EcmascriptChunk {
    context: ChunkingContextVc,
    /// must implement [EcmascriptChunkPlaceable] too
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, entry: AssetVc) -> Self {
        Self::cell(EcmascriptChunk { context, entry })
    }
}

#[turbo_tasks::function]
fn chunk_context(_context: ChunkingContextVc) -> EcmascriptChunkContextVc {
    EcmascriptChunkContextVc::cell(EcmascriptChunkContext {})
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContentResult {
    pub chunk_items: Vec<EcmascriptChunkItemVc>,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

impl From<ChunkContentResult<EcmascriptChunkItemVc>> for EcmascriptChunkContentResult {
    fn from(from: ChunkContentResult<EcmascriptChunkItemVc>) -> Self {
        EcmascriptChunkContentResult {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            async_chunk_groups: from.async_chunk_groups,
            external_asset_references: from.external_asset_references,
        }
    }
}

#[turbo_tasks::function]
async fn ecmascript_chunk_content(
    context: ChunkingContextVc,
    entry: AssetVc,
) -> Result<EcmascriptChunkContentResultVc> {
    let res = chunk_content::<EcmascriptChunkItemVc>(context, entry).await?;

    Ok(EcmascriptChunkContentResultVc::cell(res.into()))
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk {}",
            self.entry.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.context.as_chunk_path(self.entry.path())
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let content = ecmascript_chunk_content(self.context, self.entry).await?;
        let c_context = chunk_context(self.context);
        let mut code = String::new();
        for chunk_item in content.chunk_items.iter() {
            let content = &chunk_item.content(c_context, self.context).await?;
            code += &content;
            code += "\n\n";
        }
        Ok(FileContent::Content(File::from_source(code)).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let content = ecmascript_chunk_content(self.context, self.entry).await?;
        let mut references = Vec::new();
        for r in content.external_asset_references.iter() {
            references.push(*r);
        }
        for chunk in content.chunks.iter() {
            references.push(ChunkReferenceVc::new_parallel(*chunk).into());
        }
        for chunk_group in content.async_chunk_groups.iter() {
            references.push(ChunkGroupReferenceVc::new(*chunk_group).into());
        }
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value(ChunkContext)]
pub struct EcmascriptChunkContext {}

#[turbo_tasks::value_impl]
impl ChunkContext for EcmascriptChunkContext {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContextVc {
    #[turbo_tasks::function]
    fn id(self, _placeable: EcmascriptChunkPlaceableVc) -> ModuleIdVc {
        todo!()
    }
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkPlaceable + ValueToString {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> EcmascriptChunkItemVc;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem {
    // TODO handle Source Maps, maybe via separate method "content_with_map"
    fn content(
        &self,
        chunk_content: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> StringVc;
}

#[async_trait::async_trait]
impl FromChunkableAsset for EcmascriptChunkItemVc {
    async fn from_asset(
        context: ChunkingContextVc,
        asset: AssetVc,
    ) -> Result<Option<Self>> {
        if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
            return Ok(Some(placeable.as_chunk_item(context)));
        }
        Ok(None)
    }

    async fn from_async_asset(
        _context: ChunkingContextVc,
        asset: ChunkableAssetVc,
    ) -> Result<Option<Self>> {
        Ok(Some(ChunkGroupLoaderChunkItemVc::new(asset).into()))
    }
}
