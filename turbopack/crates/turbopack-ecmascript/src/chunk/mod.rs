pub(crate) mod chunk_type;
pub(crate) mod content;
pub(crate) mod data;
pub(crate) mod item;
pub(crate) mod placeable;

use std::fmt::Write;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    chunk::{Chunk, ChunkItem, ChunkItems, ChunkingContext, ModuleIds},
    ident::AssetIdent,
    introspect::{
        module::IntrospectableModule, utils::children_from_output_assets, Introspectable,
        IntrospectableChildren,
    },
    output::{OutputAsset, OutputAssets},
    server_fs::ServerFileSystem,
};

pub use self::{
    chunk_type::EcmascriptChunkType,
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
        // TODO return something usefull
        Vc::cell(Default::default())
    }
}

#[turbo_tasks::function]
fn chunk_item_key() -> Vc<RcStr> {
    Vc::cell("chunk item".into())
}

#[turbo_tasks::function]
fn availability_root_key() -> Vc<RcStr> {
    Vc::cell("current_availability_root".into())
}

#[turbo_tasks::value_impl]
impl Chunk for EcmascriptChunk {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let chunk_items = &*self.content.included_chunk_items().await?;
        let mut common_path = if let Some(chunk_item) = chunk_items.first() {
            let path = chunk_item.asset_ident().path().to_resolved().await?;
            Some((path, path.await?))
        } else {
            None
        };

        // The included chunk items describe the chunk uniquely
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

        let chunk_item_key = chunk_item_key().to_resolved().await?;
        let assets = chunk_items
            .iter()
            .map(|&chunk_item| async move {
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

        Ok(AssetIdent::new(Value::new(ident)))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        let content = self.content.await?;
        let mut referenced_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = content
            .chunk_items
            .iter()
            .map(async |with_info| {
                Ok(with_info
                    .chunk_item
                    .references()
                    .await?
                    .into_iter()
                    .copied())
            })
            .try_flat_join()
            .await?;
        referenced_output_assets.extend(content.referenced_output_assets.iter().copied());
        Ok(Vc::cell(referenced_output_assets))
    }

    #[turbo_tasks::function]
    async fn chunk_items(&self) -> Vc<ChunkItems> {
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

    #[turbo_tasks::function]
    pub async fn chunk_items_count(&self) -> Result<Vc<usize>> {
        Ok(Vc::cell(self.content.await?.chunk_items.len()))
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("ecmascript chunk".into())
}

#[turbo_tasks::function]
fn chunk_item_module_key() -> Vc<RcStr> {
    Vc::cell("module".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for EcmascriptChunk {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
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
        let chunk_item_module_key = chunk_item_module_key().to_resolved().await?;
        for chunk_item in self.await?.content.included_chunk_items().await? {
            children.insert((
                chunk_item_module_key,
                IntrospectableModule::new(chunk_item.module())
                    .to_resolved()
                    .await?,
            ));
        }
        Ok(Vc::cell(children))
    }
}
