//! Environment Variable support for turbopack.
//!
//! Environment variables can come from multiple sources, including the rust
//! process's env (immutable and by passing `FOO=BAR` keys when executing the
//! turbopack binary) or loaded via dotenv files.
//!
//! Dotenv file loading is a chain. Dotenv files that come first in the chain
//! have higher priority to define a environment variable (later dotenv files
//! cannot override it). Later dotenv files can reference variables prior
//! defined variables.

#![feature(async_closure)]
#![feature(min_specialization)]

mod asset;
mod issue;

use std::env;

use anyhow::Result;
pub use asset::{ProcessEnvAsset, ProcessEnvAssetVc};
use indexmap::IndexMap;
pub use issue::{ProcessEnvIssue, ProcessEnvIssueVc};
use turbo_tasks::primitives::StringVc;
use turbo_tasks_fs::{FileContent, FileSystemPathVc};

type EnvMap = IndexMap<String, String>;

#[turbo_tasks::value(transparent, serialization = "none")]
pub struct EnvRead(#[turbo_tasks(trace_ignore)] EnvMap);

#[turbo_tasks::value_impl]
impl EnvReadVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        EnvRead(IndexMap::new()).cell()
    }
}

#[turbo_tasks::value]
pub enum ProcessEnv {
    /// The environment variables defined via the command line. This is
    /// immutable once the rust binary process has loaded.
    CommandLine(),

    Filter {
        prior: ProcessEnvVc,
        filter: String,
    },

    /// The environment variables defined in a dotenv file. Environment
    /// variables that are defined prior may be passed, and in the case of
    /// confilct, the prior variable will have priority. This dotenv file
    /// can reference any variable defined prior.
    DotenvFile {
        path: FileSystemPathVc,
        prior: Option<ProcessEnvVc>,
    },
}

/// Clones the current env vars into a IndexMap.
fn env_snapshot() -> IndexMap<String, String> {
    env::vars().collect::<IndexMap<_, _>>()
}

#[turbo_tasks::value_impl]
impl ProcessEnvVc {
    /// Load the environment variables defined via command line.
    #[turbo_tasks::function]
    pub fn from_command_line() -> Self {
        ProcessEnv::CommandLine().cell()
    }

    /// Load the environment variables defined via a dotenv file, with an
    /// optional prior state that we can lookup already defined variables
    /// from.
    #[turbo_tasks::function]
    pub fn from_dotenv_file(path: FileSystemPathVc, prior: Option<ProcessEnvVc>) -> Self {
        ProcessEnv::DotenvFile { path, prior }.cell()
    }

    #[turbo_tasks::function]
    pub fn filter(prior: ProcessEnvVc, filter: String) -> Self {
        ProcessEnv::Filter { prior, filter }.cell()
    }

    /// Computes the full ProcessEnv chain into a usable IndexMap.
    #[turbo_tasks::function]
    pub async fn read(self) -> Result<EnvReadVc> {
        let this = self.await?;
        let snapshot = match &*this {
            ProcessEnv::CommandLine() => env_snapshot(),
            ProcessEnv::Filter { prior, filter } => filter_env(prior, filter).await?,
            ProcessEnv::DotenvFile { path, prior } => load_dotenv(path, prior).await?,
        };
        Ok(EnvRead(snapshot).cell())
    }
}

async fn filter_env(prior: &ProcessEnvVc, filter: &String) -> Result<EnvMap> {
    let prior = prior.read().await?;
    let mut filtered = IndexMap::new();
    for (key, value) in &*prior {
        if key.starts_with(filter) {
            filtered.insert(key.clone(), value.clone());
        }
    }
    Ok(filtered)
}

async fn load_dotenv(path: &FileSystemPathVc, prior: &Option<ProcessEnvVc>) -> Result<EnvMap> {
    let prior = match prior {
        None => EnvReadVc::empty(),
        Some(prior) => prior.read(),
    }
    .await?;

    let file = path.read().await?;
    if let FileContent::Content(f) = &*file {
        // Unfortunately, dotenvy only looks up variable references from the global env.
        // So we must mutate while we process. Afterwards, we can restore the initial
        // state.
        let initial = env_snapshot();
        let p = &*prior;
        restore_env(&initial, p);

        // from_read will load parse and evalute the Read, and set variables
        // into the global env. If a later dotenv defines an already defined
        // var, it'll be ignored.
        let res = dotenvy::from_read(f.content());

        let vars = env_snapshot();
        restore_env(&vars, &initial);

        if let Err(err) = res {
            ProcessEnvIssue {
                path: *path,
                description: StringVc::cell(err.to_string()),
            }
            .cell()
            .as_issue()
            .emit();
        }

        Ok(vars)
    } else {
        Ok(prior.clone())
    }
}

/// Restores the global env variables to mirror `to`.
fn restore_env(from: &EnvMap, to: &EnvMap) {
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

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
