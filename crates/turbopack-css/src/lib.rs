#![feature(min_specialization)]

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
};

pub mod chunk;
pub(crate) mod parse;
pub(crate) mod references;

use crate::{
    chunk::{
        CssChunkContextVc, CssChunkItem, CssChunkItemVc, CssChunkPlaceable, CssChunkPlaceableVc,
        CssChunkVc,
    },
    references::module_references,
};

#[turbo_tasks::value(Asset, CssChunkPlaceable, ChunkableAsset, ValueToString)]
#[derive(Clone)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
        Self::cell(ModuleAsset { source, context })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(module_references(self.source, self.context))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        CssChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> CssChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleAsset {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "css {}",
            self.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value(ChunkItem, CssChunkItem)]
struct ModuleChunkItem {
    module: ModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {}

#[turbo_tasks::value_impl]
impl CssChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        _chunk_content: CssChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<StringVc> {
        // TODO: code generation & remove imports
        Ok(StringVc::cell(format!(
            "/* {} */\n{}",
            self.module.path().to_string().await?,
            match &*self.module.content().await? {
                FileContent::NotFound => "/* File not Found? */".to_string(),
                FileContent::Content(file) => String::from_utf8(file.content().to_vec())?,
            }
        )))
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
