use anyhow::Result;
#[cfg(not(feature = "sync"))]
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

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> Result<StyledString> {
        self.title_impl().await
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Analysis
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(turbo_tasks::read!(self.source_ident)?.path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*turbo_tasks::read!(self.message)?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }

    async fn additional_sources(&self) -> Result<Vec<AdditionalIssueSource>> {
        self.additional_sources_impl().await
    }
}

/// See the async impl above; the sync engine drops `async`/`#[async_trait]`.
#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn title(&self) -> Result<StyledString> {
        self.title_impl()
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Analysis
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(turbo_tasks::read!(self.source_ident)?.path.clone())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*turbo_tasks::read!(self.message)?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }

    fn additional_sources(&self) -> Result<Vec<AdditionalIssueSource>> {
        self.additional_sources_impl()
    }
}

/// Mode-agnostic bodies for the dual `Issue` impls above.
impl AnalyzeIssue {
    turbo_tasks::dual_fn! {
        fn title_impl(&self) -> Result<StyledString> {
            let title = &*turbo_tasks::read!(self.title)?;
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
    }

    turbo_tasks::dual_fn! {
        fn additional_sources_impl(&self) -> Result<Vec<AdditionalIssueSource>> {
            if let Some(issue_source) = self.source
                && let Some(additional) =
                    turbo_tasks::read!(issue_source.to_generated_code_source())?
            {
                return Ok(vec![additional]);
            }
            Ok(vec![])
        }
    }
}
