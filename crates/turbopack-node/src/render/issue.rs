use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::issue::Issue;

#[turbo_tasks::value(shared)]
#[derive(Copy, Clone)]
pub struct RenderingIssue {
    pub context: Vc<FileSystemPath>,
    pub message: Vc<String>,
    pub status: Option<i32>,
}

#[turbo_tasks::value_impl]
impl Issue for RenderingIssue {
    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell("Error during SSR Rendering".to_string())
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("rendering".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.context
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        self.message
    }

    #[turbo_tasks::function]
    async fn detail(&self) -> Result<Vc<String>> {
        let mut details = vec![];

        if let Some(status) = self.status {
            if status != 0 {
                details.push(format!("Node.js exit code: {status}"));
            }
        }

        Ok(Vc::cell(details.join("\n")))
    }

    // TODO parse stack trace into source location
}
