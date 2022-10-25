#![feature(min_specialization)]

mod command_line;
mod dotenv;
mod filter;

use std::{env, sync::Mutex};

use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::primitives::OptionStringVc;

pub use self::{
    command_line::CommandLineProcessEnvVc, dotenv::DotenvProcessEnvVc, filter::FilterProcessEnvVc,
};

#[turbo_tasks::value(transparent)]
pub struct EnvMap(#[turbo_tasks(trace_ignore)] IndexMap<String, String>);

#[turbo_tasks::value_impl]
impl EnvMapVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        EnvMap(IndexMap::new()).cell()
    }
}

#[turbo_tasks::value_trait]
pub trait ProcessEnv {
    // TODO SECURITY: From security perspective it's not good that we read *all* env
    // vars into the cache. This might store secrects into the persistent cache
    // which we want to avoid.
    // Instead we should use only `read_prefix` to read all env vars with a specific
    // prefix.
    /// Reads all env variables into a Map
    fn read_all(&self) -> EnvMapVc;

    /// Reads a single env variable. Ignores casing.
    async fn read(&self, name: &str) -> Result<OptionStringVc> {
        Ok(OptionStringVc::cell(
            to_uppercase_map(self.read_all())
                .await?
                .get(&name.to_uppercase())
                .cloned(),
        ))
    }
}

#[turbo_tasks::function]
async fn to_uppercase_map(map: EnvMapVc) -> Result<EnvMapVc> {
    let map = &*map.await?;
    let mut new = IndexMap::with_capacity(map.len());
    for (k, v) in map {
        new.insert(k.to_uppercase(), v.clone());
    }
    Ok(EnvMapVc::cell(new))
}

pub static GLOBAL_ENV_LOCK: Mutex<()> = Mutex::new(());

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
