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
    pub code: Option<String>,
}

#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(if let Some(code) = self.code.as_ref() {
            StringVc::cell(format!("{code} {}", self.title.await?))
        } else {
            self.title
        })
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
