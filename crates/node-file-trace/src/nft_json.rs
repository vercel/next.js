use anyhow::Result;
use json::object;
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
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
        Ok(FileSystemPathVc::new(
            path.fs,
            &format!("{}.nft.json", path.path),
        ))
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let context = self.entry.path().parent().await?;
        // For clippy -- This explicit deref is necessary
        let entry_path = &*self.entry.path().await?;
        let self_path = context.get_relative_path_to(entry_path);
        let mut result = Vec::new();
        let set = all_assets(self.entry);
        for asset in set.await?.iter() {
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

        Ok(FileContent::Content(File::from_source(json.dump())).cell())
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        AssetReferencesVc::empty()
    }
}
