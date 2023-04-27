pub(crate) mod single_item_chunk;
pub mod source_map;
pub(crate) mod writer;

use std::fmt::Write;

use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value, ValueToString};
use turbo_tasks_fs::{rope::Rope, File, FileSystemPathOptionVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc, AssetsVc},
    chunk::{
        availability_info::AvailabilityInfo, chunk_content, chunk_content_split, Chunk,
        ChunkContentResult, ChunkGroupReferenceVc, ChunkItem, ChunkItemVc, ChunkVc,
        ChunkableAssetVc, ChunkingContext, ChunkingContextVc, ChunksVc, FromChunkableAsset,
        ModuleId, ModuleIdVc, ModuleIdsVc, OutputChunk, OutputChunkRuntimeInfo,
        OutputChunkRuntimeInfoVc, OutputChunkVc,
    },
    code_builder::{CodeBuilder, CodeVc},
    ident::{AssetIdent, AssetIdentVc},
    introspect::{
        asset::{children_from_asset_references, content_to_details, IntrospectableAssetVc},
        Introspectable, IntrospectableChildrenVc, IntrospectableVc,
    },
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::PrimaryResolveResult,
    source_map::{GenerateSourceMap, GenerateSourceMapVc, OptionSourceMapVc},
};
use writer::expand_imports;

use self::{
    single_item_chunk::{chunk::SingleItemCssChunkVc, reference::SingleItemCssChunkReferenceVc},
    source_map::CssChunkSourceMapAssetReferenceVc,
};
use crate::{
    embed::{CssEmbed, CssEmbeddable, CssEmbeddableVc},
    parse::ParseResultSourceMapVc,
    util::stringify_js,
    ImportAssetReferenceVc,
};

#[turbo_tasks::value]
pub struct CssChunk {
    pub context: ChunkingContextVc,
    pub main_entries: CssChunkPlaceablesVc,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value(transparent)]
pub struct CssChunks(Vec<CssChunkVc>);

