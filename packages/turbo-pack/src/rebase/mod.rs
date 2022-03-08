use std::hash::Hash;

use anyhow::Result;
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
impl RebasedAssetRef {
    pub fn new(
        source: AssetRef,
        input_dir: FileSystemPathRef,
        output_dir: FileSystemPathRef,
    ) -> Self {
        Self::slot(RebasedAsset {
            source: source,
            input_dir: input_dir,
            output_dir: output_dir,
        })
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

    async fn references(&self) -> Result<AssetsSetRef> {
        let input_references = self.source.references().await?;
        let mut assets = Vec::new();
        for asset in input_references.assets.iter() {
            assets.push(
                RebasedAssetRef::new(
                    asset.clone(),
                    self.input_dir.clone(),
                    self.output_dir.clone(),
                )
                .into(),
            );
        }
        Ok(AssetsSet { assets }.into())
    }
}
