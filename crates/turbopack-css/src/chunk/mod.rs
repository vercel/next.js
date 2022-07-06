use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        chunk_content, Chunk, ChunkContentResultVc, ChunkContext, ChunkContextVc,
        ChunkGroupReferenceVc, ChunkItemVc, ChunkPlaceableVc, ChunkReferenceVc, ChunkVc,
        ChunkingContextVc, ModuleIdVc,
    },
    reference::AssetReferencesVc,
};

#[turbo_tasks::value(Chunk, Asset, ValueToString)]
pub struct CssChunk {
    context: ChunkingContextVc,
    /// must implement [CssChunkPlaceable] too
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl CssChunkVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, entry: AssetVc) -> Self {
        Self::slot(CssChunk { context, entry })
    }
}

#[turbo_tasks::function]
fn chunk_context(_context: ChunkingContextVc) -> ChunkContextVc {
    CssChunkContextVc::slot(CssChunkContext {}).into()
}

#[turbo_tasks::function]
async fn css_chunk_content(
    context: ChunkingContextVc,
    entry: AssetVc,
) -> Result<ChunkContentResultVc> {
    chunk_content(context, entry, CssChunkPlaceableVc::resolve_from).await
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {}

#[turbo_tasks::value_impl]
impl ValueToString for CssChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::slot(format!(
            "chunk {}",
            self.entry.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.context.as_chunk_path(self.entry.path())
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let content = css_chunk_content(self.context, self.entry).await?;
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
        let content = css_chunk_content(self.context, self.entry).await?;
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
        Ok(AssetReferencesVc::slot(references))
    }
}

#[turbo_tasks::value(ChunkContext)]
pub struct CssChunkContext {}

#[turbo_tasks::value_impl]
impl ChunkContext for CssChunkContext {}

#[turbo_tasks::value_impl]
impl CssChunkContextVc {
    #[turbo_tasks::function]
    fn id(self, _placeable: CssChunkPlaceableVc) -> ModuleIdVc {
        todo!()
    }
}

#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: ValueToString + ChunkPlaceable {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> ChunkItemVc;
}
