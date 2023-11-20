pub(crate) mod single_item_chunk;
pub mod source_map;
pub(crate) mod writer;

use std::fmt::Write;

use anyhow::{bail, Result};
use indexmap::IndexSet;
use turbo_tasks::{TryJoinIterExt, Value, ValueDefault, ValueToString, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, Chunk, ChunkItem, ChunkItemWithAsyncModuleInfo, ChunkType,
        ChunkableModule, ChunkingContext, ModuleId, OutputChunk, OutputChunkRuntimeInfo,
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
    server_fs::ServerFileSystem,
    source_map::{GenerateSourceMap, OptionSourceMap},
};
use writer::expand_imports;

use self::{single_item_chunk::chunk::SingleItemCssChunk, source_map::CssChunkSourceMapAsset};
use crate::{process::ParseCssResultSourceMap, util::stringify_js, ImportAssetReference};

#[turbo_tasks::value]
pub struct CssChunk {
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub content: Vc<CssChunkContent>,
}

#[turbo_tasks::value(transparent)]
pub struct CssChunks(Vec<Vc<CssChunk>>);

#[turbo_tasks::value_impl]
impl CssChunk {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        content: Vc<CssChunkContent>,
    ) -> Vc<Self> {
        CssChunk {
            chunking_context,
            content,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn chunk_content(&self) -> Vc<CssChunkContent> {
        self.content
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        use std::io::Write;

        let this = self.await?;

        let mut body = CodeBuilder::default();
        let mut external_imports = IndexSet::new();
        for css_item in this.content.await?.chunk_items.iter() {
            // TODO(WEB-1261)
            for external_import in expand_imports(&mut body, *css_item).await? {
                external_imports.insert(external_import.await?.to_owned());
            }
        }

        let mut code = CodeBuilder::default();
        for external_import in external_imports {
            writeln!(code, "@import {};", stringify_js(&external_import))?;
        }

        code.push_code(&body.build());

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
            && code.has_source_map()
        {
            let chunk_path = self.path().await?;
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

#[turbo_tasks::value]
pub struct CssChunkContent {
    pub chunk_items: Vec<Vc<Box<dyn CssChunkItem>>>,
    pub referenced_output_assets: Vc<OutputAssets>,
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
        self.chunking_context
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        OutputAsset::references(self)
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
            .map(|chunk_item| CssChunkItem::id(*chunk_item))
            .collect();
        let imports_chunk_items: Vec<_> = entries_chunk_items
            .iter()
            .map(|&chunk_item| async move {
                let Some(css_item) =
                    Vc::try_resolve_downcast::<Box<dyn CssChunkItem>>(chunk_item).await?
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
            .map(|item| Vc::upcast(SingleItemCssChunk::new(self.chunking_context, *item)))
            .collect();
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(Vc::cell(included_ids)),
            module_chunks: Some(Vc::cell(module_chunks)),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::function]
fn chunk_item_key() -> Vc<String> {
    Vc::cell("chunk item".to_string())
}

#[turbo_tasks::value_impl]
impl OutputAsset for CssChunk {
    #[turbo_tasks::function]
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        let this = self.await?;

        let mut assets = Vec::new();

        let CssChunkContent { chunk_items, .. } = &*this.content.await?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = chunk_item.asset_ident().path().resolve().await?;
            Some((path, path.await?))
        } else {
            None
        };

        // The included chunk items and the availability info describe the chunk
        // uniquely
        let chunk_item_key = chunk_item_key();
        for &chunk_item in chunk_items.iter() {
            if let Some((common_path_vc, common_path_ref)) = common_path.as_mut() {
                let path = chunk_item.asset_ident().path().await?;
                while !path.is_inside_or_equal_ref(common_path_ref) {
                    let parent = common_path_vc.parent().resolve().await?;
                    if parent == *common_path_vc {
                        common_path = None;
                        break;
                    }
                    *common_path_vc = parent;
                    *common_path_ref = (*common_path_vc).await?;
                }
            }
            assets.push((chunk_item_key, chunk_item.content_ident()));
        }

        // Make sure the idents are resolved
        for (_, ident) in assets.iter_mut() {
            *ident = ident.resolve().await?;
        }

        let ident = AssetIdent {
            path: if let Some((common_path, _)) = common_path {
                common_path
            } else {
                ServerFileSystem::new().root()
            },
            query: Vc::<String>::default(),
            fragment: None,
            assets,
            modifiers: Vec::new(),
            part: None,
            layer: None,
        };

        Ok(AssetIdent::from_path(this.chunking_context.chunk_path(
            AssetIdent::new(Value::new(ident)),
            ".css".to_string(),
        )))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let content = this.content.await?;
        let mut references = content.referenced_output_assets.await?.clone_value();
        for item in content.chunk_items.iter() {
            references.push(Vc::upcast(SingleItemCssChunk::new(
                this.chunking_context,
                *item,
            )));
        }
        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(Vc::upcast(CssChunkSourceMapAsset::new(self)));
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
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionSourceMap> {
        self.code().generate_source_map()
    }
}

#[turbo_tasks::value]
pub struct CssChunkContext {
    chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl CssChunkContext {
    #[turbo_tasks::function]
    pub fn of(chunking_context: Vc<Box<dyn ChunkingContext>>) -> Vc<CssChunkContext> {
        CssChunkContext { chunking_context }.cell()
    }

    #[turbo_tasks::function]
    pub async fn chunk_item_id(
        self: Vc<Self>,
        chunk_item: Vc<Box<dyn CssChunkItem>>,
    ) -> Result<Vc<ModuleId>> {
        Ok(ModuleId::String(chunk_item.asset_ident().to_string().await?.clone_value()).cell())
    }
}

// TODO: remove
#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: ChunkableModule + Module + Asset {}

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
        CssChunkContext::of(CssChunkItem::chunking_context(self)).chunk_item_id(self)
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
        let chunk_content = this.content.await?;
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
        let mut children = children_from_output_assets(OutputAsset::references(self))
            .await?
            .clone_value();
        for &chunk_item in self.await?.content.await?.chunk_items.iter() {
            children.insert((
                entry_module_key(),
                IntrospectableModule::new(chunk_item.module()),
            ));
        }
        Ok(Vc::cell(children))
    }
}

#[derive(Default)]
#[turbo_tasks::value]
pub struct CssChunkType {}

#[turbo_tasks::value_impl]
impl ValueToString for CssChunkType {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<String> {
        Vc::cell("css".to_string())
    }
}

#[turbo_tasks::value_impl]
impl ChunkType for CssChunkType {
    #[turbo_tasks::function]
    async fn chunk(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_items: Vec<ChunkItemWithAsyncModuleInfo>,
        referenced_output_assets: Vc<OutputAssets>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        let content = CssChunkContent {
            chunk_items: chunk_items
                .iter()
                .map(|(chunk_item, _async_info)| async move {
                    let Some(chunk_item) =
                        Vc::try_resolve_downcast::<Box<dyn CssChunkItem>>(*chunk_item).await?
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
        Ok(Vc::upcast(CssChunk::new(chunking_context, content)))
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
        Ok(Vc::cell(
            chunk_item
                .content()
                .await
                .map_or(0, |content| content.inner_code.len()),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueDefault for CssChunkType {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}
