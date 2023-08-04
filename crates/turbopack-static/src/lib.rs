//! Static asset support for turbopack.
//!
//! Static assets are copied directly to the output folder.
//!
//! When imported from ES modules, they produce a thin module that simply
//! exports the asset's path.
//!
//! When referred to from CSS assets, the reference is replaced with the asset's
//! path.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(async_fn_in_trait)]

pub mod fixed;

use anyhow::{anyhow, Result};
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
    reference::{ModuleReferences, SingleOutputAssetReference},
    source::Source,
};
use turbopack_css::embed::{CssEmbed, CssEmbeddable};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkingContext, EcmascriptExports,
    },
    utils::StringifyJs,
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("static".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticModuleAsset {
    pub source: Vc<Box<dyn Source>>,
    pub asset_context: Vc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl StaticModuleAsset {
    #[turbo_tasks::function]
    pub fn new(source: Vc<Box<dyn Source>>, asset_context: Vc<Box<dyn AssetContext>>) -> Vc<Self> {
        Self::cell(StaticModuleAsset {
            source,
            asset_context,
        })
    }

    #[turbo_tasks::function]
    async fn static_asset(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<StaticAsset>> {
        Ok(StaticAsset::cell(StaticAsset {
            chunking_context,
            source: self.await?.source,
        }))
    }
}

#[turbo_tasks::value_impl]
impl Module for StaticModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            chunking_context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(ModuleChunkItem::cell(ModuleChunkItem {
            module: self,
            chunking_context,
            static_asset: self.static_asset(Vc::upcast(chunking_context)),
        }))
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.into()
    }
}

#[turbo_tasks::value_impl]
impl CssEmbeddable for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_css_embed(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn CssEmbed>> {
        Vc::upcast(StaticCssEmbed::cell(StaticCssEmbed {
            static_asset: self.static_asset(chunking_context),
        }))
    }
}

#[turbo_tasks::value]
struct StaticAsset {
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    source: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl OutputAsset for StaticAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let content = self.source.content();
        let content_hash = if let AssetContent::File(file) = &*content.await? {
            if let FileContent::Content(file) = &*file.await? {
                turbo_tasks_hash::hash_xxh3_hash64(file.content())
            } else {
                return Err(anyhow!("StaticAsset::path: not found"));
            }
        } else {
            return Err(anyhow!("StaticAsset::path: unsupported file content"));
        };
        let content_hash_b16 = turbo_tasks_hash::encode_hex(content_hash);
        let asset_path = self
            .chunking_context
            .asset_path(content_hash_b16, self.source.ident());
        Ok(AssetIdent::from_path(asset_path))
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: Vc<StaticModuleAsset>,
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    static_asset: Vc<StaticAsset>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        Ok(Vc::cell(vec![Vc::upcast(SingleOutputAssetReference::new(
            Vc::upcast(self.static_asset),
            Vc::cell(format!(
                "static(url) {}",
                self.static_asset.ident().to_string().await?
            )),
        ))]))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_export_value__({path});",
                path = StringifyJs(&format_args!(
                    "/{}",
                    &*self.static_asset.ident().path().await?
                ))
            )
            .into(),
            ..Default::default()
        }
        .into())
    }
}

#[turbo_tasks::value]
struct StaticCssEmbed {
    static_asset: Vc<StaticAsset>,
}

#[turbo_tasks::value_impl]
impl CssEmbed for StaticCssEmbed {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        Ok(Vc::cell(vec![Vc::upcast(self.static_asset)]))
    }

    #[turbo_tasks::function]
    fn embeddable_asset(&self) -> Vc<Box<dyn OutputAsset>> {
        Vc::upcast(self.static_asset)
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
