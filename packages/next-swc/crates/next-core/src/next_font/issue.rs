use turbo_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::core::issue::{Issue, IssueSeverityVc, IssueVc},
};
use turbo_tasks::primitives::StringVc;

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontIssue {
    pub(crate) path: FileSystemPathVc,
    pub(crate) title: StringVc,
    pub(crate) description: StringVc,
    pub(crate) severity: IssueSeverityVc,
}

#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("other".to_string())
    }

    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.description
    }
}
