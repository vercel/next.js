use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::issue::{Issue, IssueVc};

/// An issue that occurred upon detecting a file that is unimplemented.
#[turbo_tasks::value(shared)]
pub struct UnimplementedFileIssue {
    pub path: FileSystemPathVc,
    pub description: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for UnimplementedFileIssue {
    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Feature not yet supported".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("unimplemented".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.description
    }
}
