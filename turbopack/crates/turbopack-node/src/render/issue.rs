use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueStage, OptionStyledString, StyledString};

#[turbo_tasks::value(shared)]
#[derive(Copy, Clone)]
pub struct RenderingIssue {
    pub file_path: ResolvedVc<FileSystemPath>,
    pub message: ResolvedVc<StyledString>,
    pub status: Option<i32>,
}

#[turbo_tasks::value_impl]
impl Issue for RenderingIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Error during SSR Rendering".into()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::CodeGen.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Vc<OptionStyledString> {
        let mut details = vec![];

        if let Some(status) = self.status {
            if status != 0 {
                details.push(StyledString::Text(
                    format!("Node.js exit code: {status}").into(),
                ));
            }
        }

        Vc::cell(Some(StyledString::Stack(details).resolved_cell()))
    }

    // TODO parse stack trace into source location
}
