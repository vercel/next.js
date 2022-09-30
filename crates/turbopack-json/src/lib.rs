//! JSON asset support for turbopack.
//!
//! JSON assets are parsed to ensure they contain valid JSON.
//!
//! When imported from ES modules, they produce a module that exports the
//! JSON value as an object.

#![feature(min_specialization)]

pub mod issue;

use anyhow::Result;
use issue::{JsonIssue, JsonIssueVc};
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
    EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc, EcmascriptChunkVc,
};

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
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
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

#[turbo_tasks::value_impl]
impl ChunkableAsset for JsonModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: JsonModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.as_ecmascript_chunk_placeable()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for JsonModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: JsonModuleAssetVc,
        context: ChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        JsonChunkItemVc::cell(JsonChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }
}

#[turbo_tasks::value]
struct JsonChunkItem {
    module: JsonModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for JsonChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (json)",
            self.module.await?.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for JsonChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for JsonChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
        // We parse to JSON and then stringify again to ensure that the
        // JSON is valid.
        let inner_code = match self.module.path().read_json().to_string().await {
            Ok(content) => {
                let js_str_content = serde_json::to_string(content.as_str())?;
                format!("__turbopack_export_value__(JSON.parse({js_str_content}));",)
            }
            Err(error) => {
                let error_message = format!("{:?}", error.to_string());
                let js_error_message = serde_json::to_string(&format!(
                    "An error occurred while importing a JSON module: {}",
                    &error_message
                ))?;
                let issue: JsonIssueVc = JsonIssue {
                    path: self.module.path(),
                    error_message: StringVc::cell(error_message),
                }
                .into();
                issue.as_issue().emit();
                format!("throw new Error({error})", error = &js_error_message,)
            }
        };
        Ok(EcmascriptChunkItemContent {
            inner_code,
            ..Default::default()
        }
        .into())
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
