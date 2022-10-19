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

use anyhow::{anyhow, Result};
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContent, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::{AssetReferencesVc, SingleAssetReferenceVc},
};
use turbopack_css::embed::{CssEmbed, CssEmbedVc, CssEmbeddable, CssEmbeddableVc};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::stringify_str,
};

#[turbo_tasks::value]
#[derive(Clone)]
pub struct StaticModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl StaticModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
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
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::empty())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: StaticModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for StaticModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: StaticModuleAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
            static_asset: self_vc.static_asset(context),
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
    source: AssetVc,
}

#[turbo_tasks::value_impl]
impl Asset for StaticAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<FileSystemPathVc> {
        let source_path = self.source.path();
        let content = self.source.content();
        let content_hash = if let AssetContent::File(file) = &*content.await? {
            if let FileContent::Content(file) = &*file.await? {
                turbo_tasks_hash::hash_md4(file.content())
            } else {
                return Err(anyhow!("StaticAsset::path: not found"));
            }
        } else {
            return Err(anyhow!("StaticAsset::path: unsupported file content"));
        };
        let content_hash_b16 = turbo_tasks_hash::encode_base16(&content_hash);
        let asset_path = match source_path.await?.extension() {
            Some(ext) => self.context.asset_path(&content_hash_b16, ext),
            None => self.context.asset_path(&content_hash_b16, "bin"),
        };
        Ok(asset_path)
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: StaticModuleAssetVc,
    context: ChunkingContextVc,
    static_asset: StaticAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (static)",
            self.module.await?.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::cell(vec![SingleAssetReferenceVc::new(
            self.static_asset.into(),
            StringVc::cell(format!("static(url) {}", self.static_asset.path().await?)),
        )
        .into()]))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "__turbopack_export_value__({path});",
                path = stringify_str(&format!("/{}", &*self.static_asset.path().await?))
            ),
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
            StringVc::cell(format!("static(url) {}", self.static_asset.path().await?)),
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
