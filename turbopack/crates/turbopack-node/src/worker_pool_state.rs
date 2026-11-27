//! Bookkeeping of the idle workers of a worker-thread pool.
//!
//! This has no N-API dependency, so that it can be unit tested without a Node.js environment.
//! Terminating a worker is left to the caller: the functions here only return the ids of the
//! workers that need to be terminated.

use std::sync::Arc;

use parking_lot::Mutex;
use tokio::{
    sync::{Notify, oneshot},
    time::Instant,
};

use crate::{
    idle_timeout::{IdleQueue, NodePoolOptions, spawn_idle_reaper, split_expired},
    pool_stats::NodeJsPoolStats,
};

/// The state of one worker-thread pool.
#[derive(Default)]
pub(crate) struct PoolState {
    /// The ids of the idle workers, with the time they became idle, from the least to the most
    /// recently used. `None` once the pool is closed.
    idle_workers: Mutex<Option<Vec<(u32, Instant)>>>,
    pub(crate) stats: Arc<Mutex<NodeJsPoolStats>>,
    /// Operations waiting for a worker to become idle.
    ///
    /// Lock order: `waiters` before `idle_workers`.
    waiters: Mutex<Vec<oneshot::Sender<u32>>>,
    /// See [`IdleQueue::idle_changed`].
    idle_changed: Arc<Notify>,
}

impl PoolState {
    pub(crate) fn new() -> Self {
        Self {
            idle_workers: Mutex::new(Some(Vec::new())),
            ..Default::default()
        }
    }

    /// Takes the most recently used idle worker, if there is one.
    pub(crate) fn pop_idle(&self) -> Option<u32> {
        let (worker_id, _) = self.idle_workers.lock().as_mut()?.pop()?;
        Some(worker_id)
    }

    /// Takes an idle worker if there is one, or registers `waiter` to receive the next worker
    /// that becomes idle otherwise.
    pub(crate) fn pop_idle_or_wait(&self, waiter: oneshot::Sender<u32>) -> Option<u32> {
        let mut waiters = self.waiters.lock();
        if let Some(worker_id) = self.pop_idle() {
            return Some(worker_id);
        }
        waiters.push(waiter);
        None
    }

    /// Hands a worker that finished an operation to a waiting operation, or makes it idle.
    ///
    /// Returns the worker id back if the pool is closed: the caller must terminate the worker.
    #[must_use]
    pub(crate) fn return_worker(&self, worker_id: u32) -> Option<u32> {
        let mut waiters = self.waiters.lock();
        while let Some(waiter) = waiters.pop() {
            // Fails if the waiting operation was canceled; try the next one then.
            if waiter.send(worker_id).is_ok() {
                return None;
            }
        }
        let mut idle_workers = self.idle_workers.lock();
        if let Some(idle_workers) = idle_workers.as_mut() {
            idle_workers.push((worker_id, Instant::now()));
            drop(waiters);
            self.idle_changed.notify_waiters();
            return None;
        }
        drop(idle_workers);
        drop(waiters);
        self.stats.lock().remove_worker();
        Some(worker_id)
    }

    /// Closes the pool and returns its idle workers: the caller must terminate them. Workers
    /// returned with [`Self::return_worker`] from now on are handed back for termination too.
    #[must_use]
    fn close(&self) -> Vec<u32> {
        let workers = self.idle_workers.lock().take().unwrap_or_default();
        self.idle_changed.notify_waiters();
        let mut stats = self.stats.lock();
        for _ in &workers {
            stats.remove_worker();
        }
        workers
            .into_iter()
            .map(|(worker_id, _)| worker_id)
            .collect()
    }

    #[cfg(test)]
    fn idle_workers(&self) -> Vec<u32> {
        self.idle_workers
            .lock()
            .iter()
            .flatten()
            .map(|(worker_id, _)| *worker_id)
            .collect()
    }
}

impl IdleQueue for PoolState {
    type Item = u32;

    /// Keeps the most recently used workers, which [`PoolState::pop_idle`] hands out first.
    fn expire_idle(
        &self,
        options: &NodePoolOptions,
        now: Instant,
    ) -> Option<(Vec<u32>, Option<Instant>)> {
        let (expired, next_expiry) = {
            let mut idle_workers = self.idle_workers.lock();
            let idle_workers = idle_workers.as_mut()?;
            let (expired, kept, next_expiry) =
                split_expired(std::mem::take(idle_workers), options, now);
            *idle_workers = kept;
            (expired, next_expiry)
        };
        let mut stats = self.stats.lock();
        for _ in &expired {
            stats.remove_worker();
        }
        Some((
            expired
                .into_iter()
                .map(|(worker_id, _)| worker_id)
                .collect(),
            next_expiry,
        ))
    }

