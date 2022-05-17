pub(crate) mod parse;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod typescript;
pub mod utils;
pub mod webpack;

use crate::{
    asset::{Asset, AssetVc},
    reference::AssetReferenceVc,
    target::CompileTarget,
};
use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

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
    pub ty: ModuleAssetType,
    pub target: CompileTarget,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, ty: Value<ModuleAssetType>, target: Value<CompileTarget>) -> Self {
        Self::slot(ModuleAsset {
            source,
            ty: ty.into_value(),
            target: target.into_value(),
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
        module_references(self.source, Value::new(self.ty), Value::new(self.target))
    }
}
