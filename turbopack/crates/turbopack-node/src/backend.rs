use std::{future::Future, path::PathBuf, pin::Pin};

use anyhow::Result;
use rustc_hash::FxHashMap;
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::FileSystemPath;

use crate::{AssetsForSourceMapping, evaluate::EvaluatePool};

// Without a backend there is no implementation to consume these options.
#[cfg_attr(
    not(any(feature = "process_pool", feature = "worker_pool")),
    allow(dead_code)
)]
pub(crate) struct CreatePoolOptions {
    pub(crate) cwd: PathBuf,
    pub(crate) entrypoint: PathBuf,
    pub(crate) env: FxHashMap<RcStr, RcStr>,
    pub(crate) assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub(crate) assets_root: FileSystemPath,
    pub(crate) project_dir: FileSystemPath,
    pub(crate) concurrency: usize,
    pub(crate) debug: bool,
}

pub(crate) type CreatePoolFuture =
    Pin<Box<dyn Future<Output = Result<EvaluatePool>> + Send + 'static>>;

pub(crate) mod sealed {
    use crate::backend::{CreatePoolFuture, CreatePoolOptions};

    // Pool construction is internal; NodeBackend only exposes backend selection and lifecycle APIs.
    #[turbo_tasks::value_trait]
    pub(crate) trait Sealed {
        fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture;
    }
}

#[turbo_tasks::value_trait]
pub trait NodeBackend: sealed::Sealed {
    fn runtime_module_path(&self) -> RcStr;

    fn globals_module_path(&self) -> RcStr;

    fn scale_down(&self) -> Result<()>;

    fn scale_zero(&self) -> Result<()>;
}
