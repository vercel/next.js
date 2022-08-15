use anyhow::{anyhow, Result};
use mime_guess::mime::TEXT_HTML_UTF_8;
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc},
    reference::AssetReferencesVc,
};

#[turbo_tasks::value(shared)]
pub struct DevHtmlAsset {
    pub path: FileSystemPathVc,
    pub chunk_groups: Vec<ChunkGroupVc>,
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

        for chunk_group in &self.chunk_groups {
            for chunk in chunk_group.chunks().await?.iter() {
                let chunk_path = &*chunk.path().await?;
                if let Some(p) = context_path.get_relative_path_to(chunk_path) {
                    if p.ends_with(".js") {
                        scripts.push(format!("<script src=\"{}\"></script>", p));
                    } else if p.ends_with(".css") {
                        stylesheets.push(format!("<link rel=\"stylesheet\" href=\"{}\">", p));
                    } else {
                        return Err(anyhow!("chunk with unknown asset type: {}", p));
                    }
                }
            }
        }

        let html = format!(
            "<!DOCTYPE html>\n<html>\n<head>\n{}\n</head>\n<body>\n<div \
             id=root></div>\n{}\n</body>\n</html>",
            stylesheets.join("\n"),
            scripts.join("\n"),
        );

        Ok(FileContent::Content(File::from_source(html).with_content_type(TEXT_HTML_UTF_8)).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let mut references = Vec::new();
        for chunk_group in &self.chunk_groups {
            let chunks = chunk_group.chunks().await?;
            for chunk in chunks.iter() {
                references.push(ChunkReferenceVc::new(*chunk).into());
            }
        }
        Ok(AssetReferencesVc::cell(references))
    }
}
