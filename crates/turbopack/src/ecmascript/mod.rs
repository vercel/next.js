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
};
use anyhow::Result;
use turbo_tasks::{trace::TraceRawVcs, Value, Vc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use self::references::module_references;

#[derive(PartialEq, Eq, PartialOrd, Ord, Hash, Debug, Copy, Clone, TraceRawVcs)]
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
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    pub fn new(source: AssetVc, ty: Value<ModuleAssetType>) -> Self {
        Self::slot(ModuleAsset {
            source,
            ty: ty.into_value(),
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        module_references(self.source, Value::new(self.ty))
    }
}
