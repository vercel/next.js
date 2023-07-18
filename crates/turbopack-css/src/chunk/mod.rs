pub(crate) mod single_item_chunk;
pub mod source_map;
pub(crate) mod writer;

use std::fmt::Write;

use anyhow::{anyhow, Result};
use indexmap::IndexSet;
use turbo_tasks::{TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileSystemPathOption};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, chunk_content, chunk_content_split, Chunk,
        ChunkContentResult, ChunkItem, ChunkableModule, ChunkingContext, Chunks,
        FromChunkableModule, ModuleId, OutputChunk, OutputChunkRuntimeInfo,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    introspect::{
        asset::{children_from_asset_references, content_to_details, IntrospectableAsset},
        Introspectable, IntrospectableChildren,
    },
    module::Module,
    output::OutputAsset,
    reference::{AssetReference, AssetReferences},
    resolve::PrimaryResolveResult,
    source_map::{GenerateSourceMap, OptionSourceMap},
};
use writer::expand_imports;

use self::{
    single_item_chunk::{chunk::SingleItemCssChunk, reference::SingleItemCssChunkReference},
    source_map::CssChunkSourceMapAssetReference,
};
use crate::{
    embed::{CssEmbed, CssEmbeddable},
    parse::ParseCssResultSourceMap,
    util::stringify_js,
    ImportAssetReference,
};

#[turbo_tasks::value]
pub struct CssChunk {
    pub context: Vc<Box<dyn ChunkingContext>>,
    pub main_entries: Vc<CssChunkPlaceables>,
    pub availability_info: AvailabilityInfo,
}

#[turbo_tasks::value(transparent)]
pub struct CssChunks(Vec<Vc<CssChunk>>);