    fn idle_changed(&self) -> &Arc<Notify> {
        &self.idle_changed
    }
}

/// Terminates the worker with the given id, which belongs to a pool with the given key.
pub(crate) type TerminateWorker<K> = fn(&K, u32);

/// Owns a pool's state, and closes it when the pool is dropped.
///
/// The pool is owned by its `EvaluatePool` cell. When the cell is dropped (e.g. replaced after an
/// invalidation, evicted, or dropped when turbo-tasks shuts down), this closes the state: its idle
/// workers are terminated, and so are workers that in-flight operations return later.
pub(crate) struct PoolStateOwner<K: Send + Sync + 'static> {
    key: K,
    state: Arc<PoolState>,
    terminate: TerminateWorker<K>,
}

impl<K: Clone + Send + Sync + 'static> PoolStateOwner<K> {
    /// Creates a new pool state, and starts the task that terminates its expired idle workers.
    /// Must be called within a Tokio runtime.
    pub(crate) fn new(key: K, terminate: TerminateWorker<K>, options: NodePoolOptions) -> Self {
        let state = Arc::new(PoolState::new());
        spawn_idle_reaper(&state, options, {
            let key = key.clone();
            move |expired: Vec<u32>| {
                for worker_id in expired {
                    terminate(&key, worker_id);
                }
            }
        });
        Self {
            key,
            state,
            terminate,
        }
    }

    pub(crate) fn state(&self) -> &Arc<PoolState> {
        &self.state
    }
}

