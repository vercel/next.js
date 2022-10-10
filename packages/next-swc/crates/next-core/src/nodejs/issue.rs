use anyhow::Result;
use turbo_tasks::primitives::StringVc;
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
    fn detail(&self) -> StringVc {
        self.logging
    }

    // TODO parse stack trace into source location
}
