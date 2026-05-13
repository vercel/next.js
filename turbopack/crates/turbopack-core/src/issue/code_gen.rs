use anyhow::Result;
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
        Ok((*self.title.await?).clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some((*self.message.await?).clone()))
    }

    fn source(&self) -> Option<IssueSource> {
        self.source
    }
}
