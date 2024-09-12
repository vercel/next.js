use std::{env, sync::MutexGuard};

use anyhow::{anyhow, Context, Result};
use indexmap::IndexMap;
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};

use crate::{sorted_env_vars, EnvMap, ProcessEnv, GLOBAL_ENV_LOCK};

/// Load the environment variables defined via a dotenv file, with an
/// optional prior state that we can lookup already defined variables
/// from.
#[turbo_tasks::value]
pub struct DotenvProcessEnv {
    prior: Option<Vc<Box<dyn ProcessEnv>>>,
    path: Vc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl DotenvProcessEnv {
    #[turbo_tasks::function]
    pub fn new(prior: Option<Vc<Box<dyn ProcessEnv>>>, path: Vc<FileSystemPath>) -> Vc<Self> {
        DotenvProcessEnv { prior, path }.cell()
    }

    #[turbo_tasks::function]
    pub async fn read_prior(self: Vc<Self>) -> Result<Vc<EnvMap>> {
        let this = self.await?;
        match this.prior {
            None => Ok(EnvMap::empty()),
            Some(p) => Ok(p.read_all()),
        }
    }

    #[turbo_tasks::function]
    pub async fn read_all_with_prior(self: Vc<Self>, prior: Vc<EnvMap>) -> Result<Vc<EnvMap>> {
        let this = self.await?;
        let prior = prior.await?;

        let file = this.path.read().await?;
        if let FileContent::Content(f) = &*file {
            let res;
            let vars;
            {
                let lock = GLOBAL_ENV_LOCK.lock().unwrap();

                // Unfortunately, dotenvy only looks up variable references from the global env.
                // So we must mutate while we process. Afterwards, we can restore the initial
                // state.
                let initial = sorted_env_vars();

                restore_env(&initial, &prior, &lock);

                // from_read will load parse and evalute the Read, and set variables
                // into the global env. If a later dotenv defines an already defined
                // var, it'll be ignored.
                res = dotenv::from_read(f.read()).map(|e| e.load());

                vars = sorted_env_vars();
                restore_env(&vars, &initial, &lock);
            }

            if let Err(e) = res {
                return Err(e).context(anyhow!(
                    "unable to read {} for env vars",
                    this.path.to_string().await?
                ));
            }

            Ok(Vc::cell(vars))
        } else {
            Ok(Vc::cell(prior.clone_value()))
        }
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for DotenvProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(self: Vc<Self>) -> Result<Vc<EnvMap>> {
        let prior = self.read_prior();
        Ok(self.read_all_with_prior(prior))
    }
}

/// Restores the global env variables to mirror `to`.
fn restore_env(from: &IndexMap<RcStr, RcStr>, to: &IndexMap<RcStr, RcStr>, _lock: &MutexGuard<()>) {
    for key in from.keys() {
        if !to.contains_key(key) {
            env::remove_var(key);
        }
    }
    for (key, value) in to {
        match from.get(key) {
            Some(v) if v == value => {}
            _ => env::set_var(key, value),
        }
    }
}
