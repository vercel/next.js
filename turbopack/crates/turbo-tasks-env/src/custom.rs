use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{case_insensitive_read, EnvMap, ProcessEnv};

/// Allows providing any custom env values that you'd like, deferring the prior
/// envs if a key is not overridden.
#[turbo_tasks::value]
pub struct CustomProcessEnv {
    prior: ResolvedVc<Box<dyn ProcessEnv>>,
    custom: ResolvedVc<EnvMap>,
}

#[turbo_tasks::value_impl]
impl CustomProcessEnv {
    #[turbo_tasks::function]
    pub fn new(prior: ResolvedVc<Box<dyn ProcessEnv>>, custom: ResolvedVc<EnvMap>) -> Vc<Self> {
        CustomProcessEnv { prior, custom }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for CustomProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<Vc<EnvMap>> {
        let prior = self.prior.read_all().owned().await?;
        let custom = self.custom.owned().await?;

        let mut extended = prior;
        extended.extend(custom);
        Ok(Vc::cell(extended))
    }

    #[turbo_tasks::function]
    async fn read(&self, name: RcStr) -> Result<Vc<Option<RcStr>>> {
        let custom = case_insensitive_read(*self.custom, name.clone());
        match &*custom.await? {
            Some(_) => Ok(custom),
            None => Ok(self.prior.read(name)),
        }
    }
}
