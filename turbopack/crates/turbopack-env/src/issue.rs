use async_trait::async_trait;
use turbo_rcstr::rcstr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::{Issue, IssueStage, StyledString};

/// An issue that occurred while resolving the parsing or evaluating the .env.
#[turbo_tasks::value(shared)]
pub struct ProcessEnvIssue {
    pub path: FileSystemPath,
    pub description: ResolvedVc<StyledString>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ProcessEnvIssue {
    async fn title(&self) -> anyhow::Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Error loading dotenv file")))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Load
    }

    async fn file_path(&self) -> anyhow::Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    async fn description(&self) -> anyhow::Result<Option<StyledString>> {
        Ok(Some((*self.description.await?).clone()))
    }
}
