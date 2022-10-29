use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::FileSystemPathVc;

use super::{Issue, IssueSeverity, IssueSeverityVc, IssueVc};

#[turbo_tasks::value(shared)]
pub struct UnsupportedModuleIssue {
    pub context: FileSystemPathVc,
    pub package: String,
    pub package_path: Option<String>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("resolve".to_string())
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("Unsupported module".into())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        Ok(StringVc::cell(match &self.package_path {
            Some(path) => format!("The module {}{} is not yet supported", self.package, path),
            None => format!("The package {} is not yet supported", self.package),
        }))
    }
}
