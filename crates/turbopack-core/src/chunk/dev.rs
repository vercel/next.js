use anyhow::Result;
use turbo_tasks::{primitives::BoolVc, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;

use super::{ChunkingContext, ChunkingContextVc};
use crate::asset::AssetVc;

/// A chunking context for development mode.
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value(shared)]
pub struct DevChunkingContext {
    /// This path get striped off of path before creating a name out of it
    pub context_path: FileSystemPathVc,
    /// Chunks are placed at this path
    pub chunk_root_path: FileSystemPathVc,
    /// Static assets are placed at this path
    pub asset_root_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    async fn chunk_path(
        &self,
        path_vc: FileSystemPathVc,
        extension: &str,
    ) -> Result<FileSystemPathVc> {
        fn clean(s: &str) -> String {
            s.replace('/', "_")
        }
        // For clippy -- This explicit deref is necessary
        let path = &*path_vc.await?;
        let mut name = if let Some(inner) = self.context_path.await?.get_path_to(path) {
            clean(inner)
        } else {
            clean(&path_vc.to_string().await?)
        };
        if !name.ends_with(extension) {
            name += extension;
        }
        Ok(self.chunk_root_path.join(&name))
    }

    #[turbo_tasks::function]
    async fn can_be_in_same_chunk(&self, asset_a: AssetVc, asset_b: AssetVc) -> Result<BoolVc> {
        let parent_dir = asset_a.path().parent().await?;

        let path = asset_b.path().await?;
        if let Some(rel_path) = parent_dir.get_path_to(&path) {
            if !rel_path.starts_with("node_modules/") && !rel_path.contains("/node_modules/") {
                return Ok(BoolVc::cell(true));
            }
        }

        Ok(BoolVc::cell(false))
    }

    #[turbo_tasks::function]
    fn asset_path(&self, path: &str) -> FileSystemPathVc {
        self.asset_root_path.join(path)
    }
}
