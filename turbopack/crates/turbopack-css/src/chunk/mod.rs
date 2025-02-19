pub(crate) mod single_item_chunk;
pub mod source_map;

use std::fmt::Write;

use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Value, ValueDefault, ValueToString, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        round_chunk_item_size, AsyncModuleInfo, Chunk, ChunkItem, ChunkItemWithAsyncModuleInfo,
        ChunkType, ChunkableModule, ChunkingContext, ModuleId, OutputChunk, OutputChunkRuntimeInfo,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    introspect::{
        module::IntrospectableModule,
        utils::{children_from_output_assets, content_to_details},
        Introspectable, IntrospectableChildren,
    },
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference_type::ImportContext,
    server_fs::ServerFileSystem,
    source_map::{utils::fileify_source_map, GenerateSourceMap, OptionStringifiedSourceMap},
};

use self::{single_item_chunk::chunk::SingleItemCssChunk, source_map::CssChunkSourceMapAsset};
use crate::{util::stringify_js, ImportAssetReference};

#[turbo_tasks::value]
pub struct CssChunk {
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub content: ResolvedVc<CssChunkContent>,
}

#[turbo_tasks::value_impl]
impl CssChunk {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        content: ResolvedVc<CssChunkContent>,
    ) -> Vc<Self> {
        CssChunk {
            chunking_context,
            content,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn chunk_content(&self) -> Vc<CssChunkContent> {
        *self.content
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        use std::io::Write;

        let this = self.await?;

        let mut code = CodeBuilder::default();
        let mut body = CodeBuilder::default();
        let mut external_imports = FxIndexSet::default();
        for css_item in &this.content.await?.chunk_items {
            let id = &*css_item.id().await?;

            let content = &css_item.content().await?;
            for import in &content.imports {
                if let CssImport::External(external_import) = import {
                    external_imports.insert((*external_import.await?).to_string());
                }
            }

            writeln!(body, "/* {} */", id)?;
            let close = write_import_context(&mut body, content.import_context).await?;

            let source_map = if *self
                .chunking_context()
                .should_use_file_source_map_uris()
                .await?
            {
                fileify_source_map(
                    content.source_map.as_ref(),
                    self.chunking_context().root_path(),
                )
                .await?
            } else {
                content.source_map.clone()
            };

            body.push_source(&content.inner_code, source_map);

            writeln!(body, "{close}")?;
            writeln!(body)?;
        }

        for external_import in external_imports {
            writeln!(code, "@import {};", stringify_js(&external_import))?;
        }

        let built = &body.build();
        code.push_code(built);

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
            && code.has_source_map()
        {
            let chunk_path = self.path().await?;
            writeln!(
                code,
                "/*# sourceMappingURL={}.map*/",
                urlencoding::encode(chunk_path.file_name())
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

pub async fn write_import_context(
    body: &mut impl std::io::Write,
    import_context: Option<ResolvedVc<ImportContext>>,
) -> Result<String> {
    let mut close = String::new();
    if let Some(import_context) = import_context {
        let import_context = &*import_context.await?;
        if !&import_context.layers.is_empty() {
            writeln!(body, "@layer {} {{", import_context.layers.join("."))?;
            close.push_str("\n}");
        }
        if !&import_context.media.is_empty() {
            writeln!(body, "@media {} {{", import_context.media.join(" and "))?;
            close.push_str("\n}");
        }
        if !&import_context.supports.is_empty() {
            writeln!(
                body,
                "@supports {} {{",
                import_context.supports.join(" and ")
            )?;
            close.push_str("\n}");
        }
    }
    Ok(close)
}

#[turbo_tasks::value]
pub struct CssChunkContent {
    pub chunk_items: Vec<ResolvedVc<Box<dyn CssChunkItem>>>,
    pub referenced_output_assets: ResolvedVc<OutputAssets>,
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {
    #[turbo_tasks::function]
    fn ident(self: Vc<Self>) -> Vc<AssetIdent> {
        AssetIdent::from_path(self.path())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }
}

#[turbo_tasks::value_impl]
impl OutputChunk for CssChunk {
    #[turbo_tasks::function]
    async fn runtime_info(&self) -> Result<Vc<OutputChunkRuntimeInfo>> {
        let content = self.content.await?;
        let entries_chunk_items = &content.chunk_items;
        let included_ids = entries_chunk_items
            .iter()
            .map(|chunk_item| CssChunkItem::id(**chunk_item).to_resolved())
            .try_join()
            .await?;
        let imports_chunk_items: Vec<_> = entries_chunk_items
            .iter()
            .map(|&chunk_item| async move {
                let Some(css_item) = ResolvedVc::try_downcast::<Box<dyn CssChunkItem>>(chunk_item)
                else {
                    return Ok(vec![]);
                };
                Ok(css_item
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
                    .collect())
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();
        let module_chunks = content
            .chunk_items
            .iter()
            .chain(imports_chunk_items.iter())
            .map(|item| {
                Vc::upcast::<Box<dyn OutputAsset>>(SingleItemCssChunk::new(
                    *self.chunking_context,
                    **item,
                ))
                .to_resolved()
            })
            .try_join()
            .await?;
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(ResolvedVc::cell(included_ids)),
            module_chunks: Some(ResolvedVc::cell(module_chunks)),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::function]
fn chunk_item_key() -> Vc<RcStr> {
    Vc::cell("chunk item".into())
}

#[turbo_tasks::value_impl]
impl OutputAsset for CssChunk {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<Vc<FileSystemPath>> {
        let CssChunkContent { chunk_items, .. } = &*self.content.await?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = chunk_item.asset_ident().path().to_resolved().await?;
            Some((path, path.await?))
        } else {
            None
        };

        // The included chunk items and the availability info describe the chunk
        // uniquely
        let chunk_item_key = chunk_item_key().to_resolved().await?;
        for &chunk_item in chunk_items.iter() {
            if let Some((common_path_vc, common_path_ref)) = common_path.as_mut() {
                let path = chunk_item.asset_ident().path().await?;
                while !path.is_inside_or_equal_ref(common_path_ref) {
                    let parent = common_path_vc.parent().to_resolved().await?;
                    if parent == *common_path_vc {
                        common_path = None;
                        break;
                    }
                    *common_path_vc = parent;
                    *common_path_ref = (*common_path_vc).await?;
                }
            }
        }
        let assets = chunk_items
            .iter()
            .map(|chunk_item| async move {
                Ok((
                    chunk_item_key,
                    chunk_item.content_ident().to_resolved().await?,
                ))
            })
            .try_join()
            .await?;

        let ident = AssetIdent {
            path: if let Some((common_path, _)) = common_path {
                common_path
            } else {
                ServerFileSystem::new().root().to_resolved().await?
            },
            query: ResolvedVc::cell(RcStr::default()),
            fragment: None,
            assets,
            modifiers: Vec::new(),
            parts: Vec::new(),
            layer: None,
        };

        Ok(self
            .chunking_context
            .chunk_path(AssetIdent::new(Value::new(ident)), ".css".into()))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let content = this.content.await?;
        let mut references = content.referenced_output_assets.owned().await?;
        references.extend(
            content
                .chunk_items
                .iter()
                .map(|item| async {
                    SingleItemCssChunk::new(*this.chunking_context, **item)
                        .to_resolved()
                        .await
                        .map(ResolvedVc::upcast)
                })
                .try_join()
                .await?,
        );
        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(ResolvedVc::upcast(
                CssChunkSourceMapAsset::new(self).to_resolved().await?,
            ));
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for CssChunk {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.content()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for CssChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value]
pub struct CssChunkContext {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl CssChunkContext {
    #[turbo_tasks::function]
    pub fn of(chunking_context: ResolvedVc<Box<dyn ChunkingContext>>) -> Vc<CssChunkContext> {
        CssChunkContext { chunking_context }.cell()
    }

    #[turbo_tasks::function]
    pub async fn chunk_item_id(
        self: Vc<Self>,
        chunk_item: Vc<Box<dyn CssChunkItem>>,
    ) -> Result<Vc<ModuleId>> {
        Ok(ModuleId::String(chunk_item.asset_ident().to_string().owned().await?).cell())
    }
}

// TODO: remove
#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: ChunkableModule + Module + Asset {}

#[derive(Clone, Debug)]
#[turbo_tasks::value(shared)]
pub enum CssImport {
    External(ResolvedVc<RcStr>),
    Internal(
        ResolvedVc<ImportAssetReference>,
        ResolvedVc<Box<dyn CssChunkItem>>,
    ),
    Composes(ResolvedVc<Box<dyn CssChunkItem>>),
}

#[derive(Debug)]
#[turbo_tasks::value(shared)]
pub struct CssChunkItemContent {
    pub import_context: Option<ResolvedVc<ImportContext>>,
    pub imports: Vec<CssImport>,
    pub inner_code: Rope,
    pub source_map: Option<Rope>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem {
    fn content(self: Vc<Self>) -> Vc<CssChunkItemContent>;
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn ChunkingContext>>;
    fn id(self: Vc<Self>) -> Vc<ModuleId> {
        CssChunkContext::of(CssChunkItem::chunking_context(self)).chunk_item_id(self)
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("css chunk".into())
}

#[turbo_tasks::function]
fn entry_module_key() -> Vc<RcStr> {
    Vc::cell("entry module".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for CssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let content = content_to_details(self.content());
        let mut details = String::new();
        let this = self.await?;
        let chunk_content = this.content.await?;
        details += "Chunk items:\n\n";
        for item in chunk_content.chunk_items.iter() {
            writeln!(details, "- {}", item.asset_ident().to_string().await?)?;
        }
        details += "\nContent:\n\n";
        write!(details, "{}", content.await?)?;
        Ok(Vc::cell(details.into()))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = children_from_output_assets(OutputAsset::references(self))
            .owned()
            .await?;
        children.extend(
            self.await?
                .content
                .await?
                .chunk_items
                .iter()
                .map(|chunk_item| async move {
                    Ok((
                        entry_module_key().to_resolved().await?,
                        IntrospectableModule::new(chunk_item.module())
                            .to_resolved()
                            .await?,
                    ))
                })
                .try_join()
                .await?,
        );
        Ok(Vc::cell(children))
    }
}

#[derive(Default)]
#[turbo_tasks::value]
pub struct CssChunkType {}

#[turbo_tasks::value_impl]
impl ValueToString for CssChunkType {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("css".into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkType for CssChunkType {
    #[turbo_tasks::function]
    fn must_keep_item_order(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    async fn chunk(
        &self,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
        referenced_output_assets: ResolvedVc<OutputAssets>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        let content = CssChunkContent {
            chunk_items: chunk_items
                .iter()
                .map(async |ChunkItemWithAsyncModuleInfo { chunk_item, .. }| {
                    let Some(chunk_item) =
                        ResolvedVc::try_downcast::<Box<dyn CssChunkItem>>(*chunk_item)
                    else {
                        bail!("Chunk item is not an css chunk item but reporting chunk type css");
                    };
                    // CSS doesn't need to care about async_info, so we can discard it
                    Ok(chunk_item)
                })
                .try_join()
                .await?,
            referenced_output_assets,
        }
        .cell();
        Ok(Vc::upcast(CssChunk::new(*chunking_context, content)))
    }

    #[turbo_tasks::function]
    async fn chunk_item_size(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: Vc<Box<dyn ChunkItem>>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<usize>> {
        let Some(chunk_item) =
            Vc::try_resolve_downcast::<Box<dyn CssChunkItem>>(chunk_item).await?
        else {
            bail!("Chunk item is not an css chunk item but reporting chunk type css");
        };
        Ok(Vc::cell(chunk_item.content().await.map_or(0, |content| {
            round_chunk_item_size(content.inner_code.len())
        })))
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for CssChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
