use std::env;

use indexmap::IndexMap;
use turbo_tasks::Vc;

use crate::{EnvMap, ProcessEnv, GLOBAL_ENV_LOCK};

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
fn env_snapshot() -> IndexMap<String, String> {
    let _lock = GLOBAL_ENV_LOCK.lock().unwrap();
    env::vars().collect::<IndexMap<_, _>>()
}

#[turbo_tasks::value_impl]
impl ProcessEnv for CommandLineProcessEnv {
    #[turbo_tasks::function]
    fn read_all(&self) -> Vc<EnvMap> {
        Vc::cell(env_snapshot())
    }
}
