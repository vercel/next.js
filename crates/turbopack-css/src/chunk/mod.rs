use std::collections::{HashMap, VecDeque};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{
        chunk_content, chunk_content_split, Chunk, ChunkContentResult, ChunkGroupReferenceVc,
        ChunkGroupVc, ChunkItemVc, ChunkReferenceVc, ChunkVc, ChunkableAssetVc, ChunkingContextVc,
        FromChunkableAsset, ModuleId, ModuleIdVc,
    },
    reference::{AssetReferenceVc, AssetReferencesVc},
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
        Self::cell(CssChunk { context, entry })
    }
}

#[turbo_tasks::function]
fn chunk_context(_context: ChunkingContextVc) -> CssChunkContextVc {
    CssChunkContextVc::cell(CssChunkContext {})
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
    let res = if let Some(res) = chunk_content::<CssChunkItemVc>(context, entry).await? {
        res
    } else {
        chunk_content_split::<CssChunkItemVc>(context, entry).await?
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

fn stringify_module_id(id: &ModuleId) -> String {
    match id {
        ModuleId::Number(n) => n.to_string(),
        ModuleId::String(s) => s.clone(),
    }
}

async fn expand_imports(
    code: &mut String,
    content_vc: CssChunkItemContentVc,
    map: &HashMap<ModuleId, CssChunkItemContentVc>,
) -> Result<()> {
    let content: &CssChunkItemContent = &*content_vc.await?;
    let mut stack = vec![(
        content_vc,
        content.imports.iter().cloned().collect::<VecDeque<_>>(),
    )];

    while let Some((content_vc, imports)) = stack.last_mut() {
        if let Some(import) = imports.pop_front() {
            // TODO: layer, media query, supports
            let id = import.await?;
            let id_string = stringify_module_id(&*id);
            *code += &format!("/* import({}) */\n", id_string);
            if let Some(imported_content_vc) = map.get(&*id) {
                let imported_content: &CssChunkItemContent = &*(*imported_content_vc).await?;
                stack.push((
                    *imported_content_vc,
                    imported_content.imports.iter().cloned().collect(),
                ));
            } else {
                println!("unable to expand css import: {}", id_string);
            }
        } else {
            let content: &CssChunkItemContent = &*(*content_vc).await?;
            *code += &content.inner_code;
            *code += "\n\n";
            stack.pop();
        }
    }

    Ok(())
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.context.as_chunk_path(self.entry.path(), ".css")
    }

    #[turbo_tasks::function]
    async fn content(self_vc: CssChunkVc) -> Result<FileContentVc> {
        let this = self_vc.await?;
        let content = css_chunk_content(this.context, this.entry).await?;
        let content: &CssChunkContentResult = &*content;
        let c_context = chunk_context(this.context);

        let entry_placable = CssChunkPlaceableVc::cast_from(this.entry);
        let entry_content = entry_placable
            .as_chunk_item(this.context)
            .content(c_context, this.context);

        let mut map = HashMap::new();
        for chunk_item in content.chunk_items.iter() {
            let chunk_item: &CssChunkItemVc = chunk_item;
            let content_vc = chunk_item.content(c_context, this.context);
            let content: &CssChunkItemContent = &*content_vc.await?;
            map.insert(content.id.await?.clone(), content_vc);
        }

        let path = self_vc.path();
        let chunk_id = path.to_string();
        let mut code = format!("/* chunk {} */\n", chunk_id.await?);

        expand_imports(&mut code, entry_content, &map).await?;

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
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value]
pub struct CssChunkContext {}

#[turbo_tasks::value_impl]
impl CssChunkContextVc {
    #[turbo_tasks::function]
    pub async fn id(self, placeable: CssChunkPlaceableVc) -> Result<ModuleIdVc> {
        Ok(ModuleId::String(placeable.to_string().await?.clone()).into())
    }
}

#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: ValueToString {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> CssChunkItemVc;
}

#[turbo_tasks::value(shared)]
pub struct CssChunkItemContent {
    pub inner_code: String,
    pub id: ModuleIdVc,
    pub imports: Vec<ModuleIdVc>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem {
    // TODO handle Source Maps, maybe via separate method "content_with_map"
    fn content(
        &self,
        chunk_context: CssChunkContextVc,
        context: ChunkingContextVc,
    ) -> CssChunkItemContentVc;
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
    ) -> Result<Option<Self>> {
        Ok(None)
    }
}
