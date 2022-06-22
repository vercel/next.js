#![feature(box_syntax)]
#![feature(box_patterns)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod chunk;
mod errors;
pub(crate) mod parse;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod target;
pub mod typescript;
pub mod utils;
pub mod webpack;

use crate::chunk::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc};
use anyhow::Result;
use chunk::{EcmascriptChunkContextVc, EcmascriptChunkItem, EcmascriptChunkItemVc};
use target::CompileTargetVc;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    context::AssetContextVc,
    reference::AssetReferenceVc,
};

use self::references::module_references;

#[turbo_tasks::value(serialization: auto_for_input)]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum ModuleAssetType {
    Ecmascript,
    Typescript,
    TypescriptDeclaration,
}

#[turbo_tasks::value(shared)]
pub enum ProcessingGoal {
    Asset,
    EcmascriptChunkItem(EcmascriptChunkContextVc),
}

#[turbo_tasks::value(Asset, EcmascriptChunkPlaceable)]
#[derive(Clone)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub ty: ModuleAssetType,
    pub target: CompileTargetVc,
    pub node_native_bindings: bool,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<ModuleAssetType>,
        target: CompileTargetVc,
        node_native_bindings: bool,
    ) -> Self {
        Self::slot(ModuleAsset {
            source,
            context,
            ty: ty.into_value(),
            target: target,
            node_native_bindings,
        })
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
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        Ok(module_references(
            self.source,
            self.context,
            Value::new(self.ty),
            self.target,
            self.node_native_bindings,
            ProcessingGoal::Asset.into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(&self, context: EcmascriptChunkContextVc) -> EcmascriptChunkItemVc {
        ModuleChunkItemVc::slot(ModuleChunkItem {
            module: self.clone(),
            context,
        })
        .into()
    }
}

#[turbo_tasks::value(EcmascriptChunkItem)]
struct ModuleChunkItem {
    module: ModuleAsset,
    context: EcmascriptChunkContextVc,
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {}

#[turbo_tasks::value_impl]
impl Asset for ModuleChunkItem {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.module.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        // TODO make a chunk item
        self.module.source.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        Ok(module_references(
            self.module.source,
            self.module.context,
            Value::new(self.module.ty),
            self.module.target,
            self.module.node_native_bindings,
            ProcessingGoal::EcmascriptChunkItem(self.context).into(),
        ))
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
