//! JSON asset support for turbopack.
//!
//! JSON assets are parsed to ensure they contain valid JSON.
//!
//! When imported from ES modules, they produce a module that exports the
//! JSON value as an object.

#![feature(min_specialization)]

use std::fmt::Write;

use anyhow::{bail, Error, Result};
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::{FileContent, FileJsonContent};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableModule,
        ChunkableModuleVc, ChunkingContextVc,
    },
    ident::AssetIdentVc,
    module::{Module, ModuleVc},
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
    EcmascriptChunkingContextVc, EcmascriptExports, EcmascriptExportsVc,
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("json".to_string())
}

#[turbo_tasks::value]
pub struct JsonModuleAsset {
    source: AssetVc,
}

#[turbo_tasks::value_impl]
impl JsonModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc) -> Self {
        Self::cell(JsonModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for JsonModuleAsset {
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
impl Module for JsonModuleAsset {}

#[turbo_tasks::value_impl]
impl ChunkableModule for JsonModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: JsonModuleAssetVc,
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
impl EcmascriptChunkPlaceable for JsonModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: JsonModuleAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        JsonChunkItemVc::cell(JsonChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value]
struct JsonChunkItem {
    module: JsonModuleAssetVc,
    context: EcmascriptChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for JsonChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for JsonChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        // We parse to JSON and then stringify again to ensure that the
        // JSON is valid.
        let content = self.module.content().file_content();
        let data = content.parse_json().await?;
        match &*data {
            FileJsonContent::Content(data) => {
                let js_str_content = serde_json::to_string(&data.to_string())?;
                let inner_code =
                    format!("__turbopack_export_value__(JSON.parse({js_str_content}));");

                Ok(EcmascriptChunkItemContent {
                    inner_code: inner_code.into(),
                    ..Default::default()
                }
                .into())
            }
            FileJsonContent::Unparseable(e) => {
                let mut message = "Unable to make a module from invalid JSON: ".to_string();
                if let FileContent::Content(content) = &*content.await? {
                    let text = content.content().to_str()?;
                    e.write_with_content(&mut message, text.as_ref())?;
                } else {
                    write!(message, "{}", e)?;
                }

                Err(Error::msg(message))
            }
            FileJsonContent::NotFound => {
                bail!(
                    "JSON file not found: {}",
                    self.module.ident().to_string().await?
                );
            }
        }
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
