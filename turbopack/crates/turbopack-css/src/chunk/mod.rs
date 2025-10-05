pub(crate) mod single_item_chunk;
pub mod source_map;

use std::fmt::Write;

use anyhow::{Result, bail};
use swc_core::common::pass::Either;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueDefault, ValueToString, Vc,
};
use turbo_tasks_fs::{
    File, FileSystem, FileSystemPath,
    rope::{Rope, RopeBuilder},
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, Chunk, ChunkItem, ChunkItemBatchGroup, ChunkItemExt,
        ChunkItemOrBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkType,
        ChunkableModule, ChunkingContext, MinifyType, OutputChunk, OutputChunkRuntimeInfo,
        round_chunk_item_size,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    introspect::{
        Introspectable, IntrospectableChildren,
        module::IntrospectableModule,
        utils::{children_from_output_assets, content_to_details},
    },
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference_type::ImportContext,
    server_fs::ServerFileSystem,
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, utils::fileify_source_map},
};

use self::{single_item_chunk::chunk::SingleItemCssChunk, source_map::CssChunkSourceMapAsset};
use crate::{ImportAssetReference, util::stringify_js};

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

        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        // CSS chunks never have debug IDs
        let mut code = CodeBuilder::new(source_maps, false);
        let mut body = CodeBuilder::new(source_maps, false);
        let mut external_imports = FxIndexSet::default();
        for css_item in &this.content.await?.chunk_items {
            let content = &css_item.content().await?;
            for import in &content.imports {
                if let CssImport::External(external_import) = import {
                    external_imports.insert((*external_import.await?).to_string());
                }
            }

            if matches!(
                &*this.chunking_context.minify_type().await?,
                MinifyType::NoMinify
            ) {
                let id = css_item.asset_ident().to_string().await?;
                writeln!(body, "/* {id} */")?;
            }

            let close = write_import_context(&mut body, content.import_context).await?;

            let source_map = if *self
                .chunking_context()
                .should_use_file_source_map_uris()
                .await?
            {
                fileify_source_map(
                    content.source_map.as_ref(),
                    self.chunking_context().root_path().owned().await?,
                )
                .await?
            } else {
                content.source_map.clone()
            };

            body.push_source(&content.inner_code, source_map);

            if !close.is_empty() {
                writeln!(body, "{close}")?;
            }
            writeln!(body)?;
        }

        for external_import in external_imports {
            writeln!(code, "@import {};", stringify_js(&external_import))?;
        }

        let built = &body.build();
        code.push_code(built);

        let c = code.build().cell();
        Ok(c)
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;

        let rope = if code.has_source_map() {
            use std::io::Write;
            let mut rope_builder = RopeBuilder::default();
            rope_builder.concat(code.source_code());
            let source_map_path = CssChunkSourceMapAsset::new(self).path().await?;
            write!(
                rope_builder,
                "/*# sourceMappingURL={}*/",
                urlencoding::encode(source_map_path.file_name())
            )?;
            rope_builder.build()
        } else {
            code.source_code().clone()
        };

        Ok(AssetContent::file(File::from(rope).into()))
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let CssChunkContent { chunk_items, .. } = &*self.content.await?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = chunk_item.asset_ident().path().owned().await?;
            Some((path.clone(), path))
        } else {
            None
        };

        // The included chunk items and the availability info describe the chunk
        // uniquely
        for &chunk_item in chunk_items.iter() {
            if let Some((common_path_vc, common_path_ref)) = common_path.as_mut() {
                let path = chunk_item.asset_ident().path().await?;
                while !path.is_inside_or_equal_ref(common_path_ref) {
                    let parent = common_path_vc.parent();
                    if parent == *common_path_vc {
                        common_path = None;
                        break;
                    }
                    *common_path_vc = parent;
                    *common_path_ref = common_path_vc.clone();
                }
            }
        }
        let assets = chunk_items
            .iter()
            .map(|chunk_item| async move {
                Ok((
                    rcstr!("chunk item"),
                    chunk_item.content_ident().to_resolved().await?,
                ))
            })
            .try_join()
            .await?;

        let ident = AssetIdent {
            path: if let Some((common_path, _)) = common_path {
                common_path
            } else {
                ServerFileSystem::new().root().owned().await?
            },
            query: RcStr::default(),
            fragment: RcStr::default(),
            assets,
            modifiers: Vec::new(),
            parts: Vec::new(),
            layer: None,
            content_type: None,
        };

        Ok(AssetIdent::new(ident))
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
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {
    #[turbo_tasks::function]
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        Ok(AssetIdent::from_path(self.path().owned().await?))
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
        if !*self
            .chunking_context
            .is_dynamic_chunk_content_loading_enabled()
            .await?
        {
            return Ok(OutputChunkRuntimeInfo::empty());
        }

        let content = self.content.await?;
        let entries_chunk_items = &content.chunk_items;
        let included_ids = entries_chunk_items
            .iter()
            .map(|chunk_item| chunk_item.id().to_resolved())
            .try_join()
            .await?;
        let imports_chunk_items: Vec<_> = entries_chunk_items
            .iter()
            .map(|&css_item| async move {
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
        let module_chunks = if content.chunk_items.len() > 1 {
            content
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
                .await?
        } else {
            Vec::new()
        };
        Ok(OutputChunkRuntimeInfo {
            included_ids: Some(ResolvedVc::cell(included_ids)),
            module_chunks: Some(ResolvedVc::cell(module_chunks)),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for CssChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let ident = self.ident_for_path();

        Ok(self.await?.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            ident,
            None,
            rcstr!(".css"),
        ))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let content = this.content.await?;
        let should_generate_single_item_chunks = content.chunk_items.len() > 1
            && *this
                .chunking_context
                .is_dynamic_chunk_content_loading_enabled()
                .await?;
        let mut references = content
            .chunk_items
            .iter()
            .map(|item| async {
                let references = item.references().await?.into_iter().copied();
                Ok(if should_generate_single_item_chunks {
                    Either::Left(
                        references.chain(std::iter::once(ResolvedVc::upcast(
                            SingleItemCssChunk::new(*this.chunking_context, **item)
                                .to_resolved()
                                .await?,
                        ))),
                    )
                } else {
                    Either::Right(references)
                })
            })
            .try_flat_join()
            .await?;
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
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<CssChunkItemContent>;
}

#[turbo_tasks::value_impl]
impl Introspectable for CssChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("css chunk"))
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
                        rcstr!("entry module"),
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
        Vc::cell(rcstr!("css"))
    }
}