impl<K: Send + Sync + 'static> Drop for PoolStateOwner<K> {
    fn drop(&mut self) {
        for worker_id in self.state.close() {
            (self.terminate)(&self.key, worker_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use parking_lot::Mutex;

    use super::*;

    /// Each test uses its own key, so that tests running in parallel don't observe each other's
    /// terminations.
    static TERMINATED: Mutex<Vec<(u32, u32)>> = Mutex::new(Vec::new());

    fn record_termination(key: &u32, worker_id: u32) {
        TERMINATED.lock().push((*key, worker_id));
    }

    fn terminated(key: u32) -> Vec<u32> {
        let mut workers: Vec<u32> = TERMINATED
            .lock()
            .iter()
            .filter(|(k, _)| *k == key)
            .map(|(_, worker_id)| *worker_id)
            .collect();
        workers.sort_unstable();
        workers
    }

    /// Never expires anything within a test.
    const NO_TIMEOUT: NodePoolOptions = NodePoolOptions {
        idle_timeout: Duration::from_secs(3600),
        min_idle: 0,
    };

    async fn wait_for_terminated(key: u32, expected: Vec<u32>) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while terminated(key) != expected {
            assert!(
                Instant::now() < deadline,
                "terminated {:?}, expected {expected:?}",
                terminated(key)
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    #[tokio::test]
    async fn drop_terminates_idle_workers() {
        let owner = PoolStateOwner::new(1, record_termination, NO_TIMEOUT);
        let state = owner.state().clone();

        assert_eq!(state.return_worker(10), None);
        assert_eq!(state.return_worker(11), None);
        assert_eq!(terminated(1), Vec::<u32>::new());

        drop(owner);
        assert_eq!(terminated(1), vec![10, 11]);
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
    }

    #[tokio::test]
    async fn return_after_drop_terminates_worker() {
        let owner = PoolStateOwner::new(2, record_termination, NO_TIMEOUT);
        let state = owner.state().clone();

        drop(owner);
        // An operation that was still running when the pool was dropped returns its worker.
        assert_eq!(state.return_worker(20), Some(20));
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
        assert_eq!(state.pop_idle(), None);
    }

    #[tokio::test]
    async fn return_hands_worker_to_waiter() {
        let owner = PoolStateOwner::new(3, record_termination, NO_TIMEOUT);
        let state = owner.state();

        let (canceled_tx, canceled_rx) = oneshot::channel();
        let (tx, mut rx) = oneshot::channel();
        assert_eq!(state.pop_idle_or_wait(tx), None);
        assert_eq!(state.pop_idle_or_wait(canceled_tx), None);
        drop(canceled_rx);

        assert_eq!(state.return_worker(30), None);
        assert_eq!(rx.try_recv(), Ok(30));
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
    }

    #[tokio::test]
    async fn drop_does_not_affect_other_pool() {
        let owner_a = PoolStateOwner::new(4, record_termination, NO_TIMEOUT);
        let owner_b = PoolStateOwner::new(5, record_termination, NO_TIMEOUT);
        assert_eq!(owner_a.state().return_worker(40), None);
        assert_eq!(owner_b.state().return_worker(50), None);

        drop(owner_a);
        assert_eq!(terminated(4), vec![40]);
        assert_eq!(terminated(5), Vec::<u32>::new());
        assert_eq!(owner_b.state().pop_idle(), Some(50));
    }

    #[test]
    fn expire_keeps_min_idle_most_recently_used() {
        let state = PoolState::new();
        let options = NodePoolOptions {
            idle_timeout: Duration::from_secs(1),
            min_idle: 1,
        };
        for worker_id in [1, 2, 3] {
            assert_eq!(state.return_worker(worker_id), None);
        }
        let now = Instant::now();

        let (expired, next_expiry) = state.expire_idle(&options, now).unwrap();
        assert_eq!(expired, Vec::<u32>::new());
        assert!(next_expiry.is_some());

        let (expired, next_expiry) = state
            .expire_idle(&options, now + Duration::from_secs(2))
            .unwrap();
        assert_eq!(expired, vec![1, 2]);
        assert_eq!(next_expiry, None);
        assert_eq!(state.idle_workers(), vec![3]);
    }

    #[test]
    fn expire_after_close() {
        let state = PoolState::new();
        assert_eq!(state.return_worker(1), None);
        assert_eq!(state.close(), vec![1]);
        assert!(state.expire_idle(&NO_TIMEOUT, Instant::now()).is_none());
    }

    #[test]
    fn expire_with_min_idle_zero_removes_every_expired_worker() {
        let state = PoolState::new();
        let options = NodePoolOptions {
            idle_timeout: Duration::from_secs(1),
            min_idle: 0,
        };
        assert_eq!(state.return_worker(1), None);
        assert_eq!(state.return_worker(2), None);

        let (expired, next_expiry) = state
            .expire_idle(&options, Instant::now() + Duration::from_secs(2))
            .unwrap();
        assert_eq!(expired, vec![1, 2]);
        assert_eq!(next_expiry, None);
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
    }

    #[test]
    fn reuse_restarts_worker_idle_time() {
        let state = PoolState::new();
        let options = NodePoolOptions {
            idle_timeout: Duration::from_millis(100),
            min_idle: 0,
        };
        assert_eq!(state.return_worker(1), None);
        let first_idle = Instant::now();
        std::thread::sleep(Duration::from_millis(60));
        assert_eq!(state.pop_idle(), Some(1));
        assert_eq!(state.return_worker(1), None);

        let (expired, next_expiry) = state
            .expire_idle(&options, first_idle + Duration::from_millis(110))
            .unwrap();
        assert_eq!(expired, Vec::<u32>::new());
        assert!(next_expiry.unwrap() > first_idle + options.idle_timeout);
        assert_eq!(state.idle_workers(), vec![1]);
    }

    #[tokio::test]
    async fn idle_workers_expire() {
        let options = NodePoolOptions {
            idle_timeout: Duration::from_millis(100),
            min_idle: 1,
        };
        let owner = PoolStateOwner::new(6, record_termination, options);
        let state = owner.state();
        assert_eq!(state.return_worker(60), None);
        assert_eq!(state.return_worker(61), None);

        // The least recently used worker expires, and `min_idle` keeps the other one.
        wait_for_terminated(6, vec![60]).await;
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert_eq!(terminated(6), vec![60]);
        assert_eq!(state.idle_workers(), vec![61]);

        // A worker that is taken out of the pool doesn't expire while it is in use.
        assert_eq!(state.pop_idle(), Some(61));
        tokio::time::sleep(Duration::from_millis(300)).await;
        assert_eq!(terminated(6), vec![60]);
    }

    #[tokio::test]
    async fn reaper_does_not_keep_pool_alive() {
        let options = NodePoolOptions {
            idle_timeout: Duration::from_millis(50),
            min_idle: 0,
        };
        let owner = PoolStateOwner::new(7, record_termination, options);
        let weak = Arc::downgrade(owner.state());
        assert_eq!(owner.state().return_worker(70), None);
        drop(owner);
        assert_eq!(terminated(7), vec![70]);
        assert_eq!(weak.strong_count(), 0);
        // The reaper ends without terminating anything else.
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert_eq!(terminated(7), vec![70]);
    }
}
