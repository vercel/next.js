use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks_fs::{FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{asset::AssetVc, reference::all_assets};

use super::{ContentSource, ContentSourceVc};

#[turbo_tasks::value(shared, ContentSource)]
pub struct AssetGraphContentSource {
    pub root_path: FileSystemPathVc,
    pub root_asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl ContentSource for AssetGraphContentSource {
    #[turbo_tasks::function]
    async fn get(&self, path: &str) -> Result<FileContentVc> {
        let assets = all_assets_map(self.root_path, self.root_asset)
            .strongly_consistent()
            .await?;
        if let Some(asset) = assets.get(path) {
            return Ok(asset.content());
        }
        Ok(FileContent::NotFound.into())
    }
    #[turbo_tasks::function]
    async fn get_by_id(self_vc: AssetGraphContentSourceVc, id: &str) -> Result<FileContentVc> {
        let root_path_str = self_vc.await?.root_path.to_string().await?;
        if id.starts_with(&*root_path_str) {
            let path = &id[root_path_str.len()..];
            Ok(self_vc.get(path))
        } else {
            Ok(FileContent::NotFound.into())
        }
    }
}

#[turbo_tasks::value(transparent)]
struct AssetsMap(HashMap<String, AssetVc>);

#[turbo_tasks::function]
async fn all_assets_map(root_path: FileSystemPathVc, root_asset: AssetVc) -> Result<AssetsMapVc> {
    let mut map = HashMap::new();
    let root_path = root_path.await?;
    let assets = all_assets(root_asset).strongly_consistent();
    for (p, asset) in assets
        .await?
        .iter()
        .map(|asset| (asset.path(), *asset))
        .collect::<Vec<_>>()
    {
        if let Some(sub_path) = root_path.get_path_to(&*p.await?) {
            map.insert(sub_path.to_string(), asset);
        }
    }
    Ok(AssetsMapVc::cell(map))
}
