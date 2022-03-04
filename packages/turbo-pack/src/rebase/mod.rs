use std::hash::Hash;

use turbo_tasks_fs::{FileContentRef, FileSystemPathRef};

use crate::asset::{Asset, AssetRef, AssetsSet, AssetsSetRef};

#[turbo_tasks::value(Asset)]
#[derive(Hash, PartialEq, Eq)]
pub struct RebasedAsset {
    source: AssetRef,
    input_dir: FileSystemPathRef,
    output_dir: FileSystemPathRef,
}

#[turbo_tasks::value_impl]
impl RebasedAsset {
    #[turbo_tasks::constructor(intern)]
    pub fn new(
        source: &AssetRef,
        input_dir: &FileSystemPathRef,
        output_dir: &FileSystemPathRef,
    ) -> Self {
        Self {
            source: source.clone(),
            input_dir: input_dir.clone(),
            output_dir: output_dir.clone(),
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for RebasedAsset {
    async fn path(&self) -> FileSystemPathRef {
        FileSystemPathRef::rebase(
            self.source.path(),
            self.input_dir.clone(),
            self.output_dir.clone(),
        )
    }

    async fn content(&self) -> FileContentRef {
        self.source.path().read()
    }

    async fn references(&self) -> AssetsSetRef {
        let input_references = self.source.references().await;
        let mut assets = Vec::new();
        for asset in input_references.assets.iter() {
            assets.push(RebasedAssetRef::new(asset, &self.input_dir, &self.output_dir).into());
        }
        AssetsSet { assets }.into()
    }
}
