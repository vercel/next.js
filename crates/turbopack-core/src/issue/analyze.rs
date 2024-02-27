use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{
    Issue, IssueSeverity, IssueSource, IssueStage, OptionIssueSource, OptionStyledString,
    StyledString,
};
use crate::ident::AssetIdent;

#[turbo_tasks::value(shared)]
pub struct AnalyzeIssue {
    pub severity: Vc<IssueSeverity>,
    pub source_ident: Vc<AssetIdent>,
    pub title: Vc<String>,
    pub message: Vc<StyledString>,
    pub code: Option<String>,
    pub source: Option<Vc<IssueSource>>,
}

#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let title = &*self.title.await?;
        Ok(if let Some(code) = self.code.as_ref() {
            StyledString::Line(vec![
                StyledString::Strong(code.to_string()),
                StyledString::Text(" ".to_string()),
                StyledString::Text(title.to_string()),
            ])
        } else {
            StyledString::Text(title.to_string())
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Analysis.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source_ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(self.source)
    }
}
