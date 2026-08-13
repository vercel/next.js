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

use crate::{
    AssetsForSourceMapping,
    backend::{CreatePoolFuture, CreatePoolOptions, NodeBackend},
    evaluate::{EvaluateOperation, EvaluatePool, Operation},
    pool_stats::{AcquiredPermits, PoolStatsSnapshot},
    worker_pool::{
        operation::{
            PoolState, TaskChannels, WORKER_POOL_OPERATION, WorkerOperation, WorkerOptions,
            get_pool_state,
        },
        worker_thread::create_worker,
    },
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
pub(crate) struct WorkerThreadPool {
    worker_options: Arc<WorkerOptions>,
    concurrency: usize,
    pub(crate) assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
    pub(crate) assets_root: FileSystemPath,
    pub(crate) project_dir: FileSystemPath,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    state: Arc<PoolState>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    concurrency_semaphore: Arc<Semaphore>,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    bootup_semaphore: Arc<Semaphore>,
}

impl WorkerThreadPool {
    pub(crate) async fn create(
        cwd: PathBuf,
        entrypoint: PathBuf,
        // The worker thread will inherit env from parent process, so it's not needed
        _env: FxHashMap<RcStr, RcStr>,
        assets_for_source_mapping: ResolvedVc<AssetsForSourceMapping>,
        assets_root: FileSystemPath,
        project_dir: FileSystemPath,
        concurrency: usize,
        debug: bool,
    ) -> EvaluatePool {
        let cwd: RcStr = cwd.to_string_lossy().into();
        let filename: RcStr = entrypoint.to_string_lossy().into();
        let worker_options = Arc::new(WorkerOptions { cwd, filename });
        let state = get_pool_state(worker_options.clone()).await;
        EvaluatePool::new(
            Box::new(Self {
                worker_options,
                concurrency: (if debug { 1 } else { concurrency }),
                assets_for_source_mapping,
                assets_root: assets_root.clone(),
                project_dir: project_dir.clone(),
                state,
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
        // Held in an Option so a retry after a dead candidate can reuse it.
        let mut concurrency_permit =
            Some(self.concurrency_semaphore.clone().acquire_owned().await?);

        // A worker can die at any point between being routed to this
        // acquisition and being registered for a task, so every candidate is
        // validated against the dead-worker set and the acquisition retried.
        // The death path owns all statistics for dead workers; skipped
        // candidates need no accounting here. The retry is bounded so
        // pathologically repeated deaths surface an error instead of
        // spinning replacements forever.
        let mut dead_candidates = 0;
        loop {
            {
                let mut idle = self.state.idle_workers.lock();
                while let Some(worker_id) = idle.pop() {
                    if !WORKER_POOL_OPERATION.is_dead(worker_id) {
                        return Ok((
                            worker_id,
                            AcquiredPermits::Idle {
                                _concurrency_permit: concurrency_permit
                                    .take()
                                    .expect("concurrency permit used once"),
                            },
                        ));
                    }
                }
            }

            let (tx, rx) = oneshot::channel();
            {
                let mut waiters = self.state.waiters.lock();
                let mut idle = self.state.idle_workers.lock();
                while let Some(worker_id) = idle.pop() {
                    if !WORKER_POOL_OPERATION.is_dead(worker_id) {
                        return Ok((
                            worker_id,
                            AcquiredPermits::Idle {
                                _concurrency_permit: concurrency_permit
                                    .take()
                                    .expect("concurrency permit used once"),
                            },
                        ));
                    }
                }
                waiters.push(tx);
            }

            let bootup = async {
                let permit = self.bootup_semaphore.clone().acquire_owned().await;
                let wait_time = self.state.stats.lock().wait_time_before_bootup();
                sleep(wait_time).await;
                permit
            };

            let maybe_acquired = select! {
                worker_id = rx => {
                    let worker_id = worker_id?;
                    if WORKER_POOL_OPERATION.is_dead(worker_id) {
                        None
                    } else {
                        Some((worker_id, AcquiredPermits::Idle { _concurrency_permit: concurrency_permit.take().expect("concurrency permit used once") }))
                    }
                }
                bootup_permit = bootup => {
                    let bootup_permit = bootup_permit.context("acquiring bootup permit")?;
                    {
                        self.state.stats.lock().add_booting_worker();
                    }
                    let worker_id = create_worker(self.worker_options.clone()).await?;

                    self.bootup_semaphore.add_permits(1);
                    if WORKER_POOL_OPERATION.is_dead(worker_id) {
                        None
                    } else {
                        Some((worker_id, AcquiredPermits::Fresh { _concurrency_permit: concurrency_permit.take().expect("concurrency permit used once"), _bootup_permit: bootup_permit }))
                    }
                }
            };

            if let Some(acquired) = maybe_acquired {
                return Ok(acquired);
            }

            dead_candidates += 1;
            if dead_candidates >= 3 {
                anyhow::bail!("acquired workers died repeatedly before they could be used");
            }
        }
    }
}

#[turbo_tasks::value(shared)]
pub(crate) struct WorkerThreadsBackend;

#[turbo_tasks::value_impl]
impl NodeBackend for WorkerThreadsBackend {
    fn runtime_module_path(&self) -> RcStr {
        rcstr!("worker_thread/evaluate.ts")
    }

    fn globals_module_path(&self) -> RcStr {
        rcstr!("worker_thread/globals.ts")
    }

    fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture {
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
            )
            .await)
        })
    }

    fn scale_down(&self) -> Result<()> {
        WorkerThreadPool::scale_down();
        Ok(())
    }

    fn scale_zero(&self) -> Result<()> {
        WorkerThreadPool::scale_zero();
        Ok(())
    }
}

