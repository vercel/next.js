use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontIssue {
    pub(crate) path: ResolvedVc<FileSystemPath>,
    pub(crate) title: ResolvedVc<StyledString>,
    pub(crate) description: ResolvedVc<StyledString>,
    pub(crate) severity: ResolvedVc<IssueSeverity>,
}

#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::CodeGen.into()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        *self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}
