use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueVc};

#[turbo_tasks::value(shared)]
pub struct RenderingIssue {
    pub context: FileSystemPathVc,
    pub message: StringVc,
    pub logging: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for RenderingIssue {
    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "error during rendering of {}",
            self.context.to_string().await?,
        )))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("rendering".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }

    // TODO add sub_issue for logging data
    // TODO parse stack trace
}
