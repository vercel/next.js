use anyhow::Result;
use turbo_tasks_fs::{FileContent, FileSystemEntryType, FileSystemPathVc, LinkContent};

use crate::{
    asset::{Asset, AssetContent, AssetContentVc, AssetVc},
    reference::AssetReferencesVc,
};

/// The raw [Asset]. It represents raw content from a path without any
/// references to other [Asset]s.
#[turbo_tasks::value]
pub struct SourceAsset {
    pub path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl SourceAssetVc {
    #[turbo_tasks::function]
    pub fn new(path: FileSystemPathVc) -> Self {
        Self::cell(SourceAsset { path })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<AssetContentVc> {
        let file_type = &*self.path.get_type().await?;
        match file_type {
            FileSystemEntryType::Symlink => match &*self.path.read_link().await? {
                LinkContent::Link { target, link_type } => Ok(AssetContent::Redirect {
                    target: target.clone(),
                    link_type: *link_type,
                }
                .cell()),
                _ => Err(anyhow::anyhow!("Invalid symlink")),
            },
            FileSystemEntryType::File => Ok(AssetContent::File(self.path.read()).cell()),
            FileSystemEntryType::NotFound => {
                Ok(AssetContent::File(FileContent::NotFound.cell()).cell())
            }
            _ => Err(anyhow::anyhow!("Invalid file type {:?}", file_type)),
        }
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        // TODO: build input sourcemaps via language specific sourceMappingURL comment
        // or parse.
        AssetReferencesVc::empty()
    }
}
