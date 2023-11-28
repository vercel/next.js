use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::core::issue::{Issue, IssueSeverity, OptionStyledString, StyledString},
};

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontIssue {
    pub(crate) path: Vc<FileSystemPath>,
    pub(crate) title: Vc<StyledString>,
    pub(crate) description: Vc<StyledString>,
    pub(crate) severity: Vc<IssueSeverity>,
}

#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("other".to_string())
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        self.title
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.description))
    }
}
