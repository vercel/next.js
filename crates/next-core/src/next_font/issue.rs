use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontIssue {
    pub(crate) path: FileSystemPath,
    pub(crate) title: ResolvedVc<StyledString>,
    pub(crate) description: ResolvedVc<StyledString>,
    pub(crate) severity: IssueSeverity,
}

#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::CodeGen.into()
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
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
