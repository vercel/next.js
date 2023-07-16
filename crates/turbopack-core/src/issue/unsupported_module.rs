use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;

use super::{Issue, IssueSeverity};

#[turbo_tasks::value(shared)]
pub struct UnsupportedModuleIssue {
    pub context: Vc<FileSystemPath>,
    pub package: String,
    pub package_path: Option<String>,
}

#[turbo_tasks::value_impl]
impl Issue for UnsupportedModuleIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("resolve".to_string())
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell("Unsupported module".into())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.context
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(match &self.package_path {
            Some(path) => format!("The module {}{} is not yet supported", self.package, path),
            None => format!("The package {} is not yet supported", self.package),
        }))
    }
}
