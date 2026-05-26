use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks_fs::{FileSystemPath, error::FileSystemError};

use crate::issue::{Issue, IssueSeverity, IssueStage, StyledString};

#[turbo_tasks::value(shared)]
pub struct FileSystemErrorIssue(pub(crate) Arc<FileSystemError>);

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for FileSystemErrorIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Fatal
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.0.path.clone())
    }

    fn stage(&self) -> IssueStage {
        IssueStage::WriteOutput
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!("File system operation failed")))
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let mut stack = vec![StyledString::Line(vec![
            StyledString::Text(rcstr!("Failed to ")),
            StyledString::Text(RcStr::from(self.0.operation.to_string())),
            StyledString::Text(rcstr!(": ")),
            StyledString::Text(RcStr::from(self.0.source.to_string())),
        ])];
        if let Some(hint) = self.0.hint() {
            stack.extend([
                StyledString::Line(Vec::new()), // empty line
                StyledString::Text(RcStr::from(hint)),
            ]);
        }
        Ok(Some(StyledString::Stack(stack)))
    }
}
