use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueVc};

#[turbo_tasks::value(shared)]
pub struct JsonIssue {
    pub path: FileSystemPathVc,
    pub error_message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for JsonIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Error parsing JSON file".to_string())
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
        self.error_message
    }

    // TODO provide source location when we extract remove JSON from FS crate.
    // fn source(&self) -> OptionIssueSourceVc {}
}
