use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::{EnvMap, ProcessEnv, TransientEnvMap, case_insensitive_read};

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
    async fn read_all(&self) -> Result<Vc<TransientEnvMap>> {
        let prior = turbo_tasks::read!(self.prior.read_all().owned())?;
        let custom = turbo_tasks::read!(self.custom.owned())?;

        let mut extended = prior;
        extended.extend(custom);
        Ok(Vc::cell(extended))
    }

    #[turbo_tasks::function]
    async fn read(&self, name: RcStr) -> Result<Vc<Option<RcStr>>> {
        let custom_transient: Vc<TransientEnvMap> =
            Vc::cell((*turbo_tasks::read!(self.custom)?).clone());
        let custom = case_insensitive_read(custom_transient, name.clone());
        match &*turbo_tasks::read!(custom)? {
            Some(_) => Ok(custom),
            None => Ok(self.prior.read(name)),
        }
    }
}
