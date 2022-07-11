use anyhow::{anyhow, Result};
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc},
    reference::AssetReferencesVc,
};

#[turbo_tasks::value(shared, Asset)]
pub struct DevHtmlAsset {
    pub path: FileSystemPathVc,
    pub chunk_group: ChunkGroupVc,
}

#[turbo_tasks::value_impl]
impl Asset for DevHtmlAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<FileContentVc> {
        let context_path = self.path.parent().await?;

        let mut scripts = Vec::new();
        let mut stylesheets = Vec::new();

        for chunk in self.chunk_group.chunks().await?.iter() {
            if let Some(p) = context_path.get_relative_path_to(&*chunk.as_asset().path().await?) {
                if p.ends_with(".js") {
                    scripts.push(format!("<script src=\"{}\"></script>", p));
                } else if p.ends_with(".css") {
                    stylesheets.push(format!("<link rel=\"stylesheet\" href=\"{}\">", p));
                } else {
                    return Err(anyhow!("chunk with unknown asset type: {}", p));
                }
            }
        }

        let html = format!(
            "<!DOCTYPE html>\n<html>\n<head>{}</head>\n<body>{}</body>\n</html>",
            stylesheets.join(""),
            scripts.join(""),
        );

        Ok(FileContent::Content(File::from_source(html)).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let chunks = self.chunk_group.chunks().await?;
        let mut references = Vec::new();
        for chunk in chunks.iter() {
            references.push(ChunkReferenceVc::new(*chunk).into());
        }
        Ok(AssetReferencesVc::cell(references))
    }
}
