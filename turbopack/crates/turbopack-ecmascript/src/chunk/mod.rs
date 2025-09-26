pub(crate) mod batch;
pub(crate) mod chunk_type;
pub(crate) mod code_and_ids;
pub(crate) mod content;
pub(crate) mod data;
pub(crate) mod item;
pub(crate) mod placeable;

use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    chunk::{Chunk, ChunkItem, ChunkItems, ChunkingContext, ModuleIds},
    ident::AssetIdent,
    introspect::{
        Introspectable, IntrospectableChildren, module::IntrospectableModule,
        utils::children_from_output_assets,
    },
    output::OutputAssets,
    server_fs::ServerFileSystem,
};

pub use self::{
    batch::{
        EcmascriptChunkBatchWithAsyncInfo, EcmascriptChunkItemBatchGroup,
        EcmascriptChunkItemOrBatchWithAsyncInfo,
    },
    chunk_type::EcmascriptChunkType,
    code_and_ids::{BatchGroupCodeAndIds, CodeAndIds, batch_group_code_and_ids, item_code_and_ids},
    content::EcmascriptChunkContent,
    data::EcmascriptChunkData,
    item::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOptions, EcmascriptChunkItemWithAsyncInfo,
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
impl Chunk for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let chunk_items = &*self.content.included_chunk_items().await?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = chunk_item.asset_ident().path().owned().await?;
            Some(path)
        } else {
            None
        };

        // The included chunk items describe the chunk uniquely
        for &chunk_item in chunk_items.iter() {
            if let Some(common_path_ref) = common_path.as_mut() {
                let path = chunk_item.asset_ident().path().await?;
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

        let assets = chunk_items
            .iter()
            .map(|&chunk_item| async move {
                Ok((
                    rcstr!("chunk item"),
                    chunk_item.content_ident().to_resolved().await?,
                ))
            })
            .try_join()
            .await?;

        let ident = AssetIdent {
            path: if let Some(common_path) = common_path {
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

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let content = self.content.await?;
        let referenced_output_assets = content
            .chunk_items
            .iter()
            .map(async |with_info| Ok(with_info.references().await?.into_iter().copied()))
            .try_flat_join()
            .await?;
        Ok(Vc::cell(referenced_output_assets))
    }

    #[turbo_tasks::function]
    fn chunk_items(&self) -> Vc<ChunkItems> {
        self.content.included_chunk_items()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn to_string(self: Vc<Self>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("chunk {}", self.ident().to_string().await?).into(),
        ))
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
    async fn details(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let mut details = String::new();
        let this = self.await?;
        details += "Chunk items:\n\n";
        for chunk_item in this.content.included_chunk_items().await? {
            writeln!(details, "- {}", chunk_item.asset_ident().to_string().await?)?;
        }
        Ok(Vc::cell(details.into()))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = children_from_output_assets(self.references())
            .owned()
            .await?;
        for chunk_item in self.await?.content.included_chunk_items().await? {
            children.insert((
                rcstr!("module"),
                IntrospectableModule::new(chunk_item.module())
                    .to_resolved()
                    .await?,
            ));
        }
        Ok(Vc::cell(children))
    }
}
