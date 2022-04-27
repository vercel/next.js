use anyhow::Result;
use json::object;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContent, FileContentVc, FileSystemPathVc};
use turbopack::{
    all_assets,
    asset::{Asset, AssetVc},
    reference::AssetReferenceVc,
};

#[turbo_tasks::value(shared, Asset)]
#[derive(PartialEq, Eq)]
pub struct NftJsonAsset {
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl NftJsonAssetVc {
    #[turbo_tasks::function]
    pub fn new(entry: AssetVc) -> Self {
        Self::slot(NftJsonAsset { entry })
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    async fn path(&self) -> Result<FileSystemPathVc> {
        let path = self.entry.path().await?;
        Ok(FileSystemPathVc::new(
            path.fs,
            &format!("{}.nft.json", path.path),
        ))
    }

    async fn content(&self) -> Result<FileContentVc> {
        let context = self.entry.path().parent().await?;
        let self_path = context.get_relative_path_to(&*self.entry.path().await?);
        let mut result = Vec::new();
        let set = all_assets(self.entry);
        for asset in set.await?.assets.iter() {
            let path = asset.path().await?;
            let rel_path = context.get_relative_path_to(&path);
            if rel_path != self_path {
                result.push(rel_path);
            }
        }
        result.sort();
        result.dedup();
        let json = object! {
          version: 1u32,
          files: result
        };
        Ok(FileContent::Content(Vec::from(json.dump().as_bytes())).into())
    }

    fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        Vc::default()
    }
}
