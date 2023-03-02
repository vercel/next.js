use anyhow::Result;
use turbo_tasks_env::ProcessEnvVc;
use turbo_tasks_fs::FileSystemPathVc;

#[turbo_tasks::value]
pub struct ExecutionContext {
    pub project_path: FileSystemPathVc,
    pub intermediate_output_path: FileSystemPathVc,
    pub env: ProcessEnvVc,
}

#[turbo_tasks::value_impl]
impl ExecutionContextVc {
    #[turbo_tasks::function]
    pub fn new(
        project_path: FileSystemPathVc,
        intermediate_output_path: FileSystemPathVc,
        env: ProcessEnvVc,
    ) -> Self {
        ExecutionContext {
            project_path,
            intermediate_output_path,
            env,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn join(self, name: &str) -> Result<Self> {
        let this = self.await?;
        Ok(ExecutionContextVc::new(
            this.project_path,
            this.intermediate_output_path.join(name),
            this.env,
        ))
    }

    #[turbo_tasks::function]
    pub async fn project_path(self) -> Result<FileSystemPathVc> {
        Ok(self.await?.project_path)
    }
}
