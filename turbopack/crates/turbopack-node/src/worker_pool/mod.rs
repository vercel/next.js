use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
};

use anyhow::{Context, Result};
use rustc_hash::FxHashMap;
use tokio::{
    select,
    sync::{Semaphore, oneshot},
    time::sleep,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, duration_span};
use turbo_tasks_fs::FileSystemPath;

#[cfg(all(test, feature = "process_pool", not(target_family = "wasm")))]
use crate::pool_stats::PoolStatsSnapshot;
use crate::{
    AssetsForSourceMapping,
    backend::{CreatePoolFuture, CreatePoolOptions, NodeBackend},
    evaluate::{EvaluateOperation, EvaluatePool, Operation},
    idle_timeout::NodePoolOptions,
    pool_stats::AcquiredPermits,
    worker_pool::{
        operation::{
            TaskChannels, WorkerOperation, WorkerOptions, terminate_pool_worker, terminate_worker,
        },
        worker_thread::create_worker,
    },
    worker_pool_state::{PoolState, PoolStateOwner},
};

mod operation;
mod worker_thread;

static OPERATION_TASK_ID: AtomicU32 = AtomicU32::new(1);

#[turbo_tasks::value(
    cell = "new",
    serialization = "skip",
    evict = "last",
    eq = "manual",
    shared
)]
struct WorkerThreadPool {
    worker_options: Arc<WorkerOptions>,
    concurrency: usize,
    assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    assets_root: FileSystemPath,
    project_dir: FileSystemPath,
    #[turbo_tasks(unsafe_ignore, debug_ignore)]
    state: Arc<PoolState>,
    /// Owns `state`, and closes it when the pool is dropped. Each pool has its own state, even if
    /// another pool has the same `worker_options`.
    #[turbo_tasks(unsafe_ignore, debug_ignore)]
    _state_owner: PoolStateOwner<Arc<WorkerOptions>>,
    #[turbo_tasks(unsafe_ignore, debug_ignore)]
    concurrency_semaphore: Arc<Semaphore>,
    #[turbo_tasks(unsafe_ignore, debug_ignore)]
    bootup_semaphore: Arc<Semaphore>,
}

impl WorkerThreadPool {
    fn create(
        cwd: PathBuf,
        entrypoint: PathBuf,
        // The worker thread will inherit env from parent process, so it's not needed
        _env: FxHashMap<RcStr, RcStr>,
        assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
        assets_root: FileSystemPath,
        project_dir: FileSystemPath,
        concurrency: usize,
        debug: bool,
        pool_options: NodePoolOptions,
    ) -> EvaluatePool {
        let cwd: RcStr = cwd.to_string_lossy().into();
        let filename: RcStr = entrypoint.to_string_lossy().into();
        let worker_options = Arc::new(WorkerOptions { cwd, filename });
        let state_owner =
            PoolStateOwner::new(worker_options.clone(), terminate_pool_worker, pool_options);
        let state = state_owner.state().clone();
        EvaluatePool::new(
            Box::new(Self {
                worker_options,
                concurrency: (if debug { 1 } else { concurrency }),
                assets_for_source_mapping,
                assets_root: assets_root.clone(),
                project_dir: project_dir.clone(),
                state,
                _state_owner: state_owner,
                concurrency_semaphore: Arc::new(Semaphore::new(if debug {
                    1
                } else {
                    concurrency
                })),
                bootup_semaphore: Arc::new(Semaphore::new(1)),
            }) as Box<dyn EvaluateOperation>,
            assets_for_source_mapping,
            assets_root,
            project_dir,
        )
    }