#[turbo_tasks::value_impl]
impl CssChunk {
    #[turbo_tasks::function]
    pub fn new_normalized(
        context: Vc<Box<dyn ChunkingContext>>,
        main_entries: Vc<CssChunkPlaceables>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Self> {
        CssChunk {
            context,
            main_entries,
            availability_info: availability_info.into_value(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new(
        context: Vc<Box<dyn ChunkingContext>>,
        entry: Vc<Box<dyn CssChunkPlaceable>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Self> {
        Self::new_normalized(context, Vc::cell(vec![entry]), availability_info)
    }

    /// Return the most specific directory which contains all elements of the
    /// chunk.
    #[turbo_tasks::function]
    pub async fn common_parent(self: Vc<Self>) -> Result<Vc<FileSystemPathOption>> {
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
                    return Ok(Vc::cell(None));
                }
                current = parent;
            }
        }
        Ok(Vc::cell(Some(current)))
    }

    #[turbo_tasks::function]
    async fn chunk_content(self: Vc<Self>) -> Result<Vc<CssChunkContent>> {
        let this = self.await?;
        Ok(CssChunkContent::new(this.main_entries, this.context, self))
    }
}

#[turbo_tasks::value]
struct CssChunkContent {
    main_entries: Vc<CssChunkPlaceables>,
    context: Vc<Box<dyn ChunkingContext>>,
    chunk: Vc<CssChunk>,
}

#[turbo_tasks::value_impl]
impl CssChunkContent {
    #[turbo_tasks::function]
    async fn new(
        main_entries: Vc<CssChunkPlaceables>,
        context: Vc<Box<dyn ChunkingContext>>,
        chunk: Vc<CssChunk>,
    ) -> Result<Vc<Self>> {
        Ok(CssChunkContent {
            main_entries,
            context,
            chunk,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        use std::io::Write;

        let this = self.await?;
        let chunk_name = this.chunk.path().to_string();

        let mut body = CodeBuilder::default();
        let mut external_imports = IndexSet::new();
        for entry in this.main_entries.await?.iter() {
            let entry_item = entry.as_chunk_item(this.context);

            // TODO(WEB-1261)
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
            .reference_chunk_source_maps(Vc::upcast(this.chunk))
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
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            File::from(code.source_code().clone()).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for CssChunkContent {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value]
pub struct CssChunkContentResult {
    pub chunk_items: Vec<Vc<Box<dyn CssChunkItem>>>,
    pub chunks: Vec<Vc<Box<dyn Chunk>>>,
    pub external_asset_references: Vec<Vc<Box<dyn AssetReference>>>,
}

impl From<ChunkContentResult<Vc<Box<dyn CssChunkItem>>>> for CssChunkContentResult {
    fn from(from: ChunkContentResult<Vc<Box<dyn CssChunkItem>>>) -> Self {
        CssChunkContentResult {
            chunk_items: from.chunk_items,
            chunks: from.chunks,
            external_asset_references: from.external_asset_references,
        }
    }
}

#[turbo_tasks::function]
async fn css_chunk_content(
    context: Vc<Box<dyn ChunkingContext>>,
    entries: Vc<CssChunkPlaceables>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<CssChunkContentResult>> {
    let entries = entries.await?;
    let entries = entries.iter().copied();

    let contents = entries
        .map(|entry| css_chunk_content_single_entry(context, entry, availability_info))
        .collect::<Vec<_>>();

    if contents.len() == 1 {
        return Ok(contents.into_iter().next().unwrap());
    }

    let mut all_chunk_items = IndexSet::<Vc<Box<dyn CssChunkItem>>>::new();
    let mut all_chunks = IndexSet::<Vc<Box<dyn Chunk>>>::new();
    let mut all_external_asset_references = IndexSet::<Vc<Box<dyn AssetReference>>>::new();

    for content in contents {
        let CssChunkContentResult {
            chunk_items,
            chunks,
            external_asset_references,
        } = &*content.await?;
        all_chunk_items.extend(chunk_items.iter().copied());
        all_chunks.extend(chunks.iter().copied());
        all_external_asset_references.extend(external_asset_references.iter().copied());
    }

    Ok(CssChunkContentResult {
        chunk_items: all_chunk_items.into_iter().collect(),
        chunks: all_chunks.into_iter().collect(),
        external_asset_references: all_external_asset_references.into_iter().collect(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn css_chunk_content_single_entry(
    context: Vc<Box<dyn ChunkingContext>>,
    entry: Vc<Box<dyn CssChunkPlaceable>>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<CssChunkContentResult>> {
    let asset = Vc::upcast(entry);
    let res = if let Some(res) =
        chunk_content::<Box<dyn CssChunkItem>>(context, asset, None, availability_info).await?
    {
        res
    } else {
        chunk_content_split::<Box<dyn CssChunkItem>>(context, asset, None, availability_info)
            .await?
    };

    Ok(CssChunkContentResult::cell(res.into()))
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {
    #[turbo_tasks::function]
    fn ident(self: Vc<Self>) -> Vc<AssetIdent> {
        let self_as_output_asset: Vc<Box<dyn OutputAsset>> = Vc::upcast(self);
        self_as_output_asset.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.context
    }

    #[turbo_tasks::function]
    async fn parallel_chunks(&self) -> Result<Vc<Chunks>> {
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
        Ok(Vc::cell(chunks))
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<AssetReferences> {
        OutputAsset::references(self)
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for CssChunk {
    #[turbo_tasks::function]
    async fn runtime_info(&self) -> Result<Vc<OutputChunkRuntimeInfo>> {
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
            .map(|item| Vc::upcast(SingleItemCssChunk::new(self.context, *item)))
            .collect();
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(Vc::cell(included_ids)),
            module_chunks: Some(Vc::cell(module_chunks)),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for CssChunk {
    #[turbo_tasks::function]
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        let this = self.await?;

        let main_entries = this.main_entries.await?;
        let main_entry_key = Vc::cell(String::new());
        let assets = main_entries
            .iter()
            .map(|entry| (main_entry_key, entry.ident()))
            .collect::<Vec<_>>();

        let ident = if let [(_, ident)] = assets[..] {
            ident
        } else {
            let (_, ident) = assets[0];
            AssetIdent::new(Value::new(AssetIdent {
                path: ident.path(),
                query: None,
                fragment: None,
                assets,
                modifiers: Vec::new(),
                part: None,
            }))
        };

        Ok(AssetIdent::from_path(
            this.context.chunk_path(ident, ".css".to_string()),
        ))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<AssetReferences>> {
        let this = self.await?;
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
                    if let Some(embeddable) =
                        Vc::try_resolve_sidecast::<Box<dyn CssEmbeddable>>(*asset).await?
                    {
                        let embed = embeddable.as_css_embed(this.context);
                        references.extend(embed.references().await?.iter());
                    }
                }
            }
        }
        for item in content.chunk_items.iter() {
            references.push(Vc::upcast(SingleItemCssChunkReference::new(
                this.context,
                *item,
            )));
        }
        if *this
            .context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(Vc::upcast(CssChunkSourceMapAssetReference::new(self)));
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.chunk_content().content()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for CssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.chunk_content().generate_source_map()
    }
}

#[turbo_tasks::value]
pub struct CssChunkContext {
    context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl CssChunkContext {
    #[turbo_tasks::function]
    pub fn of(context: Vc<Box<dyn ChunkingContext>>) -> Vc<CssChunkContext> {
        CssChunkContext { context }.cell()
    }

    #[turbo_tasks::function]
    pub async fn chunk_item_id(
        self: Vc<Self>,
        chunk_item: Vc<Box<dyn CssChunkItem>>,
    ) -> Result<Vc<ModuleId>> {
        let layer = self.await?.context.layer();
        let mut ident = chunk_item.asset_ident();
        if !layer.await?.is_empty() {
            ident = ident.with_modifier(layer)
        }
        Ok(ModuleId::String(ident.to_string().await?.clone_value()).cell())
    }
}

#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: ChunkableModule + Module + Asset {
    fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn CssChunkItem>>;
}

#[turbo_tasks::value(transparent)]
pub struct CssChunkPlaceables(Vec<Vc<Box<dyn CssChunkPlaceable>>>);

#[derive(Clone)]
#[turbo_tasks::value(shared)]
pub enum CssImport {
    External(Vc<String>),
    Internal(Vc<ImportAssetReference>, Vc<Box<dyn CssChunkItem>>),
    Composes(Vc<Box<dyn CssChunkItem>>),
}

#[turbo_tasks::value(shared)]
pub struct CssChunkItemContent {
    pub inner_code: Rope,
    pub imports: Vec<CssImport>,
    pub source_map: Option<Vc<ParseCssResultSourceMap>>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem {
    fn content(self: Vc<Self>) -> Vc<CssChunkItemContent>;
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
    fn id(self: Vc<Self>) -> Vc<ModuleId> {
        CssChunkContext::of(self.chunking_context()).chunk_item_id(self)
    }
}

#[async_trait::async_trait]
impl FromChunkableModule for Box<dyn CssChunkItem> {
    async fn from_asset(
        context: Vc<Box<dyn ChunkingContext>>,
        asset: Vc<Box<dyn Module>>,
    ) -> Result<Option<Vc<Self>>> {
        if let Some(placeable) =
            Vc::try_resolve_downcast::<Box<dyn CssChunkPlaceable>>(asset).await?
        {
            return Ok(Some(placeable.as_chunk_item(context)));
        }
        Ok(None)
    }

    async fn from_async_asset(
        _context: Vc<Box<dyn ChunkingContext>>,
        _asset: Vc<Box<dyn ChunkableModule>>,
        _availability_info: Value<AvailabilityInfo>,
    ) -> Result<Option<Vc<Self>>> {
        Ok(None)
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<String> {
    Vc::cell("css chunk".to_string())
}

#[turbo_tasks::function]
fn entry_module_key() -> Vc<String> {
    Vc::cell("entry module".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for CssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<String> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<String> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self: Vc<Self>) -> Result<Vc<String>> {
        let content = content_to_details(self.content());
        let mut details = String::new();
        let this = self.await?;
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
        Ok(Vc::cell(details))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = children_from_asset_references(OutputAsset::references(self))
            .await?
            .clone_value();
        for &entry in &*self.await?.main_entries.await? {
            children.insert((
                entry_module_key(),
                IntrospectableAsset::new(Vc::upcast(entry)),
            ));
        }
        Ok(Vc::cell(children))
    }
}
