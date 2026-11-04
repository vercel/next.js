use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_env::ProcessEnv;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::ChunkingContext;

use crate::backend::NodeBackend;

#[turbo_tasks::value]
pub(crate) struct ExecutionContext {
    pub(crate) project_path: FileSystemPath,
    pub(crate) chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    pub(crate) env: ResolvedVc<Box<dyn ProcessEnv>>,
    pub(crate) node_backend: ResolvedVc<Box<dyn NodeBackend>>,
}

#[turbo_tasks::value_impl]
impl ExecutionContext {
    #[turbo_tasks::function]
    fn new(
        project_path: FileSystemPath,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        env: ResolvedVc<Box<dyn ProcessEnv>>,
        node_backend: ResolvedVc<Box<dyn NodeBackend>>,
    ) -> Vc<Self> {
        ExecutionContext {
            project_path,
            chunking_context,
            env,
            node_backend,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn project_path(&self) -> Vc<FileSystemPath> {
        self.project_path.clone().cell()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn env(&self) -> Vc<Box<dyn ProcessEnv>> {
        *self.env
    }

    #[turbo_tasks::function]
    fn node_backend(&self) -> Vc<Box<dyn NodeBackend>> {
        *self.node_backend
    }
}
