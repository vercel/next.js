use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueStage, OptionStyledString, StyledString};

/// An issue that occurred while resolving the parsing or evaluating the .env.
#[turbo_tasks::value(shared)]
pub struct ProcessEnvIssue {
    pub path: ResolvedVc<FileSystemPath>,
    pub description: ResolvedVc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for ProcessEnvIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Error loading dotenv file".into()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Load.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}
