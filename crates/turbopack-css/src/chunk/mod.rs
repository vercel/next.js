pub(crate) mod optimize;
pub mod source_map;
pub(crate) mod writer;

use std::io::Write;

use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{rope::Rope, File, FileSystemPathOptionVc, FileSystemPathVc};
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        chunk_content, chunk_content_split,
        optimize::{ChunkOptimizerVc, OptimizableChunk, OptimizableChunkVc},
        Chunk, ChunkContentResult, ChunkGroupReferenceVc, ChunkGroupVc, ChunkItem, ChunkItemVc,
        ChunkReferenceVc, ChunkVc, ChunkableAssetVc, ChunkingContextVc, FromChunkableAsset,
    },
    code_builder::{CodeBuilder, CodeVc},
    reference::{AssetReferenceVc, AssetReferencesVc},
    source_map::{GenerateSourceMap, GenerateSourceMapVc, SourceMapVc},
};
use turbopack_ecmascript::utils::FormatIter;
use writer::expand_imports;

use self::{optimize::CssChunkOptimizerVc, source_map::CssChunkSourceMapAssetReferenceVc};
use crate::{
    embed::CssEmbeddableVc, parse::ParseResultSourceMapVc, util::stringify_str,
    ImportAssetReferenceVc,
};

#[turbo_tasks::value]
pub struct CssChunk {
    context: ChunkingContextVc,
    main_entries: CssChunkPlaceablesVc,
}

