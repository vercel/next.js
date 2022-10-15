mod writer;

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        chunk_content, chunk_content_split, Chunk, ChunkContentResult, ChunkGroupReferenceVc,
        ChunkGroupVc, ChunkItem, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAssetVc,
        ChunkingContextVc, FromChunkableAsset,
    },
    reference::{AssetReferenceVc, AssetReferencesVc},
};
use writer::{expand_imports, WriterWithIndent};

use crate::{embed::CssEmbeddableVc, ImportAssetReferenceVc};

#[turbo_tasks::value]
pub struct CssChunk {
    context: ChunkingContextVc,
    /// must implement [CssChunkPlaceable] too
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl CssChunkVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, entry: AssetVc) -> Self {
        Self::cell(CssChunk { context, entry })
    }
}

#[turbo_tasks::value]
pub struct CssChunkContentResult {
    pub chunk_items: Vec<CssChunkItemVc>,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_groups: Vec<ChunkGroupVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

impl From<ChunkContentResult<CssChunkItemVc>> for CssChunkContentResult {
    fn from(from: ChunkContentResult<CssChunkItemVc>) -> Self {
        CssChunkContentResult {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            async_chunk_groups: from.async_chunk_groups,
            external_asset_references: from.external_asset_references,
        }
    }
}

#[turbo_tasks::function]
async fn css_chunk_content(
    context: ChunkingContextVc,
    entry: AssetVc,
) -> Result<CssChunkContentResultVc> {
    let res = if let Some(res) = chunk_content::<CssChunkItemVc>(context, entry, None).await? {
        res
    } else {
        chunk_content_split::<CssChunkItemVc>(context, entry, None).await?
    };

    Ok(CssChunkContentResultVc::cell(res.into()))
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {}

#[turbo_tasks::value_impl]
impl ValueToString for CssChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "chunk {}",
            self.entry.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.context.chunk_path(self.entry.path(), ".css")
    }

    #[turbo_tasks::function]
    async fn content(self_vc: CssChunkVc) -> Result<AssetContentVc> {
        let this = self_vc.await?;

        let entry_placeable = CssChunkPlaceableVc::cast_from(this.entry);
        let entry_content = entry_placeable.as_chunk_item(this.context).content();

        let path = self_vc.path();
        let chunk_id = path.to_string();
        let mut code = format!("/* chunk {} */\n", chunk_id.await?);

        let writer = WriterWithIndent::new(&mut code);
        expand_imports(writer, entry_content).await?;

        Ok(File::from(code).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let content = css_chunk_content(self.context, self.entry).await?;
        let mut references = Vec::new();
        for r in content.external_asset_references.iter() {
            references.push(*r);
            let assets = r.resolve_reference().primary_assets();
            for asset in assets.await?.iter() {
                if let Some(embeddable) = CssEmbeddableVc::resolve_from(asset).await? {
                    let embed = embeddable.as_css_embed(self.context);
                    references.extend(embed.references().await?.iter());
                }
            }
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

#[turbo_tasks::value]
pub struct CssChunkContext {}

#[turbo_tasks::value_impl]
impl CssChunkContextVc {
    #[turbo_tasks::function]
    pub fn of(_context: ChunkingContextVc) -> CssChunkContextVc {
        // TODO in future we will use something from the chunking context
        CssChunkContext {}.cell()
    }
}

#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> CssChunkItemVc;
}

#[turbo_tasks::value(shared)]
pub struct CssChunkItemContent {
    pub inner_code: String,
    pub imports: Vec<(ImportAssetReferenceVc, CssChunkItemVc)>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem + ValueToString {
    // TODO handle Source Maps
    fn content(&self) -> CssChunkItemContentVc;
}

#[async_trait::async_trait]
impl FromChunkableAsset for CssChunkItemVc {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>> {
        if let Some(placeable) = CssChunkPlaceableVc::resolve_from(asset).await? {
            return Ok(Some(placeable.as_chunk_item(context)));
        }
        Ok(None)
    }

    async fn from_async_asset(
        _context: ChunkingContextVc,
        _asset: ChunkableAssetVc,
    ) -> Result<Option<(Self, ChunkableAssetVc)>> {
        Ok(None)
    }
}
