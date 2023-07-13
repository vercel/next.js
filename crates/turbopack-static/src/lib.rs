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

pub mod fixed;

use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::FileContent;
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableModule,
        ChunkableModuleVc, ChunkingContext, ChunkingContextVc,
    },
    context::AssetContextVc,
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    output::{OutputAsset, OutputAssetVc},
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
    source::SourceVc,
};
use turbopack_css::embed::{CssEmbed, CssEmbedVc, CssEmbeddable, CssEmbeddableVc};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptChunkingContextVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::StringifyJs,
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("static".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticModuleAsset {
    pub source: SourceVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl StaticModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: SourceVc, context: AssetContextVc) -> Self {
        Self::cell(StaticModuleAsset { source, context })
    }

    #[turbo_tasks::function]
    async fn static_asset(
        self_vc: StaticModuleAssetVc,
        context: ChunkingContextVc,
    ) -> Result<StaticAssetVc> {
        Ok(StaticAssetVc::cell(StaticAsset {
            context,
            source: self_vc.await?.source,
        }))
    }
}

#[turbo_tasks::value_impl]
impl Asset for StaticModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl Module for StaticModuleAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: StaticModuleAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context,
            self_vc.as_ecmascript_chunk_placeable(),
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: StaticModuleAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
            static_asset: self_vc.static_asset(context.into()),
        })
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.into()
    }
}

#[turbo_tasks::value_impl]
impl CssEmbeddable for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_css_embed(self_vc: StaticModuleAssetVc, context: ChunkingContextVc) -> CssEmbedVc {
        StaticCssEmbedVc::cell(StaticCssEmbed {
            static_asset: self_vc.static_asset(context),
        })
        .into()
    }
}

#[turbo_tasks::value]
struct StaticAsset {
    context: ChunkingContextVc,
    source: SourceVc,
}

#[turbo_tasks::value_impl]
impl OutputAsset for StaticAsset {}

#[turbo_tasks::value_impl]
impl Asset for StaticAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
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
            .context
            .asset_path(&content_hash_b16, self.source.ident());
        Ok(AssetIdentVc::from_path(asset_path))
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: StaticModuleAssetVc,
    context: EcmascriptChunkingContextVc,
    static_asset: StaticAssetVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.module.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(vec![SingleAssetReferenceVc::new(
            self.static_asset.into(),
            StringVc::cell(format!(
                "static(url) {}",
                self.static_asset.ident().to_string().await?
            )),
        )
        .into()]))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
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
    static_asset: StaticAssetVc,
}

#[turbo_tasks::value_impl]
impl CssEmbed for StaticCssEmbed {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(vec![SingleAssetReferenceVc::new(
            self.static_asset.into(),
            StringVc::cell(format!(
                "static(url) {}",
                self.static_asset.ident().path().await?
            )),
        )
        .into()]))
    }

    #[turbo_tasks::function]
    fn embeddable_asset(&self) -> AssetVc {
        self.static_asset.as_asset()
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
