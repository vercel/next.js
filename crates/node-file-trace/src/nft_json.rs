use anyhow::Result;
use json::object;
use turbo_tasks_fs::{FileContent, FileContentRef, FileSystemPathRef};
use turbopack::{
    all_assets,
    asset::{Asset, AssetRef},
    reference::AssetReferencesSetRef,
};

#[turbo_tasks::value(shared, Asset)]
#[derive(PartialEq, Eq)]
pub struct NftJsonAsset {
    entry: AssetRef,
}

#[turbo_tasks::value_impl]
impl NftJsonAssetRef {
    pub fn new(entry: AssetRef) -> Self {
        Self::slot(NftJsonAsset { entry })
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    async fn path(&self) -> Result<FileSystemPathRef> {
        let path = self.entry.path().await?;
        Ok(FileSystemPathRef::new(
            path.fs.clone(),
            &format!("{}.nft.json", path.path),
        ))
    }

    async fn content(&self) -> Result<FileContentRef> {
        let context = self.entry.path().parent().await?;
        let mut result = Vec::new();
        let set = all_assets(self.entry.clone());
        for asset in set.await?.assets.iter() {
            let path = asset.path().await?;
            result.push(context.get_relative_path_to(&path));
        }
        result.sort();
        result.dedup();
        let json = object! {
          version: 1u32,
          files: result
        };
        Ok(FileContent::Content(Vec::from(json.dump().as_bytes())).into())
    }

    fn references(&self) -> AssetReferencesSetRef {
        AssetReferencesSetRef::empty()
    }
}
