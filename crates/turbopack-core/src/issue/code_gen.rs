use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity, OptionStyledString, StyledString};

#[turbo_tasks::value(shared)]
pub struct CodeGenerationIssue {
    pub severity: Vc<IssueSeverity>,
    pub path: Vc<FileSystemPath>,
    pub title: Vc<StyledString>,
    pub message: Vc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        self.title
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("code generation".to_string())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }
}
