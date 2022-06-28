use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::{ChunkGroupVc, ChunkReferenceVc},
    reference::AssetReferenceVc,
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
        let mut str = format!("<!doctype html><html><body>");
        for chunk in self.chunk_group.chunks().await?.iter() {
            if let Some(p) = context_path.get_relative_path_to(&*chunk.as_asset().path().await?) {
                str += &format!("<script src=\"{p}\"></script>");
            }
        }
        str += "</body></html>";
        Ok(FileContent::Content(File::from_source(str)).into())
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        let chunks = self.chunk_group.chunks().await?;
        let mut references = Vec::new();
        for chunk in chunks.iter() {
            references.push(ChunkReferenceVc::new(*chunk).into());
        }
        Ok(Vc::slot(references))
    }
}
