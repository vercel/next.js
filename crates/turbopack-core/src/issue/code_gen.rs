use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity};

#[turbo_tasks::value(shared)]
pub struct CodeGenerationIssue {
    pub severity: Vc<IssueSeverity>,
    pub path: Vc<FileSystemPath>,
    pub title: Vc<String>,
    pub message: Vc<String>,
}

#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        self.title
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("code generation".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        self.message
    }
}
