use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::primitives::OptionStringVc;

use crate::{EnvMapVc, ProcessEnv, ProcessEnvVc};

#[turbo_tasks::value]
pub struct FilterProcessEnv {
    prior: ProcessEnvVc,
    filter: String,
}

#[turbo_tasks::value_impl]
impl FilterProcessEnvVc {
    #[turbo_tasks::function]
    pub fn new(prior: ProcessEnvVc, filter: String) -> Self {
        FilterProcessEnv { prior, filter }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for FilterProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<EnvMapVc> {
        let prior = self.prior.read_all().await?;
        let mut filtered = IndexMap::new();
        for (key, value) in &*prior {
            if key.starts_with(&self.filter) {
                filtered.insert(key.clone(), value.clone());
            }
        }
        Ok(EnvMapVc::cell(filtered))
    }

    #[turbo_tasks::function]
    fn read(&self, name: &str) -> OptionStringVc {
        if name.starts_with(&self.filter) {
            self.prior.read(name)
        } else {
            OptionStringVc::cell(None)
        }
    }
}
