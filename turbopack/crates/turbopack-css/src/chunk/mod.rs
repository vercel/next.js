pub(crate) mod single_item_chunk;
pub mod source_map;

use std::fmt::Write;

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{FxIndexSet, ResolvedVc, ValueDefault, ValueToString, Vc};
use turbo_tasks_fs::{
    File, FileContent, FileSystem, FileSystemPath,
    rope::{Rope, RopeBuilder},
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, Chunk, ChunkItem, ChunkItemBatchGroup, ChunkItemExt,
        ChunkItemOrBatchWithAsyncModuleInfo, ChunkItemWithAsyncModuleInfo, ChunkType,
        ChunkableModule, ChunkingContext, ChunkingContextExt, MinifyType, OutputChunk,
        OutputChunkRuntimeInfo, SourceMapSourceType, round_chunk_item_size,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    introspect::{
        Introspectable, IntrospectableChildren,
        module::IntrospectableModule,
        utils::{children_from_output_assets, content_to_details},
    },
    module::Module,
    output::{OutputAsset, OutputAssetsReference, OutputAssetsWithReferenced},
    reference_type::ImportContext,
    server_fs::ServerFileSystem,
    source_map::{
        GenerateSourceMap,
        utils::{absolute_fileify_source_map, relative_fileify_source_map},
    },
};

use self::{single_item_chunk::chunk::SingleItemCssChunk, source_map::CssChunkSourceMapAsset};
use crate::ImportAssetReference;

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

        let this = turbo_tasks::read!(self)?;

        let source_maps = *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )?;

        // CSS chunks never have debug IDs
        let mut code = CodeBuilder::new(source_maps, false);
        let mut body = CodeBuilder::new(source_maps, false);
        let mut external_imports = FxIndexSet::default();
        for css_item in &turbo_tasks::read!(this.content)?.chunk_items {
            let content = &turbo_tasks::read!(css_item.content())?;
            for import in &content.imports {
                if let CssImport::External(external_import) = import {
                    external_imports.insert((*turbo_tasks::read!(external_import)?).to_string());
                }
            }

            if matches!(
                &*turbo_tasks::read!(this.chunking_context.minify_type())?,
                MinifyType::NoMinify
            ) {
                let id = turbo_tasks::read!(css_item.asset_ident().to_string())?;
                writeln!(body, "/* {id} */")?;
            }

            let close =
                turbo_tasks::read!(write_import_context(&mut body, content.import_context))?;

            let chunking_context = self.chunking_context();
            let source_map = turbo_tasks::read!(content.source_map)?;
            let source_map = source_map.as_content().map(|f| f.content());
            let source_map = match *turbo_tasks::read!(chunking_context.source_map_source_type())? {
                SourceMapSourceType::AbsoluteFileUri => {
                    turbo_tasks::read!(absolute_fileify_source_map(
                        source_map,
                        turbo_tasks::read!(chunking_context.root_path().owned())?,
                    ))?
                }
                SourceMapSourceType::RelativeUri => {
                    turbo_tasks::read!(relative_fileify_source_map(
                        source_map,
                        turbo_tasks::read!(chunking_context.root_path().owned())?,
                        turbo_tasks::read!(
                            chunking_context
                                .relative_path_from_chunk_root_to_project_root()
                                .owned()
                        )?,
                    ))?
                }
                SourceMapSourceType::TurbopackUri => source_map.cloned(),
            };

            body.push_source(&content.inner_code, source_map);

            if !close.is_empty() {
                writeln!(body, "{close}")?;
            }
            writeln!(body)?;
        }

        for external_import in external_imports {
            writeln!(code, "{}", external_import)?;
        }

        let built = &body.build();
        code.push_code(built);

        let c = code.build().cell();
        Ok(c)
    }

    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = turbo_tasks::read!(self.code())?;

        let rope = if code.has_source_map() {
            use std::io::Write;
            let mut rope_builder = RopeBuilder::default();
            rope_builder.concat(code.source_code());
            let source_map_path = turbo_tasks::read!(CssChunkSourceMapAsset::new(self).path())?;
            write!(
                rope_builder,
                "/*# sourceMappingURL={}*/",
                urlencoding::encode(source_map_path.file_name())
            )?;
            rope_builder.build()
        } else {
            code.source_code().clone()
        };

        Ok(AssetContent::file(
            FileContent::Content(File::from(rope)).cell(),
        ))
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let CssChunkContent { chunk_items, .. } = &*turbo_tasks::read!(self.content)?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = turbo_tasks::read!(chunk_item.asset_ident())?.path.clone();
            Some(path)
        } else {
            None
        };

        // The included chunk items and the availability info describe the chunk
        // uniquely
        for &chunk_item in chunk_items.iter() {
            if let Some(common_path_ref) = common_path.as_mut() {
                let path = &turbo_tasks::read!(chunk_item.asset_ident())?.path;
                while !path.is_inside_or_equal_ref(common_path_ref) {
                    let parent = common_path_ref.parent();
                    if parent == *common_path_ref {
                        common_path = None;
                        break;
                    }
                    *common_path_ref = parent;
                }
            }
        }
        // `.to_resolved()` futures cannot fan out through the sync `parallel!`; keep
        // the async build concurrent and resolve sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let assets = chunk_items
            .iter()
            .map(|chunk_item| async move {
                Ok((
                    rcstr!("chunk item"),
                    turbo_tasks::read!(chunk_item.content_ident().to_resolved())?,
                ))
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let assets = {
            let mut assets = Vec::with_capacity(chunk_items.len());
            for chunk_item in chunk_items.iter() {
                assets.push((
                    rcstr!("chunk item"),
                    turbo_tasks::read!(chunk_item.content_ident().to_resolved())?,
                ));
            }
            assets
        };

        let path = if let Some(common_path) = common_path {
            common_path
        } else {
            turbo_tasks::read!(ServerFileSystem::new().root().owned())?
        };
        let mut ident = AssetIdent::from_path(path);
        ident.assets.extend(assets);

        Ok(ident.into_vc())
    }
}

