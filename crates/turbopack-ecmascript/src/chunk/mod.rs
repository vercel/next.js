pub(crate) mod chunk_type;
pub(crate) mod content;
pub(crate) mod data;
pub(crate) mod item;
pub(crate) mod placeable;

use std::fmt::Write;

use anyhow::{bail, Result};
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{Chunk, ChunkItem, ChunkingContext, ModuleIds},
    ident::AssetIdent,
    introspect::{
        module::IntrospectableModule,
        utils::{children_from_output_assets, content_to_details},
        Introspectable, IntrospectableChildren,
    },
    output::OutputAssets,
    server_fs::ServerFileSystem,
};

pub use self::{
    chunk_type::EcmascriptChunkType,
    content::EcmascriptChunkContent,
    data::EcmascriptChunkData,
    item::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkItemOptions,
    },
    placeable::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceables, EcmascriptExports},
};

#[turbo_tasks::value]
pub struct EcmascriptChunk {
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub content: Vc<EcmascriptChunkContent>,
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunks(Vec<Vc<EcmascriptChunk>>);

#[turbo_tasks::value_impl]
impl EcmascriptChunk {
    #[turbo_tasks::function]
    pub async fn new(
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        content: Vc<EcmascriptChunkContent>,
    ) -> Result<Vc<Self>> {
        Ok(EcmascriptChunk {
            chunking_context,
            content,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn entry_ids(self: Vc<Self>) -> Result<Vc<ModuleIds>> {
        // TODO return something usefull
        Ok(Vc::cell(Default::default()))
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
    async fn ident(self: Vc<Self>) -> Result<Vc<AssetIdent>> {
        let this = self.await?;

        let mut assets = Vec::new();

        let EcmascriptChunkContent { chunk_items, .. } = &*this.content.await?;
        let mut common_path = if let Some((chunk_item, _)) = chunk_items.first() {
            let path = chunk_item.asset_ident().path().resolve().await?;
            Some((path, path.await?))
        } else {
            None
        };

        // The included chunk items describe the chunk uniquely
        let chunk_item_key = chunk_item_key();
        for &(chunk_item, _) in chunk_items.iter() {
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
            query: Vc::<RcStr>::default(),
            fragment: None,
            assets,
            modifiers: Vec::new(),
            part: None,
            layer: None,
        };

        Ok(AssetIdent::new(Value::new(ident)))
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let content = this.content.await?;
        Ok(Vc::cell(content.referenced_output_assets.clone()))
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
        self.content
    }

    #[turbo_tasks::function]
    pub async fn chunk_items_count(&self) -> Result<Vc<usize>> {
        Ok(Vc::cell(self.content.await?.chunk_items.len()))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptChunk {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        bail!("EcmascriptChunk::content() is not implemented")
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
        self.path().to_string()
    }

    #[turbo_tasks::function]
    async fn details(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let content = content_to_details(self.content());
        let mut details = String::new();
        let this = self.await?;
        let chunk_content = this.content.await?;
        details += "Chunk items:\n\n";
        for (chunk_item, _) in chunk_content.chunk_items.iter() {
            writeln!(details, "- {}", chunk_item.asset_ident().to_string().await?)?;
        }
        details += "\nContent:\n\n";
        write!(details, "{}", content.await?)?;
        Ok(Vc::cell(details.into()))
    }

    #[turbo_tasks::function]
    async fn children(self: Vc<Self>) -> Result<Vc<IntrospectableChildren>> {
        let mut children = children_from_output_assets(self.references())
            .await?
            .clone_value();
        let chunk_item_module_key = chunk_item_module_key();
        for &(chunk_item, _) in self.await?.content.await?.chunk_items.iter() {
            children.insert((
                chunk_item_module_key,
                IntrospectableModule::new(chunk_item.module()),
            ));
        }
        Ok(Vc::cell(children))
    }
}
