use anyhow::Result;
use json::object;
use turbo_tasks_fs::{FileContent, FileContentVc, FileSystemPathVc};
use turbopack::{
    all_assets,
    asset::{Asset, AssetVc},
    reference::AssetReferencesSetVc,
};

#[turbo_tasks::value(shared, Asset)]
#[derive(PartialEq, Eq)]
pub struct NftJsonAsset {
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl NftJsonAssetVc {
    pub fn new(entry: AssetVc) -> Self {
        Self::slot(NftJsonAsset { entry })
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    async fn path(&self) -> Result<FileSystemPathVc> {
        let path = self.entry.path().await?;
        Ok(FileSystemPathVc::new(
            path.fs.clone(),
            &format!("{}.nft.json", path.path),
        ))
    }

    async fn content(&self) -> Result<FileContentVc> {
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

    fn references(&self) -> AssetReferencesSetVc {
        AssetReferencesSetVc::empty()
    }
}
