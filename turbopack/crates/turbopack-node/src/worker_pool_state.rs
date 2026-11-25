//! Bookkeeping of the idle workers of worker-thread pools, and the registry of live pools.
//!
//! This has no N-API dependency, so that it can be unit tested without a Node.js environment.
//! Terminating a worker is left to the caller: the functions here only return the ids of the
//! workers that need to be terminated.

use std::sync::Arc;

use parking_lot::Mutex;
use tokio::sync::oneshot;

use crate::pool_stats::NodeJsPoolStats;

/// The state of one worker-thread pool.
#[derive(Default)]
pub(crate) struct PoolState {
    /// The ids of the idle workers. `None` once the pool is closed.
    idle_workers: Mutex<Option<Vec<u32>>>,
    pub(crate) stats: Arc<Mutex<NodeJsPoolStats>>,
    /// Operations waiting for a worker to become idle.
    ///
    /// Lock order: `waiters` before `idle_workers`.
    waiters: Mutex<Vec<oneshot::Sender<u32>>>,
}

impl PoolState {
    pub(crate) fn new() -> Self {
        Self {
            idle_workers: Mutex::new(Some(Vec::new())),
            ..Default::default()
        }
    }

    /// Takes an idle worker, if there is one.
    pub(crate) fn pop_idle(&self) -> Option<u32> {
        self.idle_workers.lock().as_mut()?.pop()
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
            idle_workers.push(worker_id);
            return None;
        }
        drop(idle_workers);
        drop(waiters);
        self.stats.lock().remove_worker();
        Some(worker_id)
    }

    /// Removes idle workers so that at most `max_idle` remain, and returns the removed ones: the
    /// caller must terminate them.
    #[must_use]
    pub(crate) fn reduce_to(&self, max_idle: usize) -> Vec<u32> {
        let workers = {
            let mut idle_workers = self.idle_workers.lock();
            match idle_workers.as_mut() {
                Some(idle_workers) if idle_workers.len() > max_idle => {
                    idle_workers.split_off(max_idle)
                }
                _ => return Vec::new(),
            }
        };
        let mut stats = self.stats.lock();
        for _ in &workers {
            stats.remove_worker();
        }
        workers
    }

    /// Closes the pool and returns its idle workers: the caller must terminate them. Workers
    /// returned with [`Self::return_worker`] from now on are handed back for termination too.
    #[must_use]
    fn close(&self) -> Vec<u32> {
        let workers = self.idle_workers.lock().take().unwrap_or_default();
        let mut stats = self.stats.lock();
        for _ in &workers {
            stats.remove_worker();
        }
        workers
    }

    #[cfg(test)]
    fn idle_workers(&self) -> Vec<u32> {
        self.idle_workers.lock().clone().unwrap_or_default()
    }
}

/// Terminates the worker with the given id, which belongs to a pool with the given key.
pub(crate) type TerminateWorker<K> = fn(&K, u32);

/// The states of all live worker-thread pools, so that they can be scaled down globally.
pub(crate) struct PoolRegistry<K> {
    pools: Mutex<Vec<(K, Arc<PoolState>)>>,
}

impl<K: Clone + Send + Sync + 'static> PoolRegistry<K> {
    pub(crate) const fn new() -> Self {
        Self {
            pools: Mutex::new(Vec::new()),
        }
    }

    /// Registers a new pool's state until the returned [`PoolRegistration`] is dropped.
    pub(crate) fn register(
        &'static self,
        key: K,
        terminate: TerminateWorker<K>,
    ) -> PoolRegistration<K> {
        let state = Arc::new(PoolState::new());
        self.pools.lock().push((key.clone(), state.clone()));
        PoolRegistration {
            registry: self,
            key,
            state,
            terminate,
        }
    }

    /// Removes idle workers from every pool so that at most `max_idle` remain in each, and
    /// returns the removed ones: the caller must terminate them.
    #[must_use]
    pub(crate) fn reduce_to(&self, max_idle: usize) -> Vec<(K, u32)> {
        // Release the registry lock before locking the pools' states.
        let pools = self.pools.lock().clone();
        pools
            .into_iter()
            .flat_map(|(key, state)| {
                state
                    .reduce_to(max_idle)
                    .into_iter()
                    .map(move |worker_id| (key.clone(), worker_id))
            })
            .collect()
    }

    #[cfg(test)]
    fn contains(&self, state: &Arc<PoolState>) -> bool {
        self.pools.lock().iter().any(|(_, s)| Arc::ptr_eq(s, state))
    }
}

