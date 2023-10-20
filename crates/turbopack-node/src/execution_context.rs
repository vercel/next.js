use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::ChunkingContext;

#[turbo_tasks::value]
pub struct ExecutionContext {
    pub project_path: Vc<FileSystemPath>,
    pub chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub env: Vc<Box<dyn ProcessEnv>>,
}

#[turbo_tasks::value_impl]
impl ExecutionContext {
    #[turbo_tasks::function]
    pub fn new(
        project_path: Vc<FileSystemPath>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        env: Vc<Box<dyn ProcessEnv>>,
    ) -> Vc<Self> {
        ExecutionContext {
            project_path,
            chunking_context,
            env,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn project_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.await?.project_path)
    }

    #[turbo_tasks::function]
    pub async fn chunking_context(self: Vc<Self>) -> Result<Vc<Box<dyn ChunkingContext>>> {
        Ok(self.await?.chunking_context)
    }

    #[turbo_tasks::function]
    pub async fn env(self: Vc<Self>) -> Result<Vc<Box<dyn ProcessEnv>>> {
        Ok(self.await?.env)
    }
}
