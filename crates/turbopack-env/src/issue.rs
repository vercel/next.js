use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::Issue;

/// An issue that occurred while resolving the parsing or evaluating the .env.
#[turbo_tasks::value(shared)]
pub struct ProcessEnvIssue {
    pub path: Vc<FileSystemPath>,
    pub description: Vc<String>,
}

#[turbo_tasks::value_impl]
impl Issue for ProcessEnvIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell("Error loading dotenv file".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("parse".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        self.description
    }
}
