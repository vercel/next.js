use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

#[turbo_tasks::value(shared)]
pub struct CodeGenerationIssue {
    pub severity: ResolvedVc<IssueSeverity>,
    pub path: ResolvedVc<FileSystemPath>,
    pub title: ResolvedVc<StyledString>,
    pub message: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self.title
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::CodeGen.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }
}
