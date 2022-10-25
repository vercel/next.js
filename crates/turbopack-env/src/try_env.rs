use std::future::IntoFuture;

use anyhow::Result;
use turbo_tasks::primitives::{OptionStringVc, StringVc};
use turbo_tasks_env::{DotenvProcessEnvVc, EnvMapVc, ProcessEnv, ProcessEnvVc};
use turbo_tasks_fs::FileSystemPathVc;

use crate::ProcessEnvIssue;

#[turbo_tasks::value]
pub struct TryDotenvProcessEnv {
    prior: ProcessEnvVc,
    path: FileSystemPathVc,
}

impl TryDotenvProcessEnv {
    async fn with_issue<T, V: Copy + IntoFuture<Output = Result<T>>>(
        &self,
        op: impl Fn(ProcessEnvVc) -> V,
    ) -> Result<V> {
        let r = op(DotenvProcessEnvVc::new(Some(self.prior), self.path).as_process_env());
        match r.await {
            Ok(_) => Ok(r),
            Err(e) => {
                let r = op(self.prior);
                // If the prior process env also reports an error we don't want to report our
                // issue
                r.await?;

                ProcessEnvIssue {
                    path: self.path,
                    description: StringVc::cell(e.to_string()),
                }
                .cell()
                .as_issue()
                .emit();
                Ok(r)
            }
        }
    }
}

#[turbo_tasks::value_impl]
impl TryDotenvProcessEnvVc {
    #[turbo_tasks::function]
    pub fn new(prior: ProcessEnvVc, path: FileSystemPathVc) -> Self {
        TryDotenvProcessEnv { prior, path }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for TryDotenvProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<EnvMapVc> {
        self.with_issue(|e| e.read_all()).await
    }

    #[turbo_tasks::function]
    async fn read(&self, name: &str) -> Result<OptionStringVc> {
        self.with_issue(|e| e.read(name)).await
    }
}
