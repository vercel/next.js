use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc};

use crate::{EnvMap, ProcessEnv};

/// Filters env variables by some prefix. Casing of the env vars is ignored for
/// filtering.
#[turbo_tasks::value]
pub struct FilterProcessEnv {
    prior: ResolvedVc<Box<dyn ProcessEnv>>,
    filters: Vec<RcStr>,
}

#[turbo_tasks::value_impl]
impl FilterProcessEnv {
    #[turbo_tasks::function]
    pub fn new(prior: ResolvedVc<Box<dyn ProcessEnv>>, filters: Vec<RcStr>) -> Vc<Self> {
        FilterProcessEnv {
            prior,
            filters: filters
                .into_iter()
                .map(|f| f.to_uppercase().into())
                .collect(),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for FilterProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<Vc<EnvMap>> {
        let prior = self.prior.read_all().await?;
        let mut filtered = FxIndexMap::default();
        for (key, value) in &*prior {
            let uppercase = key.to_uppercase();
            for filter in &self.filters {
                if uppercase.starts_with(&**filter) {
                    filtered.insert(key.clone(), value.clone());
                    break;
                }
            }
        }
        Ok(Vc::cell(filtered))
    }

    #[turbo_tasks::function]
    fn read(&self, name: RcStr) -> Vc<Option<RcStr>> {
        for filter in &self.filters {
            if name.to_uppercase().starts_with(&**filter) {
                return self.prior.read(name);
            }
        }
        Vc::cell(None)
    }
}
