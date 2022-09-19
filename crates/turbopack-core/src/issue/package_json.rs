use anyhow::Result;
use turbo_tasks::{primitives::StringVc, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;

use super::{Issue, IssueVc};

#[turbo_tasks::value(shared)]
pub struct PackageJsonIssue {
    pub path: FileSystemPathVc,
    pub error_message: String,
}

#[turbo_tasks::value_impl]
impl Issue for PackageJsonIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("an error occurred while parsing a package.json file".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("parse".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "An error happened while parsing a package.json file.
Error message: {error}
Path to the package.json file: {context}",
            error = self.error_message,
            context = self.path.to_string().await?
        )))
    }
}