/// Publishes a pool's state in its [`PoolRegistry`] for as long as the pool is alive.
///
/// The pool is owned by its `EvaluatePool` cell. When the cell is dropped (e.g. replaced after an
/// invalidation, evicted, or dropped when turbo-tasks shuts down), this unregisters the state and
/// closes it: its idle workers are terminated, and so are workers that in-flight operations return
/// later.
pub(crate) struct PoolRegistration<K: Clone + Send + Sync + 'static> {
    registry: &'static PoolRegistry<K>,
    key: K,
    state: Arc<PoolState>,
    terminate: TerminateWorker<K>,
}

impl<K: Clone + Send + Sync + 'static> PoolRegistration<K> {
    pub(crate) fn state(&self) -> &Arc<PoolState> {
        &self.state
    }
}

impl<K: Clone + Send + Sync + 'static> Drop for PoolRegistration<K> {
    fn drop(&mut self) {
        {
            let mut pools = self.registry.pools.lock();
            if let Some(pos) = pools.iter().position(|(_, s)| Arc::ptr_eq(s, &self.state)) {
                pools.swap_remove(pos);
            }
        }
        for worker_id in self.state.close() {
            (self.terminate)(&self.key, worker_id);
        }
    }
}

#[cfg(test)]
mod tests {
    use parking_lot::Mutex;

    use super::*;

    /// Each test uses its own registry and key, so that tests running in parallel don't observe
    /// each other's terminations.
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

    fn leak_registry() -> &'static PoolRegistry<u32> {
        Box::leak(Box::new(PoolRegistry::new()))
    }

    #[test]
    fn drop_unregisters_and_terminates_idle_workers() {
        let registry = leak_registry();
        let registration = registry.register(1, record_termination);
        let state = registration.state().clone();
        assert!(registry.contains(&state));

        assert_eq!(state.return_worker(10), None);
        assert_eq!(state.return_worker(11), None);
        assert_eq!(terminated(1), Vec::<u32>::new());

        drop(registration);
        assert!(!registry.contains(&state));
        assert_eq!(terminated(1), vec![10, 11]);
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
    }

    #[test]
    fn return_after_drop_terminates_worker() {
        let registry = leak_registry();
        let registration = registry.register(2, record_termination);
        let state = registration.state().clone();

        drop(registration);
        // An operation that was still running when the pool was dropped returns its worker.
        assert_eq!(state.return_worker(20), Some(20));
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
        assert_eq!(state.pop_idle(), None);
    }

    #[test]
    fn return_hands_worker_to_waiter() {
        let registry = leak_registry();
        let registration = registry.register(3, record_termination);
        let state = registration.state();

        let (canceled_tx, canceled_rx) = oneshot::channel();
        let (tx, mut rx) = oneshot::channel();
        assert_eq!(state.pop_idle_or_wait(tx), None);
        assert_eq!(state.pop_idle_or_wait(canceled_tx), None);
        drop(canceled_rx);

        assert_eq!(state.return_worker(30), None);
        assert_eq!(rx.try_recv(), Ok(30));
        assert_eq!(state.idle_workers(), Vec::<u32>::new());
    }

    #[test]
    fn drop_does_not_affect_other_pool() {
        let registry = leak_registry();
        let registration_a = registry.register(4, record_termination);
        let registration_b = registry.register(5, record_termination);
        let state_a = registration_a.state().clone();
        let state_b = registration_b.state().clone();
        assert_eq!(state_a.return_worker(40), None);
        assert_eq!(state_b.return_worker(50), None);

        drop(registration_a);
        assert!(!registry.contains(&state_a));
        assert!(registry.contains(&state_b));
        assert_eq!(terminated(4), vec![40]);
        assert_eq!(terminated(5), Vec::<u32>::new());
        assert_eq!(state_b.pop_idle(), Some(50));
    }

    #[test]
    fn reduce_to_scales_down_registered_pools() {
        let registry = leak_registry();
        let registration_a = registry.register(6, record_termination);
        let registration_b = registry.register(7, record_termination);
        for worker_id in [60, 61, 62] {
            assert_eq!(registration_a.state().return_worker(worker_id), None);
        }
        assert_eq!(registration_b.state().return_worker(70), None);

        let mut removed = registry.reduce_to(1);
        removed.sort_unstable();
        assert_eq!(removed, vec![(6, 61), (6, 62)]);
        assert_eq!(registration_a.state().idle_workers(), vec![60]);
        assert_eq!(registration_b.state().idle_workers(), vec![70]);

        let mut removed = registry.reduce_to(0);
        removed.sort_unstable();
        assert_eq!(removed, vec![(6, 60), (7, 70)]);
    }
}