#[turbo_tasks::value_impl]
impl CssChunkVc {
    #[turbo_tasks::function]
    pub fn new_normalized(context: ChunkingContextVc, main_entries: CssChunkPlaceablesVc) -> Self {
        CssChunk {
            context,
            main_entries,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(context: ChunkingContextVc, entry: CssChunkPlaceableVc) -> Self {
        Self::new_normalized(context, CssChunkPlaceablesVc::cell(vec![entry]))
    }

    /// Return the most specific directory which contains all elements of the
    /// chunk.
    #[turbo_tasks::function]
    pub async fn common_parent(self) -> Result<FileSystemPathOptionVc> {
        let this = self.await?;
        let main_entries = this.main_entries.await?;
        let mut paths = main_entries.iter().map(|entry| entry.path().parent());
        let mut current = paths
            .next()
            .ok_or_else(|| anyhow!("Chunks must have at least one entry"))?
            .resolve()
            .await?;
        for path in paths {
            while !*path.is_inside(current).await? {
                let parent = current.parent().resolve().await?;
                if parent == current {
                    return Ok(FileSystemPathOptionVc::cell(None));
                }
                current = parent;
            }
        }
        Ok(FileSystemPathOptionVc::cell(Some(current)))
    }

    #[turbo_tasks::function]
    async fn chunk_content(self) -> Result<CssChunkContentVc> {
        let this = self.await?;
        let chunk_path = self.path();
        Ok(CssChunkContentVc::new(
            this.main_entries,
            this.context,
            chunk_path,
        ))
    }
}

#[turbo_tasks::value]
struct CssChunkContent {
    main_entries: CssChunkPlaceablesVc,
    context: ChunkingContextVc,
    chunk_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl CssChunkContentVc {
    #[turbo_tasks::function]
    async fn new(
        main_entries: CssChunkPlaceablesVc,
        context: ChunkingContextVc,
        chunk_path: FileSystemPathVc,
    ) -> Result<Self> {
        Ok(CssChunkContent {
            main_entries,
            context,
            chunk_path,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        let this = self.await?;
        let chunk_name = this.chunk_path.to_string();

        let mut body = CodeBuilder::default();
        let mut external_imports = IndexSet::new();
        for entry in this.main_entries.await?.iter() {
            let entry_placeable = CssChunkPlaceableVc::cast_from(entry);
            let entry_item = entry_placeable.as_chunk_item(this.context);

            for external_import in expand_imports(&mut body, entry_item).await? {
                external_imports.insert(external_import.await?.to_owned());
            }
        }

        let mut code = CodeBuilder::default();
        writeln!(code, "/* chunk {} */", chunk_name.await?)?;
        for external_import in external_imports {
            writeln!(code, "@import {};", stringify_str(&external_import))?;
        }

        code.push_code(&body.build());

        if code.has_source_map() {
            let chunk_path = this.chunk_path.await?;
            write!(
                code,
                "\n/*# sourceMappingURL={}.map*/",
                chunk_path.file_name()
            )?;
        }

        let c = code.build().cell();
        Ok(c)
    }

    #[turbo_tasks::function]
    async fn content(self) -> Result<AssetContentVc> {
        let code = self.code().await?;
        Ok(File::from(code.source_code().clone()).into())
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for CssChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: CssChunkContentVc) -> SourceMapVc {
        self_vc.code().generate_source_map()
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
    entries: CssChunkPlaceablesVc,
) -> Result<CssChunkContentResultVc> {
    let entries = entries.await?;
    let entries = entries.iter().copied();

    let contents = entries
        .map(|entry| css_chunk_content_single_entry(context, entry))
        .collect::<Vec<_>>();

    if contents.len() == 1 {
        return Ok(contents.into_iter().next().unwrap());
    }

    let mut all_chunk_items = IndexSet::<CssChunkItemVc>::new();
    let mut all_chunks = IndexSet::<ChunkVc>::new();
    let mut all_async_chunk_groups = IndexSet::<ChunkGroupVc>::new();
    let mut all_external_asset_references = IndexSet::<AssetReferenceVc>::new();

    for content in contents {
        let CssChunkContentResult {
            chunk_items,
            chunks,
            async_chunk_groups,
            external_asset_references,
        } = &*content.await?;
        all_chunk_items.extend(chunk_items.iter().copied());
        all_chunks.extend(chunks.iter().copied());
        all_async_chunk_groups.extend(async_chunk_groups.iter().copied());
        all_external_asset_references.extend(external_asset_references.iter().copied());
    }

    Ok(CssChunkContentResult {
        chunk_items: all_chunk_items.into_iter().collect(),
        chunks: all_chunks.into_iter().collect(),
        async_chunk_groups: all_async_chunk_groups.into_iter().collect(),
        external_asset_references: all_external_asset_references.into_iter().collect(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn css_chunk_content_single_entry(
    context: ChunkingContextVc,
    entry: CssChunkPlaceableVc,
) -> Result<CssChunkContentResultVc> {
    let asset = entry.as_asset();
    let res = if let Some(res) = chunk_content::<CssChunkItemVc>(context, asset, None).await? {
        res
    } else {
        chunk_content_split::<CssChunkItemVc>(context, asset, None).await?
    };

    Ok(CssChunkContentResultVc::cell(res.into()))
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {}

#[turbo_tasks::value_impl]
impl OptimizableChunk for CssChunk {
    #[turbo_tasks::function]
    fn get_optimizer(&self) -> ChunkOptimizerVc {
        CssChunkOptimizerVc::new(self.context).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CssChunk {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        let entry_strings = self
            .main_entries
            .await?
            .iter()
            .map(|entry| entry.path().to_string())
            .try_join()
            .await?;
        let entry_strs = || entry_strings.iter().map(|s| s.as_str()).intersperse(" + ");
        Ok(StringVc::cell(format!("chunk {}", FormatIter(entry_strs),)))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    async fn path(self_vc: CssChunkVc) -> Result<FileSystemPathVc> {
        let this = self_vc.await?;
        let mut hasher = Xxh3Hash64Hasher::new();

        let main_entries = this.main_entries.await?;
        let mut main_entries = main_entries.iter();
        let mut needs_hash = false;
        let main_entry = main_entries
            .next()
            .ok_or_else(|| anyhow!("Chunk must have at least one entry"))?;
        for entry in main_entries {
            let path = entry.path().to_string().await?;
            hasher.write_value(path);
            needs_hash = true;
        }

        let hash = hasher.finish();
        let mut path = main_entry.path();
        if needs_hash {
            path = path.append_to_stem(&format!(".{}", encode_hex(hash)))
        }

        Ok(this.context.chunk_path(path, ".css"))
    }

    #[turbo_tasks::function]
    fn content(self_vc: CssChunkVc) -> AssetContentVc {
        self_vc.chunk_content().content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: CssChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let content = css_chunk_content(this.context, this.main_entries).await?;
        let mut references = Vec::new();
        for r in content.external_asset_references.iter() {
            references.push(*r);
            let assets = r.resolve_reference().primary_assets();
            for asset in assets.await?.iter() {
                if let Some(embeddable) = CssEmbeddableVc::resolve_from(asset).await? {
                    let embed = embeddable.as_css_embed(this.context);
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
        references.push(CssChunkSourceMapAssetReferenceVc::new(self_vc).into());
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for CssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: CssChunkVc) -> SourceMapVc {
        self_vc.chunk_content().generate_source_map()
    }
}

#[turbo_tasks::value]
pub struct CssChunkContext {
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl CssChunkContextVc {
    #[turbo_tasks::function]
    pub fn of(context: ChunkingContextVc) -> CssChunkContextVc {
        CssChunkContext { context }.cell()
    }
}

#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: Asset {
    fn as_chunk_item(&self, context: ChunkingContextVc) -> CssChunkItemVc;
}

#[turbo_tasks::value(transparent)]
pub struct CssChunkPlaceables(Vec<CssChunkPlaceableVc>);

#[derive(Clone)]
#[turbo_tasks::value(shared)]
pub enum CssImport {
    External(StringVc),
    Internal(ImportAssetReferenceVc, CssChunkItemVc),
}

#[turbo_tasks::value(shared)]
pub struct CssChunkItemContent {
    pub inner_code: Rope,
    pub imports: Vec<CssImport>,
    pub source_map: Option<ParseResultSourceMapVc>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem + ValueToString {
    fn content(&self) -> CssChunkItemContentVc;
    fn chunking_context(&self) -> ChunkingContextVc;
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
