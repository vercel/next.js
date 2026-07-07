use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{AdditionalIssueSource, Issue, IssueSeverity, IssueSource, IssueStage, StyledString};
use crate::ident::AssetIdent;

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

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        let title = &*self.title.await?;
        Ok(if let Some(code) = self.code.as_ref() {
            StyledString::Line(vec![
                StyledString::Strong(code.clone()),
                StyledString::Text(rcstr!(" ")),
                StyledString::Text(title.clone()),
            ])
        } else {
            StyledString::Text(title.clone())
        })
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Analysis
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.source_ident.await?.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*self.message.await?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }

    async fn additional_sources(&self) -> Result<Vec<AdditionalIssueSource>> {
        if let Some(issue_source) = self.source
            && let Some(additional) = issue_source.to_generated_code_source().await?
        {
            return Ok(vec![additional]);
        }
        Ok(vec![])
    }
}
