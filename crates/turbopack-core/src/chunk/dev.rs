use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use super::{ChunkingContext, ChunkingContextVc};

/// A chunking context for development mode.
/// It uses readable filenames and module ids to improve development.
/// It also uses a chunking heuristic that is incremental and cacheable.
/// It splits "node_modules" separately as these are less likely to change
/// during development
#[turbo_tasks::value(shared, ChunkingContext)]
pub struct DevChunkingContext {
    /// This path get striped off of path before creating a name out of it
    pub context_path: FileSystemPathVc,
    /// Chunks are placed at this path
    pub root_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ChunkingContext for DevChunkingContext {
    #[turbo_tasks::function]
    async fn as_chunk_path(&self, path: FileSystemPathVc) -> Result<FileSystemPathVc> {
        fn clean(s: &str) -> String {
            s.replace("/", "_")
        }
        let name = if let Some(inner) = self.context_path.await?.get_path_to(&*path.await?) {
            clean(inner)
        } else {
            clean(&*path.to_string().await?)
        };
        Ok(self.root_path.join(&name))
    }
}
