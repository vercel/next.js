use anyhow::Result;
use turbo_tasks::primitives::StringVc;
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
        StringVc::cell("Error parsing package.json file".to_string())
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
    fn description(&self) -> StringVc {
        StringVc::cell(self.error_message.clone())
    }
}
