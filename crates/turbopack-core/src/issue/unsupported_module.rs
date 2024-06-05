use anyhow::Result;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString};

#[turbo_tasks::value(shared)]
pub struct UnsupportedModuleIssue {
    pub file_path: Vc<FileSystemPath>,
    pub package: RcStr,
    pub package_path: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::ProcessModule.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Unsupported module".into()).cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Line(vec![
                StyledString::Text("The ".into()),
                StyledString::Text(
                    match &self.package_path {
                        Some(_) => "module",
                        None => "package",
                    }
                    .into(),
                ),
                StyledString::Code(match &self.package_path {
                    Some(path) => format!(" {}{}", self.package, path).into(),
                    None => format!(" {}", self.package).into(),
                }),
                StyledString::Text(" is not yet supported".into()),
            ])
            .cell(),
        )))
    }
}
