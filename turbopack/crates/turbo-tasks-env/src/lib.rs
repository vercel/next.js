#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

mod command_line;
mod custom;
mod dotenv;
mod filter;

use std::{env, sync::Mutex};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, Vc};

pub use self::{
    command_line::CommandLineProcessEnv, custom::CustomProcessEnv, dotenv::DotenvProcessEnv,
    filter::FilterProcessEnv,
};

#[turbo_tasks::value(transparent)]
pub struct EnvMap(#[turbo_tasks(trace_ignore)] FxIndexMap<RcStr, RcStr>);

#[turbo_tasks::value_impl]
impl EnvMap {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        EnvMap(FxIndexMap::default()).cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for EnvMap {
    #[turbo_tasks::function]
    fn read_all(self: Vc<Self>) -> Vc<EnvMap> {
        self
    }

    #[turbo_tasks::function]
    fn read(self: Vc<Self>, name: RcStr) -> Vc<Option<RcStr>> {
        case_insensitive_read(self, name)
    }
}

#[turbo_tasks::value_trait]
pub trait ProcessEnv {
    // TODO SECURITY: From security perspective it's not good that we read *all* env
    // vars into the cache. This might store secrects into the filesystem cache
    // which we want to avoid.
    // Instead we should use only `read_prefix` to read all env vars with a specific
    // prefix.
    /// Reads all env variables into a Map
    #[turbo_tasks::function]
    fn read_all(self: Vc<Self>) -> Vc<EnvMap>;

    /// Reads a single env variable. Ignores casing.
    #[turbo_tasks::function]
    fn read(self: Vc<Self>, name: RcStr) -> Vc<Option<RcStr>> {
        case_insensitive_read(self.read_all(), name)
    }
}

pub fn sorted_env_vars() -> FxIndexMap<RcStr, RcStr> {
    let mut vars = env::vars()
        .map(|(k, v)| (k.into(), v.into()))
        .collect::<FxIndexMap<_, _>>();
    vars.sort_keys();
    vars
}

#[turbo_tasks::function]
pub async fn case_insensitive_read(map: Vc<EnvMap>, name: RcStr) -> Result<Vc<Option<RcStr>>> {
    Ok(Vc::cell(
        to_uppercase_map(map)
            .await?
            .get(&RcStr::from(name.to_uppercase()))
            .cloned(),
    ))
}

#[turbo_tasks::function]
async fn to_uppercase_map(map: Vc<EnvMap>) -> Result<Vc<EnvMap>> {
    let map = &*map.await?;
    let mut new = FxIndexMap::with_capacity_and_hasher(map.len(), Default::default());
    for (k, v) in map {
        new.insert(k.to_uppercase().into(), v.clone());
    }
    Ok(Vc::cell(new))
}

pub static GLOBAL_ENV_LOCK: Mutex<()> = Mutex::new(());
