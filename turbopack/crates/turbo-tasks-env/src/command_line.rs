use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, Vc};

use crate::{GLOBAL_ENV_LOCK, ProcessEnv, TransientEnvMap, sorted_env_vars};

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

/// Clones the current env vars into a FxIndexMap.
fn env_snapshot() -> FxIndexMap<RcStr, RcStr> {
    let _lock = GLOBAL_ENV_LOCK.lock().unwrap();
    sorted_env_vars()
}

#[turbo_tasks::value_impl]
impl ProcessEnv for CommandLineProcessEnv {
    #[turbo_tasks::function(session_dependent)]
    fn read_all(&self) -> Vc<TransientEnvMap> {
        Vc::cell(env_snapshot())
    }
}