turbo_tasks::dual_fn! {
pub fn write_import_context(
    body: &mut impl std::io::Write,
    import_context: Option<ResolvedVc<ImportContext>>,
) -> Result<String> {
    let mut close = String::new();
    if let Some(import_context) = import_context {
        let import_context = &*turbo_tasks::read!(import_context)?;
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
}

#[turbo_tasks::value]
pub struct CssChunkContent {
    pub chunk_items: Vec<ResolvedVc<Box<dyn CssChunkItem>>>,
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for CssChunk {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = turbo_tasks::read!(self)?;
        let content = turbo_tasks::read!(this.content)?;
        let should_generate_single_item_chunks = content.chunk_items.len() > 1
            && *turbo_tasks::read!(
                this.chunking_context
                    .is_dynamic_chunk_content_loading_enabled()
            )?;
        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item work stays concurrent in the async build and runs sequentially
        // under `sync`.
        #[cfg(not(feature = "sync"))]
        let references = content
            .chunk_items
            .iter()
            .map(|item| async {
                let refs = turbo_tasks::read!(item.references())?;
                let single_css_chunk = if should_generate_single_item_chunks {
                    Some(ResolvedVc::upcast(turbo_tasks::read!(
                        SingleItemCssChunk::new(*this.chunking_context, **item).to_resolved()
                    )?))
                } else {
                    None
                };
                Ok((
                    turbo_tasks::read!(refs.assets)?,
                    single_css_chunk,
                    turbo_tasks::read!(refs.referenced_assets)?,
                    turbo_tasks::read!(refs.references)?,
                ))
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let references = {
            let mut references = Vec::with_capacity(content.chunk_items.len());
            for item in content.chunk_items.iter() {
                let refs = turbo_tasks::read!(item.references())?;
                let single_css_chunk = if should_generate_single_item_chunks {
                    Some(ResolvedVc::upcast(turbo_tasks::read!(
                        SingleItemCssChunk::new(*this.chunking_context, **item).to_resolved()
                    )?))
                } else {
                    None
                };
                references.push((
                    turbo_tasks::read!(refs.assets)?,
                    single_css_chunk,
                    turbo_tasks::read!(refs.referenced_assets)?,
                    turbo_tasks::read!(refs.references)?,
                ));
            }
            references
        };
        let source_map = if *turbo_tasks::read!(
            this.chunking_context
                .reference_chunk_source_maps(Vc::upcast(self))
        )? {
            Some(ResolvedVc::upcast(turbo_tasks::read!(
                CssChunkSourceMapAsset::new(self).to_resolved()
            )?))
        } else {
            None
        };

        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(
                references
                    .iter()
                    .flat_map(|(assets, single_css_chunk, _, _)| {
                        assets
                            .iter()
                            .copied()
                            .chain(single_css_chunk.iter().copied())
                    })
                    .chain(source_map)
                    .collect(),
            ),
            referenced_assets: ResolvedVc::cell(
                references
                    .iter()
                    .flat_map(|(_, _, referenced_assets, _)| referenced_assets.iter().copied())
                    .collect(),
            ),
            references: ResolvedVc::cell(
                references
                    .iter()
                    .flat_map(|(_, _, _, references)| references.iter().copied())
                    .collect(),
            ),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Chunk for CssChunk {
    #[turbo_tasks::function]
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        Ok(AssetIdent::from_path(turbo_tasks::read!(self.path().owned())?).into_vc())
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
        if !*turbo_tasks::read!(
            self.chunking_context
                .is_dynamic_chunk_content_loading_enabled()
        )? {
            return Ok(OutputChunkRuntimeInfo::empty());
        }

        let content = turbo_tasks::read!(self.content)?;
        let entries_chunk_items = &content.chunk_items;
        // The sync `parallel!` only fans out plain `Vc` reads, so the dual
        // `ChunkItemExt::id` helper and `.to_resolved()` futures stay concurrent in
        // the async build and run sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let included_ids = entries_chunk_items
            .iter()
            .map(|chunk_item| chunk_item.id())
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let included_ids = {
            let mut ids = Vec::with_capacity(entries_chunk_items.len());
            for chunk_item in entries_chunk_items.iter() {
                ids.push(turbo_tasks::read!(chunk_item.id())?);
            }
            ids
        };
        // Per-item `content()` reads are plain `Vc` reads, so this fan-out stays
        // parallel in both modes.
        let imports_chunk_items: Vec<_> = turbo_tasks::parallel!(
            entries_chunk_items
                .iter()
                .map(|&css_item| css_item.content())
        )?
        .into_iter()
        .flat_map(|content| {
            content
                .imports
                .iter()
                .filter_map(|import| {
                    if let CssImport::Internal(_, item) = import {
                        Some(*item)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect();
        let module_chunks = if content.chunk_items.len() > 1 {
            #[cfg(not(feature = "sync"))]
            {
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
            }
            #[cfg(feature = "sync")]
            {
                let mut module_chunks =
                    Vec::with_capacity(content.chunk_items.len() + imports_chunk_items.len());
                for item in content.chunk_items.iter().chain(imports_chunk_items.iter()) {
                    module_chunks.push(turbo_tasks::read!(
                        Vc::upcast::<Box<dyn OutputAsset>>(SingleItemCssChunk::new(
                            *self.chunking_context,
                            **item,
                        ))
                        .to_resolved()
                    )?);
                }
                module_chunks
            }
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

        Ok(turbo_tasks::read!(self)?.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            ident,
            None,
            rcstr!(".css"),
        ))
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
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}

// TODO: remove
#[turbo_tasks::value_trait]
pub trait CssChunkPlaceable: ChunkableModule + Module {}

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
    pub source_map: ResolvedVc<FileContent>,
}

#[turbo_tasks::value_trait]
pub trait CssChunkItem: ChunkItem + OutputAssetsReference {
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
        let this = turbo_tasks::read!(self)?;
        let chunk_content = turbo_tasks::read!(this.content)?;
        details += "Chunk items:\n\n";
        for item in chunk_content.chunk_items.iter() {
            writeln!(
                details,
                "- {}",
                turbo_tasks::read!(item.asset_ident().to_string())?
            )?;
        }
        details += "\nContent:\n\n";
        write!(details, "{}", turbo_tasks::read!(content)?)?;
        Ok(Vc::cell(details.into()))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = turbo_tasks::read!(
            children_from_output_assets(OutputAssetsReference::references(self)).owned()
        )?;
        let chunk_content = turbo_tasks::read!(turbo_tasks::read!(self)?.content)?;
        // `.to_resolved()` futures cannot fan out through the sync `parallel!`; keep
        // the async build concurrent and resolve sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        children.extend(
            chunk_content
                .chunk_items
                .iter()
                .map(|chunk_item| async move {
                    Ok((
                        rcstr!("entry module"),
                        turbo_tasks::read!(
                            IntrospectableModule::new(chunk_item.module()).to_resolved()
                        )?,
                    ))
                })
                .try_join()
                .await?,
        );
        #[cfg(feature = "sync")]
        for chunk_item in chunk_content.chunk_items.iter() {
            children.insert((
                rcstr!("entry module"),
                turbo_tasks::read!(IntrospectableModule::new(chunk_item.module()).to_resolved())?,
            ));
        }
        Ok(Vc::cell(children))
    }
}

#[derive(Default, ValueToString)]
#[value_to_string("css")]
#[turbo_tasks::value]
pub struct CssChunkType {}

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
                    let batch = turbo_tasks::read!(batch)?;
                    chunk_items.extend(batch.chunk_items.iter().cloned());
                }
            }
        }
        // The per-item body never awaits — a plain loop works in both modes.
        let mut css_chunk_items = Vec::with_capacity(chunk_items.len());
        for ChunkItemWithAsyncModuleInfo { chunk_item, .. } in chunk_items.iter() {
            let Some(chunk_item) = ResolvedVc::try_downcast::<Box<dyn CssChunkItem>>(*chunk_item)
            else {
                bail!("Chunk item is not an css chunk item but reporting chunk type css");
            };
            // CSS doesn't need to care about async_info, so we can discard it
            css_chunk_items.push(chunk_item);
        }
        let content = CssChunkContent {
            chunk_items: css_chunk_items,
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
        Ok(Vc::cell(
            turbo_tasks::read!(chunk_item.content())
                .map_or(0, |content| round_chunk_item_size(content.inner_code.len())),
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
