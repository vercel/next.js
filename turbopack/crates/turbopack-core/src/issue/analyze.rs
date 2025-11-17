use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity, IssueSource, IssueStage, OptionStyledString, StyledString};
use crate::{ident::AssetIdent, issue::OptionIssueSource};

#[turbo_tasks::value(shared)]
pub struct AnalyzeIssue {
    pub severity: IssueSeverity,
    pub source_ident: ResolvedVc<AssetIdent>,
    pub title: ResolvedVc<RcStr>,
    pub message: ResolvedVc<StyledString>,
    pub code: Option<RcStr>,
    pub source: Option<IssueSource>,
}

#[turbo_tasks::value_impl]
impl AnalyzeIssue {
    #[turbo_tasks::function]
    pub fn new(
        severity: IssueSeverity,
        source_ident: ResolvedVc<AssetIdent>,
        title: ResolvedVc<RcStr>,
        message: ResolvedVc<StyledString>,
        code: Option<RcStr>,
        source: Option<IssueSource>,
    ) -> Vc<Self> {
        Self {
            severity,
            source_ident,
            title,
            message,
            code,
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let title = &*self.title.await?;
        Ok(if let Some(code) = self.code.as_ref() {
            StyledString::Line(vec![
                StyledString::Strong(code.clone()),
                StyledString::Text(rcstr!(" ")),
                StyledString::Text(title.clone()),
            ])
        } else {
            StyledString::Text(title.clone())
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
    async fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(self.source)
    }
}
