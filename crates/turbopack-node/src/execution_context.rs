use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;

#[turbo_tasks::value]
pub struct ExecutionContext {
    pub project_root: FileSystemPathVc,
    pub intermediate_output_path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl ExecutionContextVc {
    #[turbo_tasks::function]
    pub fn new(project_root: FileSystemPathVc, intermediate_output_path: FileSystemPathVc) -> Self {
        ExecutionContext {
            project_root,
            intermediate_output_path,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn join(self, name: &str) -> Result<Self> {
        let this = self.await?;
        Ok(ExecutionContextVc::new(
            this.project_root,
            this.intermediate_output_path.join(name),
        ))
    }
}
