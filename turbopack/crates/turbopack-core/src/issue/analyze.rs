use anyhow::Result;
use either::Either;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;

use super::{
    Issue, IssueSeverity, IssueSource, IssueStage, OptionIssueSource, OptionStyledString,
    StyledString,
};
use crate::ident::AssetIdent;

#[turbo_tasks::value(shared)]
pub struct AnalyzeIssue {
    pub severity: ResolvedVc<IssueSeverity>,
    pub title: ResolvedVc<RcStr>,
    pub message: ResolvedVc<StyledString>,
    pub code: Option<RcStr>,
    pub source_or_ident: Either<ResolvedVc<IssueSource>, ResolvedVc<AssetIdent>>,
}

#[turbo_tasks::value_impl]
impl AnalyzeIssue {
    #[turbo_tasks::function]
    pub fn new_with_source(
        severity: ResolvedVc<IssueSeverity>,
        title: ResolvedVc<RcStr>,
        message: ResolvedVc<StyledString>,
        code: Option<RcStr>,
        source: ResolvedVc<IssueSource>,
    ) -> Vc<Self> {
        Self {
            severity,
            title,
            message,
            code,
            source_or_ident: Either::Left(source),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_with_asset_ident(
        severity: ResolvedVc<IssueSeverity>,
        title: ResolvedVc<RcStr>,
        message: ResolvedVc<StyledString>,
        code: Option<RcStr>,
        ident: ResolvedVc<AssetIdent>,
    ) -> Vc<Self> {
        Self {
            severity,
            title,
            message,
            code,
            source_or_ident: Either::Right(ident),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Issue for AnalyzeIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let title = &**self.title.await?;
        Ok(if let Some(code) = self.code.as_ref() {
            StyledString::Line(vec![
                StyledString::Strong(code.clone()),
                StyledString::Text(" ".into()),
                StyledString::Text(title.into()),
            ])
        } else {
            StyledString::Text(title.into())
        }
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Analysis.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source_or_ident
            .either(|source| source.file_path(), |ident| ident.path())
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.message))
    }

    #[turbo_tasks::function]
    async fn source(&self) -> Result<Vc<OptionIssueSource>> {
        Ok(Vc::cell(match self.source_or_ident {
            Either::Left(source) => Some(
                source
                    .resolve_source_map(source.file_path())
                    .to_resolved()
                    .await?,
            ),
            Either::Right(_) => None,
        }))
    }
}
