mod parse;
mod references;

use crate::{
    asset::{Asset, AssetRef, AssetsSet, AssetsSetRef},
    resolve::ResolveResult,
};
use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

use self::references::module_references;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct ModuleAsset {
    pub source: AssetRef,
}

#[turbo_tasks::value_impl]
impl ModuleAsset {
    #[turbo_tasks::constructor(intern)]
    pub fn new(source: &AssetRef) -> Self {
        Self {
            source: source.clone(),
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    fn path(&self) -> FileSystemPathRef {
        self.source.clone().path()
    }
    fn content(&self) -> FileContentRef {
        self.source.clone().content()
    }
    async fn references(&self) -> AssetsSetRef {
        let references_set = module_references(self.source.clone()).await;
        let mut assets = Vec::new();
        for reference in references_set.references.iter() {
            let resolve_result = reference
                .clone()
                .resolve(ModuleAssetRef::new(&self.source).into());
            if let ResolveResult::Module(module) = &*resolve_result.await {
                assets.push(module.clone());
            }
        }
        AssetsSet { assets }.into()
    }
}
