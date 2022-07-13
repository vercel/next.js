#![feature(min_specialization)]

use anyhow::Result;
use md4::Digest;
use turbo_tasks::{primitives::StringVc, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkItem, ChunkItemVc, ChunkingContextVc},
    context::AssetContextVc,
    reference::AssetReferencesVc,
};
use turbopack_ecmascript::chunk::{
    EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemContent,
    EcmascriptChunkItemContentVc, EcmascriptChunkItemVc, EcmascriptChunkPlaceable,
    EcmascriptChunkPlaceableVc,
};

#[turbo_tasks::value(Asset, EcmascriptChunkPlaceable, ValueToString)]
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
    async fn path(&self) -> Result<FileSystemPathVc> {
        let mut hasher = md4::Md4::new();
        hasher.update(match *self.source.content().await? {
            FileContent::Content(ref file) => file.content(),
            _ => todo!("not implemented"),
        });
        let result = hasher.finalize();
        let parent_path = self.source.path().parent().await?;
        Ok(FileSystemPathVc::new(
            parent_path.fs,
            &format!("{}/{:x}", parent_path.path, result),
        ))
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        Ok(AssetReferencesVc::empty())
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(self_vc: ModuleAssetVc, context: ChunkingContextVc) -> EcmascriptChunkItemVc {
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
            "{} (static)",
            self.source.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value(ChunkItem, EcmascriptChunkItem)]
struct ModuleChunkItem {
    module: ModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(
        &self,
        chunk_context: EcmascriptChunkContextVc,
        _context: ChunkingContextVc,
    ) -> Result<EcmascriptChunkItemContentVc> {
        // TODO: code generation
        // Some(placeable) =
        //   EcmascriptChunkPlaceableVc::resolve_from(resolved_asset).await?
        // let id = context.id(placeable)
        // generate:
        // __turbopack_require__({id}) => exports / esm namespace object
        // __turbopack_xxx__
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "console.log(\"todo {}\");",
                self.module.path().to_string().await?
            ),
            id: chunk_context.id(EcmascriptChunkPlaceableVc::cast_from(self.module)),
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
