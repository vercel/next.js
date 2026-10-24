use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicU32, Ordering},
    },
};

use anyhow::{Context, Result};
use parking_lot::Mutex;
use rustc_hash::FxHashMap;
use tokio::{
    select,
    sync::{Semaphore, oneshot},
    time::sleep,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::duration_span;

use crate::{
    backend::{CreatePoolFuture, CreatePoolOptions, NodeBackend},
    evaluate::{EvaluateOperation, EvaluatePool, Operation},
    pool_stats::{AcquiredPermits, PoolStatsSnapshot},
    worker_pool::{
        operation::{
            PoolState, TaskChannels, WORKER_POOL_OPERATION, WorkerOperation, WorkerOptions,
            create_pool_state, terminate_worker,
        },
        worker_thread::create_worker,
    },
};

mod operation;
mod worker_thread;

static OPERATION_TASK_ID: AtomicU32 = AtomicU32::new(1);

pub(crate) struct WorkerThreadPool {
    worker_options: Arc<WorkerOptions>,
    state: Mutex<Arc<PoolState>>,
    concurrency_semaphore: Arc<Semaphore>,
    bootup_semaphore: Arc<Semaphore>,
}

impl WorkerThreadPool {
    pub(crate) async fn create(
        cwd: PathBuf,
        entrypoint: PathBuf,
        // The worker thread will inherit env from parent process, so it's not needed
        _env: FxHashMap<RcStr, RcStr>,
        concurrency: usize,
        debug: bool,
    ) -> EvaluatePool {
        let cwd: RcStr = cwd.to_string_lossy().into();
        let filename: RcStr = entrypoint.to_string_lossy().into();
        let worker_options = Arc::new(WorkerOptions { cwd, filename });
        let state = Mutex::new(create_pool_state(worker_options.clone()));
        EvaluatePool::new(Box::new(Self {
            worker_options,
            state,
            concurrency_semaphore: Arc::new(Semaphore::new(if debug { 1 } else { concurrency })),
            bootup_semaphore: Arc::new(Semaphore::new(1)),
        }) as Box<dyn EvaluateOperation>)
    }

    async fn acquire_worker(&self, state: &PoolState) -> Result<(u32, AcquiredPermits)> {
        let concurrency_permit = self.concurrency_semaphore.clone().acquire_owned().await?;

        {
            let mut idle = state.idle_workers.lock();
            if let Some(worker_id) = idle.pop() {
                return Ok((
                    worker_id,
                    AcquiredPermits::Idle {
                        _concurrency_permit: concurrency_permit,
                    },
                ));
            }
        }

        let (tx, rx) = oneshot::channel();
        {
            let mut waiters = state.waiters.lock();
            let mut idle = state.idle_workers.lock();
            if let Some(worker_id) = idle.pop() {
                return Ok((
                    worker_id,
                    AcquiredPermits::Idle {
                        _concurrency_permit: concurrency_permit,
                    },
                ));
            }
            waiters.push(tx);
        }

        let bootup = async {
            let permit = self.bootup_semaphore.clone().acquire_owned().await;
            let wait_time = state.stats.lock().wait_time_before_bootup();
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
                    state.stats.lock().add_booting_worker();
                }
                let worker_id = create_worker(self.worker_options.clone()).await?;

                {
                    let mut stats = state.stats.lock();
                    stats.finished_booting_worker();
                }

                self.bootup_semaphore.add_permits(1);
                Ok((worker_id, AcquiredPermits::Fresh { _concurrency_permit: concurrency_permit, _bootup_permit: bootup_permit }))
            }
        }
    }
}

