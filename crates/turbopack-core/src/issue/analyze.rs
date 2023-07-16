use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity, IssueSource, OptionIssueSource};
use crate::ident::AssetIdent;

#[turbo_tasks::value(shared)]
pub struct AnalyzeIssue {
    pub severity: Vc<IssueSeverity>,
    pub source_ident: Vc<AssetIdent>,
    pub title: Vc<String>,
    pub message: Vc<String>,
    pub category: Vc<String>,
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
    async fn title(&self) -> Result<Vc<String>> {
        Ok(if let Some(code) = self.code.as_ref() {
            Vc::cell(format!("{code} {}", self.title.await?))
        } else {
            self.title
        })
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        self.category
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.source_ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        self.message
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(self.source)
    }
}
