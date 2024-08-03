use indexmap::IndexMap;
use turbo_tasks::{RcStr, Vc};

use crate::{sorted_env_vars, EnvMap, ProcessEnv, GLOBAL_ENV_LOCK};

/// Load the environment variables defined via command line.
#[turbo_tasks::value]
pub struct CommandLineProcessEnv;

#[turbo_tasks::value_impl]
impl CommandLineProcessEnv {
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        CommandLineProcessEnv.cell()
    }
}

/// Clones the current env vars into a IndexMap.
fn env_snapshot() -> IndexMap<RcStr, RcStr> {
    let _lock = GLOBAL_ENV_LOCK.lock().unwrap();
    sorted_env_vars()
}

#[turbo_tasks::value_impl]
impl ProcessEnv for CommandLineProcessEnv {
    #[turbo_tasks::function]
    fn read_all(&self) -> Vc<EnvMap> {
        Vc::cell(env_snapshot())
    }
}
