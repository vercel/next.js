use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueVc};

/// An issue that occurred while resolving the parsing or evaluating the .env.
#[turbo_tasks::value(shared)]
pub struct ProcessEnvIssue {
    pub path: FileSystemPathVc,
    pub description: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for ProcessEnvIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error loading dotenv file".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("parse".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.description
    }
}
