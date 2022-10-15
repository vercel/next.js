use anyhow::Result;
use serde_json::json;
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    reference::{all_assets, AssetReferencesVc},
};

#[turbo_tasks::value(shared)]
pub struct NftJsonAsset {
    entry: AssetVc,
}

#[turbo_tasks::value_impl]
impl NftJsonAssetVc {
    #[turbo_tasks::function]
    pub fn new(entry: AssetVc) -> Self {
        Self::cell(NftJsonAsset { entry })
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn path(&self) -> Result<FileSystemPathVc> {
        let path = self.entry.path().await?;
        Ok(path.fs.root().join(&format!("{}.nft.json", path.path)))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let context = self.entry.path().parent().await?;
        // For clippy -- This explicit deref is necessary
        let entry_path = &*self.entry.path().await?;
        let mut result = Vec::new();
        if let Some(self_path) = context.get_relative_path_to(entry_path) {
            let set = all_assets(self.entry);
            for asset in set.await?.iter() {
                let path = asset.path().await?;
                if let Some(rel_path) = context.get_relative_path_to(&path) {
                    if rel_path != self_path {
                        result.push(rel_path);
                    }
                }
            }
            result.sort();
            result.dedup();
        }
        let json = json!({
          "version": 1,
          "files": result
        });

        Ok(File::from(json.to_string()).into())
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}