    async fn acquire_worker(&self) -> Result<(u32, AcquiredPermits)> {
        let concurrency_permit = self.concurrency_semaphore.clone().acquire_owned().await?;

        if let Some(worker_id) = self.state.pop_idle() {
            return Ok((
                worker_id,
                AcquiredPermits::Idle {
                    _concurrency_permit: concurrency_permit,
                },
            ));
        }

        let (tx, rx) = oneshot::channel();
        if let Some(worker_id) = self.state.pop_idle_or_wait(tx) {
            return Ok((
                worker_id,
                AcquiredPermits::Idle {
                    _concurrency_permit: concurrency_permit,
                },
            ));
        }

        let bootup = async {
            let permit = self.bootup_semaphore.clone().acquire_owned().await;
            let wait_time = self.state.stats.lock().wait_time_before_bootup();
            sleep(wait_time).await;
            permit
        };

        select! {
            worker_id = rx => {
                let worker_id = worker_id?;
                Ok((worker_id, AcquiredPermits::Idle { _concurrency_permit: concurrency_permit }))
            }
            bootup_permit = bootup => {
                let bootup_permit = bootup_permit.context("acquiring bootup permit")?;
                {
                    self.state.stats.lock().add_booting_worker();
                }
                let worker_id = create_worker(self.worker_options.clone()).await?;

                {
                    let mut stats = self.state.stats.lock();
                    stats.finished_booting_worker();
                }

                self.bootup_semaphore.add_permits(1);
                Ok((worker_id, AcquiredPermits::Fresh { _concurrency_permit: concurrency_permit, _bootup_permit: bootup_permit }))
            }
        }
    }
}

/// Runs Node.js code in pools of worker threads.
#[turbo_tasks::value(shared)]
pub(crate) struct WorkerThreadsBackend {
    pub(crate) pool_options: NodePoolOptions,
}

#[turbo_tasks::value_impl]
impl NodeBackend for WorkerThreadsBackend {
    fn runtime_module_path(&self) -> RcStr {
        rcstr!("worker_thread/evaluate.ts")
    }

    fn globals_module_path(&self) -> RcStr {
        rcstr!("worker_thread/globals.ts")
    }

    fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture {
        let pool_options = self.pool_options;
        Box::pin(async move {
            let CreatePoolOptions {
                cwd,
                entrypoint,
                env,
                assets_for_source_mapping,
                assets_root,
                project_dir,
                concurrency,
                debug,
            } = options;

            Ok(WorkerThreadPool::create(
                cwd,
                entrypoint,
                env,
                assets_for_source_mapping,
                assets_root,
                project_dir,
                concurrency,
                debug,
                pool_options,
            ))
        })
    }
}

#[async_trait::async_trait]
impl EvaluateOperation for WorkerThreadPool {
    async fn operation(&self) -> Result<Box<dyn Operation>> {
        let operation = {
            let _guard = duration_span!("Node.js operation", blocking = true);
            let worker_options = self.worker_options.clone();

            let task_id = OPERATION_TASK_ID.fetch_add(1, Ordering::Release);

            if task_id == 0 {
                panic!("Node.js operation task id overflow")
            }

            let (worker_id, permits) = self.acquire_worker().await?;

            let state = self.state.clone();
            let worker_options_for_drop = worker_options.clone();

            // Pre-allocate channels for this task to avoid HashMap lookups during communication
            let channels = TaskChannels::new(task_id, worker_id);

            WorkerOperation {
                worker_options,
                worker_id,
                state: state.clone(),
                on_drop: Some(Box::new(move |worker_id| {
                    // If the pool was dropped in the meantime, the worker is terminated instead of
                    // being kept idle.
                    if let Some(worker_id) = state.return_worker(worker_id) {
                        let _ = terminate_worker(worker_options_for_drop, worker_id);
                    }
                })),
                _permits: permits,
                channels,
            }
        };

        Ok(Box::new(operation))
    }

    /// Returns a snapshot of the pool's internal statistics.
    #[cfg(all(test, feature = "process_pool", not(target_family = "wasm")))]
    fn stats(&self) -> PoolStatsSnapshot {
        self.state.stats.lock().snapshot()
    }

    fn pre_warm(&self) {
        // TODO: This is a no-op for worker_pool right now, only process_pool implements it
    }
}