impl Drop for WorkerThreadPool {
    fn drop(&mut self) {
        Self::retire_state(&self.worker_options, self.state.get_mut());
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

    fn uses_env(&self) -> bool {
        false
    }

    fn create_pool(&self, options: CreatePoolOptions) -> CreatePoolFuture {
        Box::pin(async move {
            let CreatePoolOptions {
                cwd,
                entrypoint,
                env,
                concurrency,
                debug,
            } = options;

            Ok(WorkerThreadPool::create(cwd, entrypoint, env, concurrency, debug).await)
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
    fn retire_state(options: &Arc<WorkerOptions>, state: &PoolState) {
        let mut retired = state.retired.lock();
        *retired = true;
        for worker_id in state.idle_workers.lock().drain(..) {
            state.stats.lock().remove_worker();
            let _ = terminate_worker(options.clone(), worker_id);
        }
    }

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
        let operation = {
            let _guard = duration_span!("Node.js operation", blocking = true);
            let worker_options = self.worker_options.clone();

            let task_id = OPERATION_TASK_ID.fetch_add(1, Ordering::Release);

            if task_id == 0 {
                panic!("Node.js operation task id overflow")
            }

            let (worker_id, permits, state) = loop {
                let state = self.state.lock().clone();
                let (worker_id, permits) = self.acquire_worker(&state).await?;
                if !*state.retired.lock() {
                    break (worker_id, permits, state);
                }
                state.stats.lock().remove_worker();
                terminate_worker(worker_options.clone(), worker_id)?;
                drop(permits);
            };

            // Pre-allocate channels for this task to avoid HashMap lookups during communication
            let channels = TaskChannels::new(task_id, worker_id);

            let return_options = worker_options.clone();
            WorkerOperation {
                worker_options,
                worker_id,
                state: state.clone(),
                on_drop: Some(Box::new(move |worker_id| {
                    let retired = state.retired.lock();
                    if *retired {
                        state.stats.lock().remove_worker();
                        let _ = terminate_worker(return_options, worker_id);
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
            }
        };

        Ok(Box::new(operation))
    }

    fn restart(&self) {
        let mut current = self.state.lock();
        Self::retire_state(&self.worker_options, &current);
        *current = create_pool_state(self.worker_options.clone());
    }

    /// Returns a snapshot of the pool's internal statistics.
    fn stats(&self) -> PoolStatsSnapshot {
        self.state.lock().stats.lock().snapshot()
    }

    fn pre_warm(&self) {
        // TODO: This is a no-op for worker_pool right now, only process_pool implements it
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use parking_lot::Mutex;
    use tokio::sync::{Semaphore, oneshot};
    use turbo_rcstr::rcstr;

    use crate::{
        evaluate::EvaluateOperation,
        worker_pool::{
            WorkerThreadPool,
            operation::{WorkerOptions, create_pool_state},
        },
    };

    #[tokio::test]
    async fn restart_retires_idle_workers_and_late_returns_without_losing_waiters() {
        let options = Arc::new(WorkerOptions {
            filename: rcstr!("test-bootstrap.js"),
            cwd: rcstr!("test-cwd"),
        });
        let old = create_pool_state(options.clone());
        old.idle_workers.lock().extend([101, 102]);
        old.stats.lock().workers = 2;
        let pool = WorkerThreadPool {
            worker_options: options,
            state: Mutex::new(old.clone()),
            concurrency_semaphore: Arc::new(Semaphore::new(2)),
            bootup_semaphore: Arc::new(Semaphore::new(1)),
        };
        let held = pool.operation().await.unwrap();
        let (tx, mut rx) = oneshot::channel();
        old.waiters.lock().push(tx);
        pool.restart();
        assert!(*old.retired.lock());
        assert!(old.idle_workers.lock().is_empty());
        assert_eq!(old.stats.lock().workers, 1);
        let current = pool.state.lock().clone();
        assert!(!Arc::ptr_eq(&old, &current));
        drop(held);
        assert!(
            old.idle_workers.lock().is_empty(),
            "retired in-flight worker was recycled"
        );
        assert!(
            rx.try_recv().is_err(),
            "a retired worker was handed to a waiter"
        );
        assert_eq!(old.stats.lock().workers, 0);
        current.idle_workers.lock().push(103);
        current.stats.lock().workers = 1;
        let fresh = pool.operation().await.unwrap();
        assert!(current.idle_workers.lock().is_empty());
        drop(fresh);
        assert_eq!(&*current.idle_workers.lock(), &[103]);
    }
}
