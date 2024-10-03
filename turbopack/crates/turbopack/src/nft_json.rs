use anyhow::Result;
use serde_json::json;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::all_modules_and_affecting_sources,
};

#[turbo_tasks::value(shared)]
pub struct NftJsonAsset {
    entry: Vc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(entry: Vc<Box<dyn Module>>) -> Vc<Self> {
        NftJsonAsset { entry }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let path = self.entry.ident().path().await?;
        Ok(AssetIdent::from_path(
            path.fs
                .root()
                .join(format!("{}.nft.json", path.path).into()),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        let parent_dir = self.entry.ident().path().parent().await?;
        // For clippy -- This explicit deref is necessary
        let entry_path = &*self.entry.ident().path().await?;
        let mut result = Vec::new();
        if let Some(self_path) = parent_dir.get_relative_path_to(entry_path) {
            let set = all_modules_and_affecting_sources(self.entry);
            for asset in set.await?.iter() {
                let path = asset.ident().path().await?;
                if let Some(rel_path) = parent_dir.get_relative_path_to(&path) {
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

        Ok(AssetContent::file(File::from(json.to_string()).into()))
    }
}
