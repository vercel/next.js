use anyhow::Result;
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::chunk::{ChunkingContext, ChunkingContextVc};

#[turbo_tasks::value]
pub struct ExecutionContext {
    pub project_path: FileSystemPathVc,
    pub chunking_context: ChunkingContextVc,
    pub env: ProcessEnvVc,
}

#[turbo_tasks::value_impl]
impl ExecutionContextVc {
    #[turbo_tasks::function]
    pub fn new(
        project_path: FileSystemPathVc,
        chunking_context: ChunkingContextVc,
        env: ProcessEnvVc,
    ) -> Self {
        ExecutionContext {
            project_path,
            chunking_context,
            env,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn with_layer(self, layer: &str) -> Result<Self> {
        let this = self.await?;
        Ok(ExecutionContext {
            project_path: this.project_path,
            chunking_context: this.chunking_context.with_layer(layer),
            env: this.env,
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn project_path(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.project_path)
    }

    #[turbo_tasks::function]
    pub async fn chunking_context(self) -> Result<ChunkingContextVc> {
        Ok(self.await?.chunking_context)
    }

    #[turbo_tasks::function]
    pub async fn env(self) -> Result<ProcessEnvVc> {
        Ok(self.await?.env)
    }
}
