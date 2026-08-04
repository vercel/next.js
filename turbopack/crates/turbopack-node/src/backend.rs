use std::{future::Future, path::PathBuf, pin::Pin};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;

use crate::{AssetsForSourceMapping, evaluate::EvaluatePool};

pub struct CreatePoolOptions {
    pub cwd: PathBuf,
    pub entrypoint: PathBuf,
    pub env: FxHashMap<RcStr, RcStr>,
    pub assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub assets_root: FileSystemPath,
    pub project_dir: FileSystemPath,
    pub concurrency: usize,
    pub debug: bool,
}

pub type CreatePoolFuture = Pin<Box<dyn Future<Output = Result<EvaluatePool>> + Send + 'static>>;

mod sealed {
    #[turbo_tasks::value_trait]
    pub(crate) trait Sealed {}
}

#[cfg(feature = "worker_pool")]
#[turbo_tasks::value_impl]
impl sealed::Sealed for crate::worker_pool::WorkerThreadsBackend {}

#[cfg(feature = "process_pool")]
#[turbo_tasks::value_impl]
impl sealed::Sealed for crate::process_pool::ChildProcessesBackend {}

#[cfg(not(feature = "sync"))]
#[turbo_tasks::value_trait]
pub trait NodeBackend: sealed::Sealed {
    fn runtime_module_path(&self) -> RcStr;

    fn globals_module_path(&self) -> RcStr;

    fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture;

    fn scale_down(&self) -> Result<()>;

    fn scale_zero(&self) -> Result<()>;
}

/// Sync-build version of [`NodeBackend`]: `create_pool` is a plain function
/// returning the pool directly (a blocking backend implementation would block
/// here). There is currently no backend implementation in the sync build — the
/// tokio-based `process_pool`/`worker_pool` backends are async-only and a
/// blocking-std pool port has not landed yet.
#[cfg(feature = "sync")]
#[turbo_tasks::value_trait]
pub trait NodeBackend: sealed::Sealed {
    fn runtime_module_path(&self) -> RcStr;

    fn globals_module_path(&self) -> RcStr;

    fn create_pool(&self, options: CreatePoolOptions) -> Result<EvaluatePool>;

    fn scale_down(&self) -> Result<()>;

    fn scale_zero(&self) -> Result<()>;
}

/// Sync-build stub backend. The tokio-based `process_pool`/`worker_pool` backends
/// are async-only and no blocking-std pool has been ported yet, so `create_pool`
/// bails with an honest error. A pure-Rust build (no loaders, no JS evaluation)
/// never creates a pool, so it builds fine; only a build that actually needs to
/// evaluate Node.js hits this. The module-path accessors return the same embedded
/// identifiers as the async backend (only meaningful once a pool exists).
#[cfg(all(feature = "sync", not(feature = "process_pool")))]
#[turbo_tasks::value(shared)]
pub struct UnsupportedNodeBackend;

#[cfg(all(feature = "sync", not(feature = "process_pool")))]
#[turbo_tasks::value_impl]
impl sealed::Sealed for UnsupportedNodeBackend {}

#[cfg(all(feature = "sync", not(feature = "process_pool")))]
#[turbo_tasks::value_impl]
impl NodeBackend for UnsupportedNodeBackend {
    fn runtime_module_path(&self) -> RcStr {
        turbo_rcstr::rcstr!("child_process/evaluate.ts")
    }

    fn globals_module_path(&self) -> RcStr {
        turbo_rcstr::rcstr!("child_process/globals.ts")
    }

    fn create_pool(&self, _options: CreatePoolOptions) -> Result<EvaluatePool> {
        anyhow::bail!(
            "Node.js evaluation requires the async runtime (the blocking-std subprocess pool port \
             has not landed yet). This build reached a point that needs to execute Node.js (e.g. \
             a webpack/PostCSS loader); it is not yet supported in the no-tokio sync build."
        )
    }

    fn scale_down(&self) -> Result<()> {
        Ok(())
    }

    fn scale_zero(&self) -> Result<()> {
        Ok(())
    }
}
