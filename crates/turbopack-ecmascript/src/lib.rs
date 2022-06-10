#![feature(box_syntax)]
#![feature(box_patterns)]

pub mod analyzer;
mod errors;
pub(crate) mod parse;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod target;
pub mod typescript;
pub mod utils;
pub mod webpack;

use anyhow::Result;
use target::CompileTargetVc;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    context::AssetContextVc,
    reference::AssetReferenceVc,
};

use self::references::module_references;

#[derive(PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone)]
#[turbo_tasks::value(serialization: auto_for_input)]
pub enum ModuleAssetType {
    Ecmascript,
    Typescript,
    TypescriptDeclaration,
}

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub ty: ModuleAssetType,
    pub target: CompileTargetVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<ModuleAssetType>,
        target: CompileTargetVc,
    ) -> Self {
        Self::slot(ModuleAsset {
            source,
            context,
            ty: ty.into_value(),
            target: target,
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
    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        module_references(self.source, self.context, Value::new(self.ty), self.target)
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
