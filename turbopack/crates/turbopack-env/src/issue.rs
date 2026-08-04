#[cfg(not(feature = "sync"))]
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

impl ProcessEnvIssue {
    turbo_tasks::dual_fn! {
        fn description_impl(&self) -> anyhow::Result<Option<StyledString>> {
            Ok(Some((*turbo_tasks::read!(self.description)?).clone()))
        }
    }
}

#[cfg(not(feature = "sync"))]
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
        self.description_impl().await
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for ProcessEnvIssue {
    fn title(&self) -> anyhow::Result<StyledString> {
        Ok(StyledString::Text(rcstr!("Error loading dotenv file")))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Load
    }

    fn file_path(&self) -> anyhow::Result<FileSystemPath> {
        Ok(self.path.clone())
    }

    fn description(&self) -> anyhow::Result<Option<StyledString>> {
        self.description_impl()
    }
}
