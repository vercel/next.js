use anyhow::Result;
use turbo_tasks::primitives::StringVc;
use turbo_tasks_env::{DotenvProcessEnvVc, EnvMapVc, ProcessEnv, ProcessEnvVc};
use turbo_tasks_fs::FileSystemPathVc;

use crate::ProcessEnvIssue;

#[turbo_tasks::value]
pub struct TryDotenvProcessEnv {
    dotenv: DotenvProcessEnvVc,
    prior: ProcessEnvVc,
    path: FileSystemPathVc,
}

#[turbo_tasks::value_impl]
impl TryDotenvProcessEnvVc {
    #[turbo_tasks::function]
    pub fn new(prior: ProcessEnvVc, path: FileSystemPathVc) -> Self {
        let dotenv = DotenvProcessEnvVc::new(Some(prior), path);
        TryDotenvProcessEnv {
            dotenv,
            prior,
            path,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for TryDotenvProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<EnvMapVc> {
        let dotenv = self.dotenv;
        let prior = dotenv.read_prior();

        // Ensure prior succeeds. If it doesn't, then we don't want to attempt to read
        // the dotenv file (and potentially emit an Issue), just trust that the prior
        // will have emitted its own.
        prior.await?;

        let vars = dotenv.read_all_with_prior(prior);
        match vars.await {
            Ok(_) => Ok(vars),
            Err(e) => {
                // If parsing the dotenv file fails (but getting the prior value didn't), then
                // we want to emit an Issue and fall back to the prior's read.
                ProcessEnvIssue {
                    path: self.path,
                    // read_all_with_prior will wrap a current error with a context containing the
                    // failing file, which we don't really care about (we report the filepath as the
                    // Issue context, not the description). So extract the real error.
                    description: StringVc::cell(e.root_cause().to_string()),
                }
                .cell()
                .as_issue()
                .emit();
                Ok(prior)
            }
        }
    }
}
