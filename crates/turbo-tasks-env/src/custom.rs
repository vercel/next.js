use anyhow::Result;
use turbo_tasks::primitives::OptionStringVc;

use crate::{case_insensitive_read, EnvMapVc, ProcessEnv, ProcessEnvVc};

/// Allows providing any custom env values that you'd like, deferring the prior
/// envs if a key is not overridden.
#[turbo_tasks::value]
pub struct CustomProcessEnv {
    prior: ProcessEnvVc,
    custom: EnvMapVc,
}

#[turbo_tasks::value_impl]
impl CustomProcessEnvVc {
    #[turbo_tasks::function]
    pub fn new(prior: ProcessEnvVc, custom: EnvMapVc) -> Self {
        CustomProcessEnv { prior, custom }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for CustomProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<EnvMapVc> {
        let prior = self.prior.read_all().await?;
        let custom = self.custom.await?;

        let mut extended = prior.clone_value();
        extended.extend(custom.clone_value());
        Ok(EnvMapVc::cell(extended))
    }

    #[turbo_tasks::function]
    async fn read(&self, name: &str) -> Result<OptionStringVc> {
        let custom = case_insensitive_read(self.custom, name);
        match &*custom.await? {
            Some(_) => Ok(custom),
            None => Ok(self.prior.read(name)),
        }
    }
}
