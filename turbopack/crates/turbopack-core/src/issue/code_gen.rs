use anyhow::Result;
#[cfg(not(feature = "sync"))]
use async_trait::async_trait;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity, IssueSource, IssueStage, StyledString};

#[turbo_tasks::value(shared)]
pub struct CodeGenerationIssue {
    pub severity: IssueSeverity,
    pub path: FileSystemPath,
    pub title: ResolvedVc<StyledString>,
    pub message: ResolvedVc<StyledString>,
    /// Optional source location that points to where the issue originates
    pub source: Option<IssueSource>,
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }

    async fn title(&self) -> Result<StyledString> {
        Ok((*turbo_tasks::read!(self.title)?).clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*turbo_tasks::read!(self.message)?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}

/// See the async impl above; the sync engine drops `async`/`#[async_trait]`.
#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for CodeGenerationIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }

    fn title(&self) -> Result<StyledString> {
        Ok((*turbo_tasks::read!(self.title)?).clone())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*turbo_tasks::read!(self.message)?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}
