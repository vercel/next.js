use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueVc};

#[turbo_tasks::value(shared)]
#[derive(Copy, Clone)]
pub(super) struct RenderingIssue {
    pub context: FileSystemPathVc,
    pub message: StringVc,
    pub status: Option<i32>,
}

#[turbo_tasks::value_impl]
impl Issue for RenderingIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error during SSR Rendering".to_string())
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

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<StringVc> {
        let mut details = vec![];

        if let Some(status) = self.status {
            details.push(format!("Node.js exit code: {status}"));
        }

        Ok(StringVc::cell(details.join("\n")))
    }

    // TODO parse stack trace into source location
}
