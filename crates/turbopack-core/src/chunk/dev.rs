use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

use super::{ChunkingContext, ChunkingContextVc};

#[turbo_tasks::value(shared, ChunkingContext)]
pub struct DevChunkingContext {
    pub context_path: FileSystemPathVc,
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