#[turbo_tasks::value_impl]
impl CssChunkVc {
    #[turbo_tasks::function]
    pub fn new_normalized(
        context: ChunkingContextVc,
        main_entries: CssChunkPlaceablesVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Self {
        CssChunk {
            context,
            main_entries,
            availability_info: availability_info.into_value(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(
        context: ChunkingContextVc,
        entry: CssChunkPlaceableVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Self {
        Self::new_normalized(
            context,
            CssChunkPlaceablesVc::cell(vec![entry]),
            availability_info,
        )
    }

    /// Return the most specific directory which contains all elements of the
    /// chunk.
    #[turbo_tasks::function]
    pub async fn common_parent(self) -> Result<FileSystemPathOptionVc> {
        let this = self.await?;
        let main_entries = this.main_entries.await?;
        let mut paths = main_entries
            .iter()
            .map(|entry| entry.ident().path().parent());
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
        Ok(CssChunkContentVc::new(
            this.main_entries,
            this.context,
            self,
        ))
    }
}

#[turbo_tasks::value]
struct CssChunkContent {
    main_entries: CssChunkPlaceablesVc,
    context: ChunkingContextVc,
    chunk: CssChunkVc,
}

#[turbo_tasks::value_impl]
impl CssChunkContentVc {
    #[turbo_tasks::function]
    async fn new(
        main_entries: CssChunkPlaceablesVc,
        context: ChunkingContextVc,
        chunk: CssChunkVc,
    ) -> Result<Self> {
        Ok(CssChunkContent {
            main_entries,
            context,
            chunk,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self) -> Result<CodeVc> {
        use std::io::Write;

        let this = self.await?;
        let chunk_name = this.chunk.path().to_string();

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
            writeln!(code, "@import {};", stringify_js(&external_import))?;
        }

        code.push_code(&body.build());

        if *this
            .context
            .reference_chunk_source_maps(this.chunk.into())
            .await?
            && code.has_source_map()
        {
            let chunk_path = this.chunk.path().await?;
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
    fn generate_source_map(self_vc: CssChunkContentVc) -> OptionSourceMapVc {
        self_vc.code().generate_source_map()
    }
}

#[turbo_tasks::value]
pub struct CssChunkContentResult {
    pub chunk_items: Vec<CssChunkItemVc>,
    pub chunks: Vec<ChunkVc>,
    pub async_chunk_group_entries: Vec<ChunkVc>,
    pub external_asset_references: Vec<AssetReferenceVc>,
}

impl From<ChunkContentResult<CssChunkItemVc>> for CssChunkContentResult {
    fn from(from: ChunkContentResult<CssChunkItemVc>) -> Self {
        CssChunkContentResult {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            async_chunk_group_entries: from.async_chunk_group_entries,
            external_asset_references: from.external_asset_references,
        }
    }
}

#[turbo_tasks::function]
async fn css_chunk_content(
    context: ChunkingContextVc,
    entries: CssChunkPlaceablesVc,
    availability_info: Value<AvailabilityInfo>,
) -> Result<CssChunkContentResultVc> {
    let entries = entries.await?;
    let entries = entries.iter().copied();

    let contents = entries
        .map(|entry| css_chunk_content_single_entry(context, entry, availability_info))
        .collect::<Vec<_>>();

    if contents.len() == 1 {
        return Ok(contents.into_iter().next().unwrap());
    }

    let mut all_chunk_items = IndexSet::<CssChunkItemVc>::new();
    let mut all_chunks = IndexSet::<ChunkVc>::new();
    let mut all_async_chunk_group_entries = IndexSet::<ChunkVc>::new();
    let mut all_external_asset_references = IndexSet::<AssetReferenceVc>::new();

    for content in contents {
        let CssChunkContentResult {
            chunk_items,
            chunks,
            async_chunk_group_entries,
            external_asset_references,
        } = &*content.await?;
        all_chunk_items.extend(chunk_items.iter().copied());
        all_chunks.extend(chunks.iter().copied());
        all_async_chunk_group_entries.extend(async_chunk_group_entries.iter().copied());
        all_external_asset_references.extend(external_asset_references.iter().copied());
    }

    Ok(CssChunkContentResult {
        chunk_items: all_chunk_items.into_iter().collect(),
        chunks: all_chunks.into_iter().collect(),
        async_chunk_group_entries: all_async_chunk_group_entries.into_iter().collect(),
        external_asset_references: all_external_asset_references.into_iter().collect(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn css_chunk_content_single_entry(
    context: ChunkingContextVc,
    entry: CssChunkPlaceableVc,
    availability_info: Value<AvailabilityInfo>,
) -> Result<CssChunkContentResultVc> {
    let asset = entry.as_asset();
    let res = if let Some(res) =
        chunk_content::<CssChunkItemVc>(context, asset, None, availability_info).await?
    {
        res
    } else {
        chunk_content_split::<CssChunkItemVc>(context, asset, None, availability_info).await?
    };

    Ok(CssChunkContentResultVc::cell(res.into()))
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn parallel_chunks(&self) -> Result<ChunksVc> {
        let content = css_chunk_content(
            self.context,
            self.main_entries,
            Value::new(self.availability_info),
        )
        .await?;
        let mut chunks = Vec::new();
        for chunk in content.chunks.iter() {
            chunks.push(*chunk);
        }
        Ok(ChunksVc::cell(chunks))
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for CssChunk {
    #[turbo_tasks::function]
    async fn runtime_info(&self) -> Result<OutputChunkRuntimeInfoVc> {
        let content = css_chunk_content(
            self.context,
            self.main_entries,
            Value::new(self.availability_info),
        )
        .await?;
        let entries_chunk_items: Vec<_> = self
            .main_entries
            .await?
            .iter()
            .map(|&entry| entry.as_chunk_item(self.context))
            .collect();
        let included_ids = entries_chunk_items
            .iter()
            .map(|chunk_item| chunk_item.id())
            .collect();
        let imports_chunk_items: Vec<_> = entries_chunk_items
            .iter()
            .map(|&chunk_item| async move {
                Ok(chunk_item
                    .content()
                    .await?
                    .imports
                    .iter()
                    .filter_map(|import| {
                        if let CssImport::Internal(_, item) = import {
                            Some(*item)
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>())
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();
        let module_chunks: Vec<_> = content
            .chunk_items
            .iter()
            .chain(imports_chunk_items.iter())
            .map(|item| SingleItemCssChunkVc::new(self.context, *item).into())
            .collect();
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(ModuleIdsVc::cell(included_ids)),
            module_chunks: Some(AssetsVc::cell(module_chunks)),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    async fn ident(self_vc: CssChunkVc) -> Result<AssetIdentVc> {
        let this = self_vc.await?;

        let main_entries = this.main_entries.await?;
        let main_entry_key = StringVc::cell(String::new());
        let assets = main_entries
            .iter()
            .map(|entry| (main_entry_key, entry.ident()))
            .collect::<Vec<_>>();

        let ident = if let [(_, ident)] = assets[..] {
            ident
        } else {
            let (_, ident) = assets[0];
            AssetIdentVc::new(Value::new(AssetIdent {
                path: ident.path(),
                query: None,
                fragment: None,
                assets,
                modifiers: Vec::new(),
                part: None,
            }))
        };

        Ok(AssetIdentVc::from_path(
            this.context.chunk_path(ident, ".css"),
        ))
    }

    #[turbo_tasks::function]
    fn content(self_vc: CssChunkVc) -> AssetContentVc {
        self_vc.chunk_content().content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: CssChunkVc) -> Result<AssetReferencesVc> {
        let this = self_vc.await?;
        let content = css_chunk_content(
            this.context,
            this.main_entries,
            Value::new(this.availability_info),
        )
        .await?;
        let mut references = Vec::new();
        for r in content.external_asset_references.iter() {
            references.push(*r);
            for result in r.resolve_reference().await?.primary.iter() {
                if let PrimaryResolveResult::Asset(asset) = result {
                    if let Some(embeddable) = CssEmbeddableVc::resolve_from(asset).await? {
                        let embed = embeddable.as_css_embed(this.context);
                        references.extend(embed.references().await?.iter());
                    }
                }
            }
        }
        for entry in content.async_chunk_group_entries.iter() {
            references.push(ChunkGroupReferenceVc::new(this.context, *entry).into());
        }
        for item in content.chunk_items.iter() {
            references.push(SingleItemCssChunkReferenceVc::new(this.context, *item).into());
        }
        if *this
            .context
            .reference_chunk_source_maps(self_vc.into())
            .await?
        {
            references.push(CssChunkSourceMapAssetReferenceVc::new(self_vc).into());
        }
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for CssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self_vc: CssChunkVc) -> OptionSourceMapVc {
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

    #[turbo_tasks::function]
    pub async fn chunk_item_id(self, chunk_item: CssChunkItemVc) -> Result<ModuleIdVc> {
        let layer = self.await?.context.layer();
        let mut ident = chunk_item.asset_ident();
        if !layer.await?.is_empty() {
            ident = ident.with_modifier(layer)
        }
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
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
    Composes(CssChunkItemVc),
}

#[turbo_tasks::value(shared)]
pub struct CssChunkItemContent {
    pub inner_code: Rope,
    pub imports: Vec<CssImport>,
    pub source_map: Option<ParseResultSourceMapVc>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem {
    fn content(&self) -> CssChunkItemContentVc;
    fn chunking_context(&self) -> ChunkingContextVc;
    fn id(&self) -> ModuleIdVc {
        CssChunkContextVc::of(self.chunking_context()).chunk_item_id(*self)
    }
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
        _availability_info: Value<AvailabilityInfo>,
    ) -> Result<Option<Self>> {
        Ok(None)
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("css chunk".to_string())
}

#[turbo_tasks::function]
fn entry_module_key() -> StringVc {
    StringVc::cell("entry module".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for CssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self_vc: CssChunkVc) -> StringVc {
        self_vc.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self_vc: CssChunkVc) -> Result<StringVc> {
        let content = content_to_details(self_vc.content());
        let mut details = String::new();
        let this = self_vc.await?;
        let chunk_content = css_chunk_content(
            this.context,
            this.main_entries,
            Value::new(this.availability_info),
        )
        .await?;
        details += "Chunk items:\n\n";
        for item in chunk_content.chunk_items.iter() {
            writeln!(details, "- {}", item.asset_ident().to_string().await?)?;
        }
        details += "\nContent:\n\n";
        write!(details, "{}", content.await?)?;
        Ok(StringVc::cell(details))
    }

    #[turbo_tasks::function]
    async fn children(self_vc: CssChunkVc) -> Result<IntrospectableChildrenVc> {
        let mut children = children_from_asset_references(self_vc.references())
            .await?
            .clone_value();
        for &entry in &*self_vc.await?.main_entries.await? {
            children.insert((entry_module_key(), IntrospectableAssetVc::new(entry.into())));
        }
        Ok(IntrospectableChildrenVc::cell(children))
    }
}