impl WorkerThreadPool {
    pub fn scale_down() {
        let _ = WORKER_POOL_OPERATION.scale_down();
    }

    pub fn scale_zero() {
        let _ = WORKER_POOL_OPERATION.scale_zero();
    }
}

#[async_trait::async_trait]
impl EvaluateOperation for WorkerThreadPool {
    async fn operation(&self) -> Result<Box<dyn Operation>> {
        // A worker can die between acquisition and task registration; the
        // death path then owns the statistics and cannot close the (not yet
        // existing) task channel, so registration is re-checked and the
        // acquisition retried with a replacement worker. The retry is
        // bounded so pathologically repeated deaths surface an error instead
        // of spinning replacements forever.
        let operation = {
            let _guard = duration_span!("Node.js operation");

            let mut attempts = 0;
            loop {
                attempts += 1;
                let worker_options = self.worker_options.clone();

                let task_id = OPERATION_TASK_ID.fetch_add(1, Ordering::Release);

                if task_id == 0 {
                    panic!("Node.js operation task id overflow")
                }

                let (worker_id, permits) = self.acquire_worker().await?;

                let state = self.state.clone();

                // Pre-allocate channels for this task to avoid HashMap lookups during communication
                let channels = TaskChannels::new(task_id, worker_id);

                if WORKER_POOL_OPERATION.is_dead(worker_id) {
                    // Close the fresh task channel so nothing can hang on it,
                    // drop it to undo the registration, and acquire a
                    // replacement. Statistics are owned by the death path.
                    channels.close_task_channel();
                    drop(channels);
                    if attempts >= 3 {
                        anyhow::bail!("acquired workers died repeatedly before task registration");
                    }
                    continue;
                }

                break WorkerOperation {
                    worker_options,
                    worker_id,
                    state: state.clone(),
                    on_drop: Some(Box::new(move |worker_id| {
                        // A worker that died while it was checked out (e.g. right
                        // after sending its final message) must not be returned
                        // to the pool: the next task sent to it would hang. The
                        // death path already balanced the pool statistics for it.
                        if WORKER_POOL_OPERATION.is_dead(worker_id) {
                            return;
                        }

                        let mut waiters = state.waiters.lock();
                        loop {
                            if let Some(tx) = waiters.pop() {
                                if tx.send(worker_id).is_ok() {
                                    break;
                                }
                            } else {
                                state.idle_workers.lock().push(worker_id);
                                break;
                            }
                        }
                    })),
                    _permits: permits,
                    channels,
                };
            }
        };

        Ok(Box::new(operation))
    }

    /// Returns a snapshot of the pool's internal statistics.
    fn stats(&self) -> PoolStatsSnapshot {
        self.state.stats.lock().snapshot()
    }

    fn pre_warm(&self) {
        // TODO: This is a no-op for worker_pool right now, only process_pool implements it
    }
}
