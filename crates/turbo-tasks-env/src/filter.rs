use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::primitives::OptionStringVc;

use crate::{EnvMapVc, ProcessEnv, ProcessEnvVc};

/// Filters env variables by some prefix. Casing of the env vars is ignored for
/// filtering.
#[turbo_tasks::value]
pub struct FilterProcessEnv {
    prior: ProcessEnvVc,
    filters: Vec<String>,
}

#[turbo_tasks::value_impl]
impl FilterProcessEnvVc {
    #[turbo_tasks::function]
    pub fn new(prior: ProcessEnvVc, filters: Vec<String>) -> Self {
        FilterProcessEnv {
            prior,
            filters: filters.into_iter().map(|f| f.to_uppercase()).collect(),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for FilterProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<EnvMapVc> {
        let prior = self.prior.read_all().await?;
        let mut filtered = IndexMap::new();
        for (key, value) in &*prior {
            let uppercase = key.to_uppercase();
            for filter in &self.filters {
                if uppercase.starts_with(filter) {
                    filtered.insert(key.clone(), value.clone());
                    break;
                }
            }
        }
        Ok(EnvMapVc::cell(filtered))
    }

    #[turbo_tasks::function]
    fn read(&self, name: &str) -> OptionStringVc {
        for filter in &self.filters {
            if name.to_uppercase().starts_with(filter) {
                return self.prior.read(name);
            }
        }
        OptionStringVc::cell(None)
    }
}