#[turbo_tasks::value_impl]
impl ChunkType for CssChunkType {
    #[turbo_tasks::function]
    fn is_style(self: Vc<Self>) -> Vc<bool> {
        Vc::cell(true)
    }

    #[turbo_tasks::function]
    async fn chunk(
        &self,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        chunk_items_or_batches: Vec<ChunkItemOrBatchWithAsyncModuleInfo>,
        _batch_groups: Vec<ResolvedVc<ChunkItemBatchGroup>>,
    ) -> Result<Vc<Box<dyn Chunk>>> {
        let mut chunk_items = Vec::new();
        // TODO operate with batches
        for item in chunk_items_or_batches {
            match item {
                ChunkItemOrBatchWithAsyncModuleInfo::ChunkItem(chunk_item) => {
                    chunk_items.push(chunk_item);
                }
                ChunkItemOrBatchWithAsyncModuleInfo::Batch(batch) => {
                    let batch = batch.await?;
                    chunk_items.extend(batch.chunk_items.iter().cloned());
                }
            }
        }
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
        }
        .cell();
        Ok(Vc::upcast(CssChunk::new(*chunking_context, content)))
    }

    #[turbo_tasks::function]
    async fn chunk_item_size(
        &self,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        chunk_item: ResolvedVc<Box<dyn ChunkItem>>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<usize>> {
        let Some(chunk_item) = ResolvedVc::try_downcast::<Box<dyn CssChunkItem>>(chunk_item) else {
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
