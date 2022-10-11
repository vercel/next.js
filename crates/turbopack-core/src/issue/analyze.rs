use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;

use super::{Issue, IssueSeverityVc, IssueSourceVc, IssueVc, OptionIssueSourceVc};

#[turbo_tasks::value(shared)]
pub struct AnalyzeIssue {
    pub severity: IssueSeverityVc,
    pub path: FileSystemPathVc,
    pub title: StringVc,
    pub message: StringVc,
    pub category: StringVc,
    pub code: Option<String>,
    pub source: Option<IssueSourceVc>,
}

#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
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
        self.category
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }

    #[turbo_tasks::function]
    fn source(&self) -> OptionIssueSourceVc {
        OptionIssueSourceVc::cell(self.source)
    }
}
