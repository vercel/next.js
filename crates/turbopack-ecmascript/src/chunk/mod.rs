pub mod loader;

use std::collections::{HashSet, VecDeque};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        AsyncLoadableReferenceVc, Chunk, ChunkGroupReferenceVc, ChunkGroupVc, ChunkReferenceVc,
        ChunkVc, ChunkableAssetReferenceVc, ChunkableAssetVc, ChunkingContextVc, ModuleIdVc,
    },
    reference::AssetReferenceVc,
};

use self::loader::ChunkGroupLoaderChunkItemVc;

#[turbo_tasks::value(Chunk, Asset)]
pub struct EcmascriptChunk {
    context: ChunkingContextVc,
    /// must implement [EcmascriptChunkPlaceableVc] too
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkVc {
    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, entry: AssetVc) -> Self {
        Self::slot(EcmascriptChunk { context, entry })
    }
}

#[turbo_tasks::function]
fn chunk_context(_context: ChunkingContextVc) -> EcmascriptChunkContextVc {
    EcmascriptChunkContextVc::slot(EcmascriptChunkContext {})
}

#[turbo_tasks::value]
struct ChunkContentResult {
    chunk_items: Vec<EcmascriptChunkItemVc>,
    chunks: Vec<ChunkVc>,
    async_chunk_groups: Vec<ChunkGroupVc>,
    external_asset_references: Vec<AssetReferenceVc>,
}

#[turbo_tasks::function]
async fn chunk_content(context: ChunkingContextVc, entry: AssetVc) -> Result<ChunkContentResultVc> {
    let parent_dir = entry.path().parent().await?;
    let mut chunk_items = Vec::new();
    let mut processed_assets = HashSet::new();
    let mut chunks = Vec::new();
    let mut async_chunk_groups = Vec::new();
    let mut external_asset_references = Vec::new();
    let mut queue = VecDeque::new();
    chunk_items.push(EcmascriptChunkPlaceableVc::cast_from(entry).as_chunk_item(context));
    processed_assets.insert(entry);
    queue.push_back(entry.references());
    while let Some(item) = queue.pop_front() {
        'outer: for r in item.await?.iter() {
            let is_async = if let Some(al) = AsyncLoadableReferenceVc::resolve_from(r).await? {
                *al.is_loaded_async().await?
            } else {
                false
            };
            if let Some(pc) = ChunkableAssetReferenceVc::resolve_from(r).await? {
                if *pc.is_chunkable().await? {
                    let mut inner_chunk_items = Vec::new();
                    let mut inner_assets = Vec::new();
                    let mut inner_chunks = Vec::new();
                    let mut inner_chunk_groups = Vec::new();
                    for asset in r
                        .resolve_reference()
                        .primary_assets()
                        .await?
                        .iter()
                        .filter(|asset| processed_assets.insert(**asset))
                    {
                        if is_async {
                            if let Some(chunkable_asset) =
                                ChunkableAssetVc::resolve_from(asset).await?
                            {
                                let chunk_item = ChunkGroupLoaderChunkItemVc::new(chunkable_asset);
                                inner_chunk_items.push(chunk_item.into());
                                inner_chunk_groups.push(context.as_chunk_group(chunkable_asset));
                                continue;
                            } else {
                                external_asset_references.push(*r);
                                continue 'outer;
                            }
                        }
                        // chunk item, chunk or other asset?
                        if let Some(placeable) =
                            EcmascriptChunkPlaceableVc::resolve_from(asset).await?
                        {
                            // heuristic for being in the same chunk
                            let path = asset.path().await?;
                            if let Some(rel_path) = parent_dir.get_path_to(&path) {
                                if !rel_path.starts_with("node_modules/")
                                    && !rel_path.contains("/node_modules/")
                                {
                                    inner_chunk_items.push(placeable.as_chunk_item(context));
                                    inner_assets.push(*asset);
                                    continue;
                                }
                            }
                        }
                        // fallback to chunk if possible
                        if let Some(chunkable_asset) = ChunkableAssetVc::resolve_from(asset).await?
                        {
                            let chunk = chunkable_asset.as_chunk(context);
                            inner_chunks.push(chunk);
                        } else {
                            external_asset_references.push(*r);
                            continue 'outer;
                        }
                    }
                    for chunk_item in inner_chunk_items {
                        chunk_items.push(chunk_item);
                    }
                    for asset in inner_assets {
                        queue.push_back(asset.references());
                    }
                    for chunk in inner_chunks {
                        chunks.push(chunk);
                    }
                    for chunk_group in inner_chunk_groups {
                        async_chunk_groups.push(chunk_group);
                    }
                    continue;
                }
            }
            external_asset_references.push(*r);
        }
    }
    // TODO if there are too many chunk_items
    // split the chunk by a deterministic min/max size algorithm
    Ok(ChunkContentResultVc::slot(ChunkContentResult {
        chunk_items,
        chunks,
        async_chunk_groups,
        external_asset_references,
    }))
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::slot(format!(
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
        let content = chunk_content(self.context, self.entry).await?;
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
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        let content = chunk_content(self.context, self.entry).await?;
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
        Ok(Vc::slot(references))
    }
}

#[turbo_tasks::value]
pub struct EcmascriptChunkContext {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkContextVc {
    #[turbo_tasks::function]
    fn id(self, _placeable: EcmascriptChunkPlaceableVc) -> ModuleIdVc {
        todo!()
    }
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ValueToString {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> EcmascriptChunkItemVc;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem {
    // TODO handle Source Maps, maybe via separate method "content_with_map"
    fn content(
        &self,
        chunk_content: EcmascriptChunkContextVc,
        context: ChunkingContextVc,
    ) -> StringVc;
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItems(Vec<EcmascriptChunkItemVc>);
