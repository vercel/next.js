use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;

use super::{Issue, IssueSeverityVc, IssueVc};

#[turbo_tasks::value(shared)]
pub struct CodeGenerationIssue {
    pub severity: IssueSeverityVc,
    pub path: FileSystemPathVc,
    pub title: StringVc,
    pub message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.title
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("code generation".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
