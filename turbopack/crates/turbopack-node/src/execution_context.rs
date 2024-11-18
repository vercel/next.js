use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::ChunkingContext;

#[turbo_tasks::value]
pub struct ExecutionContext {
    pub project_path: ResolvedVc<FileSystemPath>,
    pub chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub env: ResolvedVc<Box<dyn ProcessEnv>>,
}

#[turbo_tasks::value_impl]
impl ExecutionContext {
    #[turbo_tasks::function]
    pub fn new(
        project_path: ResolvedVc<FileSystemPath>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        env: ResolvedVc<Box<dyn ProcessEnv>>,
    ) -> Vc<Self> {
        ExecutionContext {
            project_path,
            chunking_context,
            env,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn project_path(&self) -> Vc<FileSystemPath> {
        *self.project_path
    }

    #[turbo_tasks::function]
    pub fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    pub fn env(&self) -> Vc<Box<dyn ProcessEnv>> {
        *self.env
    }
}
