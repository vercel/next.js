use anyhow::Result;
use async_trait::async_trait;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueSeverity, IssueStage, StyledString};

#[turbo_tasks::value(shared)]
pub(crate) struct NextFontIssue {
    pub(crate) path: FileSystemPath,
    pub(crate) title: ResolvedVc<StyledString>,
    pub(crate) description: ResolvedVc<StyledString>,
    pub(crate) severity: IssueSeverity,
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn title(&self) -> Result<StyledString> {
        turbo_tasks::read!(self.title.owned())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(turbo_tasks::read!(self.description.owned())?))
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for NextFontIssue {
    fn stage(&self) -> IssueStage {
        IssueStage::Resolve
    }

    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn title(&self) -> Result<StyledString> {
        turbo_tasks::read!(self.title.owned())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(turbo_tasks::read!(self.description.owned())?))
    }
}
