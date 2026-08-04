pub(crate) mod batch;
pub(crate) mod chunk_type;
pub(crate) mod code_module_ids_and_paths;
pub(crate) mod content;
pub(crate) mod content_entry;
pub(crate) mod data;
pub(crate) mod item;
pub(crate) mod placeable;

use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
#[cfg(not(feature = "sync"))]
use turbo_tasks::TryJoinIterExt;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    chunk::{Chunk, ChunkItem, ChunkItems, ChunkingContext, ModuleIds},
    ident::AssetIdent,
    introspect::{
        Introspectable, IntrospectableChildren, module::IntrospectableModule,
        utils::children_from_output_assets,
    },
    output::{OutputAssetsReference, OutputAssetsWithReferenced},
    server_fs::ServerFileSystem,
};

pub use self::{
    batch::{
        EcmascriptChunkBatchWithAsyncInfo, EcmascriptChunkItemBatchGroup,
        EcmascriptChunkItemOrBatchWithAsyncInfo,
    },
    chunk_type::EcmascriptChunkType,
    code_module_ids_and_paths::{
        BatchGroupCodeModuleIdsAndPaths, CodeModuleIdsAndPaths,
        batch_group_code_module_ids_and_paths, item_code_module_ids_and_paths,
    },
    content::EcmascriptChunkContent,
    content_entry::{EcmascriptChunkContentEntries, EcmascriptChunkContentEntry},
    data::EcmascriptChunkData,
    item::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOptions, EcmascriptChunkItemWithAsyncInfo, ecmascript_chunk_item,
    },
    placeable::{EcmascriptChunkPlaceable, EcmascriptExports},
};

#[turbo_tasks::value]
pub struct EcmascriptChunk {
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub content: ResolvedVc<EcmascriptChunkContent>,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunk {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        content: ResolvedVc<EcmascriptChunkContent>,
    ) -> Vc<Self> {
        EcmascriptChunk {
            chunking_context,
            content,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn entry_ids(self: Vc<Self>) -> Vc<ModuleIds> {
        // TODO return something useful
        Vc::cell(Default::default())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let content = turbo_tasks::read!(self.content)?;
        // The sync `parallel!` only fans out plain `Vc` reads, so the multi-step
        // per-item reads run concurrently in the async build (as before) and
        // sequentially under `sync`.
        #[cfg(not(feature = "sync"))]
        let references = content
            .chunk_items
            .iter()
            .map(async |with_info| {
                let r = turbo_tasks::read!(with_info.references())?;
                Ok((
                    turbo_tasks::read!(r.assets)?,
                    turbo_tasks::read!(r.referenced_assets)?,
                    turbo_tasks::read!(r.references)?,
                ))
            })
            .try_join()
            .await?;
        #[cfg(feature = "sync")]
        let references = {
            let mut references = Vec::with_capacity(content.chunk_items.len());
            for with_info in content.chunk_items.iter() {
                let r = turbo_tasks::read!(with_info.references())?;
                references.push((
                    turbo_tasks::read!(r.assets)?,
                    turbo_tasks::read!(r.referenced_assets)?,
                    turbo_tasks::read!(r.references)?,
                ));
            }
            references
        };
        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(
                references
                    .iter()
                    .flat_map(|(assets, _, _)| assets.into_iter().copied())
                    .collect(),
            ),
            referenced_assets: ResolvedVc::cell(
                references
                    .iter()
                    .flat_map(|(_, referenced_assets, _)| referenced_assets.into_iter().copied())
                    .collect(),
            ),
            references: ResolvedVc::cell(
                references
                    .iter()
                    .flat_map(|(_, _, references)| references.into_iter().copied())
                    .collect(),
            ),
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let chunk_items = &*turbo_tasks::read!(self.content.included_chunk_items())?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = turbo_tasks::read!(chunk_item.asset_ident())?.path.clone();
            Some(path)
        } else {
            None
        };

        // The included chunk items describe the chunk uniquely
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
        // the concurrent `try_join` in the async build and resolve sequentially under
        // `sync`.
        #[cfg(not(feature = "sync"))]
        let assets = chunk_items
            .iter()
            .map(|&chunk_item| async move {
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
            for &chunk_item in chunk_items.iter() {
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

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn chunk_items(&self) -> Vc<ChunkItems> {
        self.content.included_chunk_items()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunk {
    #[turbo_tasks::function]
    pub fn chunk_content(&self) -> Vc<EcmascriptChunkContent> {
        *self.content
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        Vc::cell(rcstr!("ecmascript chunk"))
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.ident().to_string()
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<Vc<RcStr>> {
        let mut details = String::new();
        details += "Chunk items:\n\n";
        for chunk_item in turbo_tasks::read!(self.content.included_chunk_items())? {
            writeln!(
                details,
                "- {}",
                turbo_tasks::read!(chunk_item.asset_ident().to_string())?
            )?;
        }
        Ok(Vc::cell(details.into()))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children =
            turbo_tasks::read!(children_from_output_assets(self.references()).owned())?;
        for chunk_item in
            turbo_tasks::read!(turbo_tasks::read!(self)?.content.included_chunk_items())?
        {
            children.insert((
                rcstr!("module"),
                turbo_tasks::read!(IntrospectableModule::new(chunk_item.module()).to_resolved())?,
            ));
        }
        Ok(Vc::cell(children))
    }
}
