use std::{future::Future, path::PathBuf, pin::Pin};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;

use crate::evaluate::EvaluatePool;

pub struct CreatePoolOptions {
    pub cwd: PathBuf,
    pub entrypoint: PathBuf,
    pub env: FxHashMap<RcStr, RcStr>,
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

#[cfg(all(feature = "process_pool", not(target_family = "wasm")))]
#[turbo_tasks::value_impl]
impl sealed::Sealed for crate::process_pool::ChildProcessesBackend {}

#[turbo_tasks::value_trait]
pub trait NodeBackend: sealed::Sealed {
    fn runtime_module_path(&self) -> RcStr;

    fn globals_module_path(&self) -> RcStr;

    fn uses_env(&self) -> bool {
        true
    }

    fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture;

    fn scale_down(&self) -> Result<()>;

    fn scale_zero(&self) -> Result<()>;
}
