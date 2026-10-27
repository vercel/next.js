use std::{
    collections::{BTreeMap, btree_map::Entry},
    fmt::Debug,
    future::Future,
    hash::Hash,
    pin::Pin,
    ptr::drop_in_place,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering, fence},
    },
    task::{Context, Poll},
    time::{Duration, Instant},
};

use arc_swap::ArcSwap;
use concurrent_queue::ConcurrentQueue;
use parking_lot::Mutex;
use pin_project_lite::pin_project;

use crate::FxDashMap;

pub trait Executor<C, T, P>: Send + Sync {
    type Future: Future<Output = ()> + Send;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: P) -> Self::Future;

    /// Called for a queued task that was replaced by a newer task with the same claim key (see
    /// [`Claimable::claim_key`]) and therefore will never be executed. Executors that do
    /// per-task bookkeeping when a task is scheduled must undo it here. Does nothing by default.
    fn discard(&self, _execute_context: &Arc<C>, _task: T, _priority: P) {}
}

/// A queued item that can be claimed by key before a worker starts executing it.
///
/// Claiming is how a reader takes over work it is about to wait for: instead of parking until some
/// worker gets around to the queued item, the reader removes it from the queue (see
/// [`PriorityRunner::claim`]) and drives it itself.
pub trait Claimable {
    type Key: Eq + Hash + Copy + Debug + Send + Sync;

    /// The key this item is identified and claimed by.
    ///
    /// The queue holds at most one item per key: queueing an item while another one with the same
    /// key is still queued replaces the older one, which is passed to [`Executor::discard`] instead
    /// of being executed. This only applies to queued items; an item that
    /// [`PriorityRunner::schedule`] hands to a worker directly never enters the queue.
    fn claim_key(&self) -> Self::Key;
}

/// The FIFO of the keys of all queued items with one priority.
struct PriorityQueue<P, K> {
    priority: P,
    keys: ConcurrentQueue<K>,
}

impl<P, K> PriorityQueue<P, K> {
    fn new(priority: P) -> Arc<Self> {
        Arc::new(Self {
            priority,
            keys: ConcurrentQueue::unbounded(),
        })
    }
}

/// The [`PriorityQueue`]s of all priorities, by priority.
type QueueMap<P, K> = BTreeMap<P, Arc<PriorityQueue<P, K>>>;

/// The queue of items that are not scheduled yet.
///
/// The queue relies on there being far fewer distinct priorities queued at the same time than
/// queued items. Every priority gets its own lock-free MPMC `ConcurrentQueue` of keys (a
/// [`PriorityQueue`]), so its FIFO order is the priority order within that priority. The queues
/// are sorted by priority in the `queues` map, which is only accessed under its mutex. The queue
/// of the highest priority is also published in `current`, outside the mutex, so that the hot
/// paths don't need the mutex:
/// - A pop takes the next key from the `current` queue without locking. Only when that queue is
///   empty, it locks `queues` to move on to the next lower priority (see [`Queue::pop_locked`]).
/// - A push with the `current` priority pushes to the `current` queue without locking. Other
///   priorities are pushed under the lock, which also publishes a new highest priority.
///
/// `queues` is never empty: it starts with an (empty) queue for `P::default()`, and the queue of
/// the last remaining priority is never removed, even when it is empty. So `current` always has a
/// queue, and pushing more items with its priority stays lock-free after the queue ran empty. In
/// particular, when all items have the default priority (e.g. a from-scratch build), pushes and
/// pops never take the mutex while there is work queued; only a pop that finds the queue empty
/// takes it (to check for other priorities), which is when workers run out of work anyway.
///
/// Invariants, maintained under the `queues` lock: `current` is the map entry of the highest
/// priority (the same `Arc`), and every queue in the map is open. A queue is only closed under the
/// lock while it is the `current` one, and in the same critical section it is either removed from
/// the map or replaced by a new queue. A push that finds its queue closed retries under the lock.
///
/// Items are stored by value in the `claimable` map, at most one per key, and the queues only hold
/// their key. Pushing a key that is still queued replaces the queued item, which is then handed to
/// [`Executor::discard`] instead of being executed. Claiming removes the item from the map. Either
/// way the old queue entry stays behind as a tombstone that a pop skips. A pop only takes an item
/// whose priority matches the queue entry's, so a stale entry never takes an item queued again
/// with another priority. With the *same* priority it may take it early, which only reorders
/// equal-priority items; every queued item still executes at most once.
///
/// Lock ordering: [`Queue::pop`] takes `claimable` shard locks while holding the `queues` mutex
/// (to resolve popped keys). Nothing takes the `queues` mutex while holding a `claimable` shard
/// lock: [`Queue::push`] finishes its `claimable` insert before it queues the key, and
/// [`Queue::claim`] only touches `claimable`. So the order is always `queues`, then `claimable`.
struct Queue<P, T: Claimable> {
    /// The queue of the highest priority in `queues`. Only replaced while holding the `queues`
    /// lock.
    current: ArcSwap<PriorityQueue<P, T::Key>>,
    /// The queues of all priorities that have queued items, plus the queue of the highest
    /// priority even if it is empty. Never empty.
    ///
    /// Its lock may be held while taking `claimable` shard locks, never the other way around (see
    /// the lock ordering on [`Queue`]).
    queues: Mutex<QueueMap<P, T::Key>>,
    /// The queued items with their priority, by claim key. An item is removed when it is popped or
    /// claimed, and replaced when another item with the same key is pushed.
    claimable: FxDashMap<T::Key, (P, T)>,
    /// How many items were ever pushed. Diagnostics only, see [`PriorityRunner::total_queued`].
    #[cfg(feature = "inline_execution_stats")]
    pushes: std::sync::atomic::AtomicU64,
}

impl<P: Clone + Ord + Default, T: Claimable> Queue<P, T> {
    fn new() -> Self {
        let initial = PriorityQueue::new(P::default());
        Self {
            current: ArcSwap::new(initial.clone()),
            queues: Mutex::new(BTreeMap::from([(initial.priority.clone(), initial)])),
            claimable: FxDashMap::default(),
            #[cfg(feature = "inline_execution_stats")]
            pushes: std::sync::atomic::AtomicU64::new(0),
        }
    }

    /// Whether there is no queue entry left. This can be `false` while all remaining entries are
    /// tombstones of claimed items; popping is what cleans those up.
    #[cfg(test)]
    fn is_empty(&self) -> bool {
        self.queues
            .lock()
            .values()
            .all(|queue| queue.keys.is_empty())
    }

    /// The number of priorities that have a queue, including the queue of the highest priority
    /// that is kept even when it is empty.
    #[cfg(test)]
    fn queue_count(&self) -> usize {
        self.queues.lock().len()
    }

    /// Stores `task` in `claimable`. Returns the still-queued item with the same key that it
    /// replaced, if any: that item will not be executed, and its queue entry became a tombstone.
    fn insert_claimable(&self, priority: &P, task: T) -> (T::Key, Option<(P, T)>) {
        #[cfg(feature = "inline_execution_stats")]
        self.pushes.fetch_add(1, Ordering::Relaxed);
        let key = task.claim_key();
        // Stored before the key is queued, so a pop can't find the key before the item.
        let replaced = self.claimable.insert(key, (priority.clone(), task));
        (key, replaced)
    }

    /// Pushes `key` to the `current` queue without locking, if that has the given priority.
    /// Returns the key back if that's not possible.
    fn try_push_current(&self, priority: &P, key: T::Key) -> Result<(), T::Key> {
        let current = self.current.load();
        if current.priority != *priority {
            return Err(key);
        }
        // An unbounded queue only fails to push when it is closed, which means a pop is about to
        // remove or replace it (see `pop_locked`). The key has to go to the map's queue instead.
        current.keys.push(key).map_err(|err| err.into_inner())
    }

    /// Pushes `key` to the queue of `priority`, creating it if needed. Returns whether a queue was
    /// created that has a higher priority than all others, in which case `current` has to be
    /// updated.
    fn push_locked(queues: &mut QueueMap<P, T::Key>, priority: P, key: T::Key) -> bool {
        match queues.entry(priority) {
            Entry::Occupied(entry) => {
                // Queues in the map are never closed (see the invariants on `Queue`).
                let result = entry.get().keys.push(key);
                debug_assert!(result.is_ok(), "queues in the map are never closed");
                false
            }
            Entry::Vacant(entry) => {
                let queue = PriorityQueue::new(entry.key().clone());
                // unbounded queue: push only fails if closed, and this one is new
                let _ = queue.keys.push(key);
                let priority = entry.key().clone();
                entry.insert(queue);
                // `queues` is never empty, so there is always a last entry.
                queues
                    .last_key_value()
                    .is_some_and(|(max, _)| *max == priority)
            }
        }
    }

    /// Publishes the queue of the highest priority in `current`.
    fn publish_current(&self, queues: &QueueMap<P, T::Key>) {
        let (_, queue) = queues
            .last_key_value()
            .expect("the queue map is never empty");
        self.current.store(queue.clone());
    }

    /// Queues `task`. Returns the still-queued item with the same key that it replaced, if any:
    /// that item will not be executed, and its queue entry became a tombstone.
    #[must_use]
    fn push(&self, priority: P, task: T) -> Option<(P, T)> {
        let (key, replaced) = self.insert_claimable(&priority, task);
        if let Err(key) = self.try_push_current(&priority, key) {
            let mut queues = self.queues.lock();
            if Self::push_locked(&mut queues, priority, key) {
                self.publish_current(&queues);
            }
        }
        replaced
    }

    /// Queues all `items`, like calling [`Queue::push`] for each of them, but takes the `queues`
    /// mutex at most once for the whole batch. Each still-queued item that one of the pushes
    /// replaced is passed to `on_replaced`.
    ///
    /// `items` must report its exact length, which is used to size an allocation.
    fn push_many(
        &self,
        items: impl IntoIterator<Item = (P, T), IntoIter: ExactSizeIterator>,
        mut on_replaced: impl FnMut(P, T),
    ) {
        let mut items = items.into_iter();
        // The keys that can't be pushed lock-free are collected first, so the mutex is only held
        // for pushing them, not for the `claimable` inserts (which also keeps the lock ordering,
        // see [`Queue`]). Only allocated once the first such key shows up, as batches of only
        // `current` priority items don't need it.
        let mut locked_items = Vec::new();
        while let Some((priority, task)) = items.next() {
            let (key, replaced) = self.insert_claimable(&priority, task);
            if let Err(key) = self.try_push_current(&priority, key) {
                if locked_items.is_empty() {
                    // This item plus at most all remaining ones need the lock.
                    locked_items.reserve(items.len() + 1);
                }
                locked_items.push((priority, key));
            }
            if let Some((priority, task)) = replaced {
                on_replaced(priority, task);
            }
        }
        if !locked_items.is_empty() {
            let mut queues = self.queues.lock();
            let mut new_max = false;
            for (priority, key) in locked_items {
                new_max |= Self::push_locked(&mut queues, priority, key);
            }
            if new_max {
                self.publish_current(&queues);
            }
        }
    }

    /// Pops the highest priority item, skipping tombstones. The `queues` mutex is only taken when
    /// the `current` queue is empty.
    fn pop(&self) -> Option<(P, T)> {
        {
            let current = self.current.load();
            while let Ok(key) = current.keys.pop() {
                if let Some(task) = self.take(&current.priority, &key) {
                    return Some((current.priority.clone(), task));
                }
            }
        }
        self.pop_locked()
    }

    /// The slow path of [`Queue::pop`] once the `current` queue was found empty: moves on to the
    /// next lower priority under the `queues` lock.
    ///
    /// This always works on the map's highest priority queue rather than on the queue the caller
    /// loaded from `current`, which may be stale by now: another pop may have already moved on,
    /// or a push may have published a higher priority.
    fn pop_locked(&self) -> Option<(P, T)> {
        let mut queues = self.queues.lock();
        loop {
            let (_, queue) = queues
                .last_key_value()
                .expect("the queue map is never empty");
            let queue = queue.clone();
            // The queue may no longer be empty once the lock is held, e.g. a lock-free push
            // happened in the meantime.
            while let Ok(key) = queue.keys.pop() {
                if let Some(task) = self.take(&queue.priority, &key) {
                    return Some((queue.priority.clone(), task));
                }
            }
            if queues.len() == 1 {
                // The last queue is kept (open and published) even when it is empty, so pushing
                // its priority stays lock-free.
                return None;
            }
            self.retire_current(&mut queues, &queue);
        }
    }

    /// Retires the `current` queue `queue`, which was found empty under the `queues` lock while
    /// there are other queues left: closes it and either removes it, or replaces it with a new
    /// queue for the keys that were pushed lock-free before it was closed. Then publishes the new
    /// highest priority queue.
    fn retire_current(&self, queues: &mut QueueMap<P, T::Key>, queue: &PriorityQueue<P, T::Key>) {
        // Close the queue so lock-free pushes fail and retry under the lock (after we are done),
        // instead of pushing to a queue that is no longer published.
        queue.keys.close();
        // A lock-free push may have succeeded between our last pop and the close. Its key keeps
        // the queue's priority: move it to a new queue that replaces this one, instead of moving
        // on to a lower priority while there are still items with this priority.
        let mut fresh = None;
        while let Ok(key) = queue.keys.pop() {
            let fresh = fresh.get_or_insert_with(|| PriorityQueue::new(queue.priority.clone()));
            // unbounded queue: push only fails if closed, and this one is new
            let _ = fresh.keys.push(key);
        }
        if let Some(fresh) = fresh {
            queues.insert(queue.priority.clone(), fresh);
        } else {
            queues.pop_last();
        }
        self.publish_current(queues);
    }

    /// Resolves a popped queue entry to its item, or `None` if it is a tombstone.
    fn take(&self, priority: &P, key: &T::Key) -> Option<T> {
        self.claimable
            .remove_if(key, |_, (item_priority, _)| item_priority == priority)
            .map(|(_, (_, task))| task)
    }

    /// Removes the queued item with the given key, if it is still queued. Its queue entry stays
    /// behind as a tombstone.
    fn claim(&self, key: &T::Key) -> Option<(P, T)> {
        self.claimable.remove(key).map(|(_, item)| item)
    }
}

pub struct PriorityRunner<
    C: Send + Sync + 'static,
    T: Claimable + Send + Sync + 'static,
    P: Clone + Ord + Default + Send + Sync + 'static,
    E: Executor<C, T, P> + 'static,
> {
    executor: E,
    /// The target number of workers to spawn.
    target_workers: usize,
    /// The queue of tasks to execute. These tasks are not scheduled yet.
    queue: Queue<P, T>,
    /// The number of active workers currently polling tasks.
    /// Workers that responded with Poll::Pending are not counted until they are polled again.
    active_workers: AtomicUsize,
    phantom: std::marker::PhantomData<C>,
}

impl<
    C: Send + Sync + 'static,
    T: Claimable + Send + Sync + 'static,
    P: Clone + Ord + Default + Send + Sync + 'static,
    E: Executor<C, T, P> + 'static,
> PriorityRunner<C, T, P, E>
{
    pub fn new(executor: E) -> Self {
        Self::with_target_workers(
            executor,
            tokio::runtime::Handle::current().metrics().num_workers(),
        )
    }

    fn with_target_workers(executor: E, target_workers: usize) -> Self {
        Self {
            executor,
            target_workers,
            queue: Queue::new(),
            active_workers: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    /// How many tasks were ever put into the queue, as opposed to being executed without ever being
    /// queued. Diagnostics only — it lets a test assert that a task never took the detour through
    /// the queue.
    #[cfg(feature = "inline_execution_stats")]
    pub fn total_queued(&self) -> u64 {
        self.queue.pushes.load(Ordering::Relaxed)
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: P) {
        // Scheduling is correct without a single covering lock. The liveness argument is a
        // store-buffering pattern between a scheduler and a retiring worker: the scheduler pushes
        // and then reads `active_workers`; a retiring worker decrements `active_workers` and then
        // re-checks the queue (see `decrease_active_workers`). At least one of them must observe
        // the other's write, or the pushed task could be stranded with no live worker.
        // Acquire/release alone doesn't guarantee that, so both sides put a `SeqCst` fence between
        // their write and their read: whichever fence comes first in the total order of `SeqCst`
        // fences, the other side's read observes the write before it. (It cannot rely on the
        // queue's own synchronization instead — a push may go lock-free to the `current` queue
        // or under the lock to another queue, while a retiring worker's pop may only look at the
        // `current` queue it loaded, so there is no single edge forcing the push to be observed.)
        //
        // [`claim`](Self::claim) takes work out of the queue without being a worker, but that only
        // ever leaves less work behind, so it cannot strand anything.
        //
        // A plain `load` decides capacity; it may be stale, but that only affects the scheduling
        // hint (spawn vs enqueue), which the active-worker accounting self-corrects. Correctness
        // only needs the task to be enqueued (or directly spawned) and eventually popped by
        // some worker.
        let active_workers = self.active_workers.load(Ordering::Acquire);
        if active_workers < self.target_workers {
            // We may have free capacity. Reserve the slot with a single RMW and re-check its return
            // value (the `load` above could be stale under a racing scheduler).
            let prev = self.active_workers.fetch_add(1, Ordering::AcqRel);
            if prev < self.target_workers {
                // We own a slot: spawn a new worker to execute this task immediately.
                let future = self.executor.execute(execute_context, task, priority);
                WorkerFuture::spawn(future, execute_context.clone(), self.clone());
            } else {
                // Lost the race, the pool filled up between the load and the RMW. Enqueue the task
                // and give the slot back like a retiring worker would: `decrease_active_workers`
                // undoes our increment and re-checks the queue, so it is covered by the same
                // argument as any retiring worker.
                let replaced = self.queue.push(priority, task);
                self.decrease_active_workers(execute_context);
                self.discard_replaced(execute_context, replaced);
            }
        } else {
            // Saturated (the dominant hot path). Push the task for an existing worker to pick up,
            // then re-read `active_workers` behind a `SeqCst` fence (see above). The fence keeps
            // this hot path from writing to the shared `active_workers` cache line.
            let replaced = self.queue.push(priority, task);
            fence(Ordering::SeqCst);
            let active_workers = self.active_workers.load(Ordering::Relaxed);
            if active_workers < self.target_workers {
                // Capacity opened up since our first `load` (a worker retired concurrently). The
                // retiring worker may have already popped an empty queue, so re-check here to
                // ensure our just-pushed task is not stranded with no live worker.
                self.spawn_worker_if_work_available(execute_context, false);
            }
            self.discard_replaced(execute_context, replaced);
        }
    }

    /// Schedules all `items`, like calling [`PriorityRunner::schedule`] for each of them.
    ///
    /// Items are handed directly to new workers while there is free worker capacity. All remaining
    /// items are queued in one batch, which takes the queue mutex at most once instead of once per
    /// item. `items` must report its exact length, which is used to size that batch's allocation.
    pub fn schedule_many(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        items: impl IntoIterator<Item = (T, P), IntoIter: ExactSizeIterator>,
    ) {
        let mut items = items.into_iter().peekable();
        // Spawn workers directly while there is capacity, with the same slot reservation as
        // `schedule`.
        loop {
            if items.peek().is_none() {
                return;
            }
            let active_workers = self.active_workers.load(Ordering::Acquire);
            if active_workers >= self.target_workers {
                break;
            }
            let prev = self.active_workers.fetch_add(1, Ordering::AcqRel);
            if prev < self.target_workers {
                let (task, priority) = items.next().unwrap();
                let future = self.executor.execute(execute_context, task, priority);
                WorkerFuture::spawn(future, execute_context.clone(), self.clone());
            } else {
                // Lost the race, the pool filled up between the load and the RMW. Enqueue the
                // remaining tasks and give the slot back like a retiring worker would (see
                // `schedule`).
                self.queue_many(execute_context, items);
                self.decrease_active_workers(execute_context);
                return;
            }
        }
        // Saturated. Push the remaining tasks as one batch, then re-read `active_workers` behind a
        // `SeqCst` fence (see `schedule`).
        self.queue_many(execute_context, items);
        fence(Ordering::SeqCst);
        // Capacity may have opened up since our `load` (workers retired concurrently). A retiring
        // worker may have already popped an empty queue, so spawn workers for the just-pushed
        // tasks as long as there is capacity, as scheduling them one by one would have done.
        while self.active_workers.load(Ordering::Relaxed) < self.target_workers {
            if !self.spawn_worker_if_work_available(execute_context, false) {
                break;
            }
        }
    }

    /// Queues all `items` in one batch and hands the queued tasks they replaced to
    /// [`Executor::discard`].
    fn queue_many(&self, execute_context: &Arc<C>, items: impl ExactSizeIterator<Item = (T, P)>) {
        self.queue.push_many(
            items.map(|(task, priority)| (priority, task)),
            |priority, task| self.executor.discard(execute_context, task, priority),
        );
    }

    /// Hands a queued task that a push replaced to [`Executor::discard`].
    fn discard_replaced(&self, execute_context: &Arc<C>, replaced: Option<(P, T)>) {
        if let Some((priority, task)) = replaced {
            self.executor.discard(execute_context, task, priority);
        }
    }

    /// Takes the queued task with the given key out of the queue and returns its execution future,
    /// or `None` when there is no such task in the queue (it was never scheduled, a worker already
    /// picked it up, or it was claimed before).
    ///
    /// The caller takes over the responsibility to drive the returned future to completion; the
    /// task left the queue, so no worker will do it.
    pub fn claim(&self, execute_context: &Arc<C>, key: &T::Key) -> Option<E::Future> {
        let (priority, task) = self.queue.claim(key)?;
        Some(self.executor.execute(execute_context, task, priority))
    }

    /// Tries to decrease the active worker count by 1.
    /// If there is work available in the queue, a new worker is spawned instead.
    fn reuse_or_decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        let active_workers = self.active_workers.load(Ordering::Acquire) - 1;
        if active_workers >= self.target_workers
            || !self.spawn_worker_if_work_available(execute_context, true)
        {
            // Undo the added active worker since we didn't spawn a new worker.
            // Beware the race condition here:
            // If the active workers became lower in the meantime we might have free
            // capacity now, so we try to spawn a new worker if
            // there is work available.
            self.decrease_active_workers(execute_context);
        }
    }

    /// Tries to decrease the active worker count by 1.
    /// If there is work available in the queue, a new worker is spawned instead.
    ///
    /// This re-check is load-bearing for liveness: it is the path that re-spawns a worker for a
    /// task that was enqueued (rather than directly spawned) by `schedule` while the pool was
    /// saturated. The `SeqCst` fence between the decrement and the re-check pairs with the fence in
    /// `schedule` (see the comment there): either this re-check observes the push, or the
    /// scheduler observes the decrement and re-checks itself. Every way a worker gives up its
    /// count goes through here. Two decrements (or a scheduler that lost the reservation race and
    /// a retiring worker) are also ordered by `active_workers`' modification order, as both are
    /// `AcqRel` RMWs.
    fn decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        // If the active workers became lower we might have free
        // capacity now, so we try to spawn a new worker if
        // there is work available.
        let active_workers = self.active_workers.fetch_sub(1, Ordering::AcqRel) - 1;
        fence(Ordering::SeqCst);
        if active_workers < self.target_workers {
            self.spawn_worker_if_work_available(execute_context, false);
        }
    }

    fn pop_future_from_worker(&self, execute_context: &Arc<C>) -> Option<E::Future> {
        let (priority, task) = self.queue.pop()?;
        Some(self.executor.execute(execute_context, task, priority))
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        unused_active_count: bool,
    ) -> bool {
        if let Some((priority, task)) = self.queue.pop() {
            let new_future = self.executor.execute(execute_context, task, priority);

            if !unused_active_count {
                self.active_workers.fetch_add(1, Ordering::AcqRel);
            }
            WorkerFuture::spawn(new_future, execute_context.clone(), self.clone());
            true
        } else {
            false
        }
    }
}

#[derive(Debug)]
enum WorkerState {
    UnfinishedFuture,
    PendingFuture,
    Done,
    Closed,
}

pin_project! {
    struct WorkerFuture<C, T, P, E>
    where
        // pin_project doesn't support bounds with +
        C: Send,
        C: Sync,
        C: 'static,
        T: Claimable,
        T: Send,
        T: Sync,
        T: 'static,
        P: Clone,
        P: Ord,
        P: Default,
        P: Send,
        P: Sync,
        P: 'static,
        E: Executor<C, T, P>,
        E: 'static,

    {
        #[pin]
        future: E::Future,
        execute_context: Arc<C>,
        runner: Arc<PriorityRunner<C, T, P, E>>,
        state: WorkerState,
    }
}

impl<
    C: Send + Sync + 'static,
    T: Claimable + Send + Sync + 'static,
    P: Clone + Ord + Default + Send + Sync + 'static,
    E: Executor<C, T, P> + 'static,
> WorkerFuture<C, T, P, E>
{
    fn spawn(future: E::Future, execute_context: Arc<C>, runner: Arc<PriorityRunner<C, T, P, E>>) {
        tokio::task::spawn(Self {
            future,
            execute_context,
            runner,
            state: WorkerState::UnfinishedFuture,
        });
    }
}

impl<
    C: Send + Sync + 'static,
    T: Claimable + Send + Sync + 'static,
    P: Clone + Ord + Default + Send + Sync + 'static,
    E: Executor<C, T, P> + 'static,
> Future for WorkerFuture<C, T, P, E>
{
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut this = self.project();
        if matches!(this.state, WorkerState::PendingFuture) {
            // When the worker is not active (it previously returned Poll::Pending),
            // we need to mark it as active again since it is being polled now.
            this.runner.active_workers.fetch_add(1, Ordering::AcqRel);
            *this.state = WorkerState::UnfinishedFuture;
        }
        let last_yield = Instant::now();
        loop {
            match this.state {
                WorkerState::Closed => return Poll::Ready(()),
                WorkerState::PendingFuture => unreachable!(),
                WorkerState::UnfinishedFuture => {
                    match this.future.as_mut().poll(cx) {
                        Poll::Ready(()) => {
                            *this.state = WorkerState::Done;

                            if last_yield.elapsed() > Duration::from_millis(5) {
                                cx.waker().wake_by_ref();
                                return Poll::Pending;
                            }
                        }
                        Poll::Pending => {
                            // The current future is still pending, we need to suspend this worker.
                            // But we if there are free capacity we can spawn a new worker to pick
                            // up other tasks in the queue.
                            this.runner
                                .reuse_or_decrease_active_workers(this.execute_context);
                            *this.state = WorkerState::PendingFuture;
                            return Poll::Pending;
                        }
                    }
                }
                WorkerState::Done => {
                    let active_workers = this.runner.active_workers.load(Ordering::Acquire);
                    if active_workers > this.runner.target_workers {
                        // There are more active workers than target, so we should end this
                        // worker.
                        this.runner.decrease_active_workers(this.execute_context);
                        *this.state = WorkerState::Closed;
                        return Poll::Ready(());
                    }

                    // This future is done, we need to check the queue for more tasks,
                    // so we can continue working on a new future in this worker.
                    if let Some(new_future) =
                        this.runner.pop_future_from_worker(this.execute_context)
                    {
                        // We are replacing the future with a new one, but the current future is
                        // pinned. So we need to drop the future in place
                        // and replace it with the new future, which becomes
                        // pinned in that place.
                        // SAFETY: The pinned future is dropped in place
                        unsafe {
                            let future_slot = this.future.as_mut().get_unchecked_mut();
                            let future_slot: *mut E::Future = future_slot;
                            drop_in_place(future_slot);
                            future_slot.write(new_future);
                        }
                        *this.state = WorkerState::UnfinishedFuture;
                    } else {
                        // No more tasks to execute
                        // This worker ends here
                        this.runner.decrease_active_workers(this.execute_context);
                        *this.state = WorkerState::Closed;
                        return Poll::Ready(());
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Barrier},
        thread::sleep,
        time::Duration,
    };

    use super::*;

    // The tests use plain `u32` priorities: a larger value is a higher priority, and `0` (the
    // `Default`) is the priority of the queue the runner starts with.

    impl Claimable for u32 {
        type Key = u32;

        fn claim_key(&self) -> u32 {
            *self
        }
    }

    /// A `(key, payload)` item, to tell apart items that share a key.
    impl Claimable for (u32, bool) {
        type Key = u32;

        fn claim_key(&self) -> u32 {
            self.0
        }
    }

    impl<'a> Claimable for &'a str {
        type Key = &'a str;

        fn claim_key(&self) -> &'a str {
            self
        }
    }

    /// An executor that records which items it was asked to execute, in order, and whose futures
    /// complete immediately. Lets the queue be driven without a tokio runtime. Items replaced in
    /// the queue are recorded in `discarded`.
    struct RecordingExecutor<T> {
        discarded: Mutex<Vec<T>>,
    }

    impl<T: Claimable + Copy + Send + Sync + Debug + 'static> Executor<Mutex<Vec<T>>, T, u32>
        for RecordingExecutor<T>
    {
        type Future = std::future::Ready<()>;

        fn execute(
            &self,
            execute_context: &Arc<Mutex<Vec<T>>>,
            task: T,
            _priority: u32,
        ) -> Self::Future {
            execute_context.lock().push(task);
            std::future::ready(())
        }

        fn discard(&self, _execute_context: &Arc<Mutex<Vec<T>>>, task: T, _priority: u32) {
            self.discarded.lock().push(task);
        }
    }

    /// The recorded executions of a test runner, in execution order.
    type Executions<T> = Arc<Mutex<Vec<T>>>;
    /// A test runner over items of type `T`.
    type TestRunner<T> = Arc<PriorityRunner<Mutex<Vec<T>>, T, u32, RecordingExecutor<T>>>;

    /// A runner that queues every scheduled item (`target_workers == 0`, so no worker is ever
    /// spawned) and therefore needs no tokio runtime. `pop_future_from_worker` stands in for what a
    /// worker would do.
    fn queueing_runner<T: Claimable + Copy + Send + Sync + Debug + 'static>()
    -> (TestRunner<T>, Executions<T>) {
        (
            Arc::new(PriorityRunner::with_target_workers(
                RecordingExecutor {
                    discarded: Mutex::new(Vec::new()),
                },
                0,
            )),
            Arc::new(Mutex::new(Vec::new())),
        )
    }

    /// Drains the queue the way workers would and returns the items in execution order.
    fn drain<T: Claimable + Copy + Send + Sync + Debug + 'static>(
        runner: &TestRunner<T>,
        executed: &Executions<T>,
    ) -> Vec<T> {
        while runner.pop_future_from_worker(executed).is_some() {}
        let items = executed.lock().clone();
        executed.lock().clear();
        items
    }

    #[test]
    fn test_claim_queued_entry_by_key() {
        let (runner, executed) = queueing_runner::<u32>();
        for task in 0..4 {
            runner.schedule(&executed, task, task);
        }

        // Claiming builds the execution future, which the recording executor counts as executed.
        assert!(runner.claim(&executed, &2).is_some());
        assert_eq!(*executed.lock(), vec![2]);
        executed.lock().clear();

        // The claimed entry is gone from the queue; everything else still runs, highest priority
        // first.
        assert_eq!(drain(&runner, &executed), vec![3, 1, 0]);
    }

    #[test]
    fn test_claim_unknown_key_returns_none() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 1, 1);

        // Never scheduled.
        assert!(runner.claim(&executed, &42).is_none());
        // Already executed by a "worker".
        assert_eq!(drain(&runner, &executed), vec![1]);
        assert!(runner.claim(&executed, &1).is_none());
        assert!(executed.lock().is_empty());
    }

    #[test]
    fn test_claim_twice_returns_none() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 7, 7);

        assert!(runner.claim(&executed, &7).is_some());
        assert!(runner.claim(&executed, &7).is_none());
        assert_eq!(*executed.lock(), vec![7]);
        executed.lock().clear();

        // Only a tombstone is left.
        assert!(drain(&runner, &executed).is_empty());
    }

    #[test]
    fn test_claimed_entry_is_executed_exactly_once() {
        let (runner, executed) = queueing_runner::<u32>();
        for task in 0..10 {
            runner.schedule(&executed, task, task);
        }
        for task in [0, 5, 9] {
            assert!(runner.claim(&executed, &task).is_some());
        }
        let mut all = drain(&runner, &executed);
        all.sort_unstable();
        // Every scheduled item was executed exactly once: three by the claimer, the rest by
        // "workers".
        assert_eq!(all, (0..10).collect::<Vec<_>>());
    }

    #[test]
    fn test_claim_preserves_priority_order() {
        let (runner, executed) = queueing_runner::<u32>();
        for task in 0..6 {
            runner.schedule(&executed, task, task);
        }
        assert!(runner.claim(&executed, &4).is_some());
        executed.lock().clear();

        assert_eq!(drain(&runner, &executed), vec![5, 3, 2, 1, 0]);
    }

    /// The items the runner discarded since the last call, in order.
    fn take_discarded<T: Claimable + Copy + Send + Sync + Debug + 'static>(
        runner: &TestRunner<T>,
    ) -> Vec<T> {
        std::mem::take(&mut *runner.executor.discarded.lock())
    }

    /// Queueing a key that is still queued replaces the queued item: only the latest one is
    /// executed (or claimed), exactly once, and the replaced one is discarded.
    #[test]
    fn test_push_same_key_overrides() {
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        // Same priority.
        runner.schedule(&executed, (1, false), 5);
        runner.schedule(&executed, (1, true), 5);
        assert_eq!(take_discarded(&runner), vec![(1, false)]);
        assert_eq!(drain(&runner, &executed), vec![(1, true)]);

        // Higher priority: the latest item is claimable, the older one is gone.
        runner.schedule(&executed, (1, false), 1);
        runner.schedule(&executed, (1, true), 2);
        assert_eq!(take_discarded(&runner), vec![(1, false)]);
        assert!(runner.claim(&executed, &1).is_some());
        assert_eq!(*executed.lock(), vec![(1, true)]);
        executed.lock().clear();
        assert!(runner.claim(&executed, &1).is_none());
        assert!(drain(&runner, &executed).is_empty());

        // Default priority: the stale entry of the replaced item may take the latest one early
        // (equal priority), but it still runs only once.
        runner.schedule(&executed, (1, false), 0);
        runner.schedule(&executed, (2, false), 0);
        runner.schedule(&executed, (1, true), 0);
        assert_eq!(take_discarded(&runner), vec![(1, false)]);
        assert_eq!(drain(&runner, &executed), vec![(1, true), (2, false)]);
        assert!(runner.queue.claimable.is_empty());
        assert!(runner.queue.is_empty());

        // A key that is no longer queued (popped or claimed) is not replaced: nothing is discarded.
        runner.schedule(&executed, (1, false), 0);
        assert_eq!(drain(&runner, &executed), vec![(1, false)]);
        runner.schedule(&executed, (1, true), 0);
        assert!(runner.claim(&executed, &1).is_some());
        runner.schedule(&executed, (1, false), 3);
        assert!(take_discarded(&runner).is_empty());
    }

    #[test]
    fn test_schedule_many_respects_priority_order() {
        let (runner, executed) = queueing_runner::<u32>();
        // Mixes priorities: odd items have their own priority, even ones the default priority.
        runner.schedule_many(
            &executed,
            (0..8).map(|task| (task, if task % 2 == 0 { 0 } else { task })),
        );
        // Highest priority first, then the default priority items in FIFO order.
        assert_eq!(drain(&runner, &executed), vec![7, 5, 3, 1, 0, 2, 4, 6]);
        assert!(runner.queue.is_empty());
        assert!(runner.queue.claimable.is_empty());
    }

    #[test]
    fn test_schedule_many_interleaves_with_schedule() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 4, 4);
        runner.schedule_many(&executed, [(1, 1), (6, 6), (3, 3)]);
        runner.schedule(&executed, 5, 5);
        assert_eq!(drain(&runner, &executed), vec![6, 5, 4, 3, 1]);
    }

    #[test]
    fn test_schedule_many_empty() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule_many(&executed, std::iter::empty());
        assert!(runner.queue.is_empty());
        assert_eq!(runner.queue.queue_count(), 1);
        assert!(drain(&runner, &executed).is_empty());
        assert!(take_discarded(&runner).is_empty());
    }

    #[test]
    fn test_schedule_many_items_are_claimable() {
        let (runner, executed) = queueing_runner::<u32>();
        // Items 0 and 1 have the default priority, the others their own priority.
        runner.schedule_many(
            &executed,
            (0..6).map(|task| (task, if task < 2 { 0 } else { task })),
        );
        assert!(runner.claim(&executed, &4).is_some());
        assert!(runner.claim(&executed, &1).is_some());
        assert_eq!(*executed.lock(), vec![4, 1]);
        executed.lock().clear();
        assert_eq!(drain(&runner, &executed), vec![5, 3, 2, 0]);
    }

    /// Same claim key semantics as `schedule`: the latest item wins, the replaced ones are
    /// discarded, both within a batch and against items queued before.
    #[test]
    fn test_schedule_many_same_key_discards() {
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        runner.schedule(&executed, (1, false), 5);
        runner.schedule_many(
            &executed,
            [
                // Replaces the item queued before.
                ((1, true), 5),
                // Replaced within the batch, with the default and another priority.
                ((2, false), 0),
                ((2, true), 0),
                ((3, false), 3),
                ((3, true), 3),
                // Replaces with another priority.
                ((1, false), 7),
            ],
        );
        assert_eq!(
            take_discarded(&runner),
            vec![(1, false), (2, false), (3, false), (1, true)]
        );
        assert_eq!(
            drain(&runner, &executed),
            vec![(1, false), (3, true), (2, true)]
        );
        assert!(runner.queue.is_empty());
        assert!(runner.queue.claimable.is_empty());
    }

    #[cfg(not(miri))]
    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn test_schedule_many_with_workers() {
        use std::sync::atomic::AtomicU32;

        struct CountingExecutor;
        impl Executor<Vec<AtomicU32>, u32, u32> for CountingExecutor {
            type Future = std::future::Ready<()>;

            fn execute(
                &self,
                counts: &Arc<Vec<AtomicU32>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                counts[task as usize].fetch_add(1, Ordering::Relaxed);
                std::future::ready(())
            }
        }

        let counts: Arc<Vec<AtomicU32>> = Arc::new((0..2000).map(|_| AtomicU32::new(0)).collect());
        // Fewer workers than items, so part of each batch is spawned directly and the rest is
        // queued.
        let runner: Arc<PriorityRunner<Vec<AtomicU32>, u32, u32, CountingExecutor>> =
            Arc::new(PriorityRunner::with_target_workers(CountingExecutor, 3));
        for batch in 0..20u32 {
            runner.schedule_many(
                &counts,
                (batch * 100..(batch + 1) * 100).map(|task| (task, task % 4)),
            );
        }
        let deadline = Instant::now() + Duration::from_secs(30);
        while counts.iter().any(|c| c.load(Ordering::Acquire) == 0) {
            assert!(
                Instant::now() < deadline,
                "not all scheduled tasks executed"
            );
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
        assert!(counts.iter().all(|c| c.load(Ordering::Acquire) == 1));
    }

    /// Every item of a batch counts as a push.
    #[cfg(feature = "inline_execution_stats")]
    #[test]
    fn test_total_queued_counts_batch_pushes() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule_many(&executed, (0..5).map(|task| (task, task % 2)));
        assert_eq!(runner.total_queued(), 5);
    }

    #[test]
    fn test_tombstones_and_index_are_cleaned_up() {
        let (runner, executed) = queueing_runner::<u32>();
        for _ in 0..100 {
            for task in 0..8 {
                // Mix priorities, so tombstones end up in several queues.
                let priority = if task % 2 == 0 { 0 } else { task };
                runner.schedule(&executed, task, priority);
            }
            // Claim one of each kind every round, so tombstones are part of the cycle.
            assert!(runner.claim(&executed, &3).is_some());
            assert!(runner.claim(&executed, &4).is_some());
            // The claimed two were recorded when their futures were built; the rest by "workers".
            assert_eq!(drain(&runner, &executed).len(), 8);
            assert!(runner.queue.is_empty());
            assert!(
                runner.queue.claimable.is_empty(),
                "claimable index should be empty when the queue is empty"
            );
        }
    }

    /// Every push into the queue is counted, so a test can assert that a task was executed without
    /// ever being queued.
    #[cfg(feature = "inline_execution_stats")]
    #[test]
    fn test_total_queued_counts_pushes() {
        let (runner, executed) = queueing_runner::<u32>();
        assert_eq!(runner.total_queued(), 0);
        for task in 0..3 {
            runner.schedule(&executed, task, task);
        }
        assert_eq!(runner.total_queued(), 3);
        // Claiming and draining do not change how many pushes happened.
        assert!(runner.claim(&executed, &1).is_some());
        drain(&runner, &executed);
        assert_eq!(runner.total_queued(), 3);
    }

    #[cfg(not(miri))]
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_cpu_bound_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    sleep(Duration::from_millis((task as u64 + 1) * 10));
                    execute_context.lock().push(task);
                    println!("Finished task {}.", task);
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // The first two tasks are directly spawned without queuing
        assert_eq!(&results[0..2], &[0, 1]);
        // All tasks after that are queued and therefore prioritized
        // This means the highest priority tasks are executed next
        assert!(results[2..4].contains(&9));
        assert!(results[2..4].contains(&8));
        // The last tasks are the tasks with the lowest priority
        assert!(results[8..10].contains(&2));
        assert!(results[8..10].contains(&3));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_cpu_bound_with_yield_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    sleep(Duration::from_millis((task as u64 + 1) * 10));
                    execute_context.lock().push(task);
                    println!("Finished task {}.", task);
                    tokio::task::yield_now().await;
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        // The first two tasks are directly spawned without queuing
        assert_eq!(&results[0..2], &[0, 1]);
        // All tasks after that are queued and therefore prioritized
        // This means the highest priority tasks are executed next
        assert!(results[2..4].contains(&9));
        assert!(results[2..4].contains(&8));
        // The last tasks are the tasks with the lowest priority
        assert!(results[8..10].contains(&2));
        assert!(results[8..10].contains(&3));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_waiting_tasks() {
        struct ExecutorImpl;

        impl Executor<Mutex<Vec<u32>>, u32, u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                execute_context: &Arc<Mutex<Vec<u32>>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                let execute_context = execute_context.clone();
                Box::pin(async move {
                    println!("Executing task {}...", task);
                    tokio::time::sleep(Duration::from_millis((task as u64 + 1) * 10)).await;
                    execute_context.lock().push(task);
                    println!("Finished task {}.", task);
                })
            }
        }

        let executor = ExecutorImpl;

        let runner: Arc<PriorityRunner<Mutex<Vec<u32>>, u32, u32, _>> =
            Arc::new(PriorityRunner::new(executor));
        let results = Arc::new(Mutex::new(Vec::new()));

        for i in 0..10 {
            let results = results.clone();
            println!("Scheduling task {}...", i);
            runner.schedule(&results, i, i);
        }

        while results.lock().len() < 10 {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        let results = results.lock();
        println!("Results: {:?}", *results);

        assert_eq!(*results, vec![0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }

    /// Test that verifies priority ordering with mixed CPU-bound and waiting tasks.
    ///
    /// - Tasks 0-9 are CPU-bound (simulated using a non-tokio barrier)
    /// - Tasks 10-19 are waiting tasks (async yield)
    ///
    /// Each task waits on two barriers (start, finish). The release sequence
    /// controls execution order deterministically.
    #[test]
    // Same teardown deadlock as `scope::tests::test_scope_runs_in_parallel`: this orchestrates 20
    // tasks through sync barriers and `spawn_blocking`, and dropping the runtime while those
    // blocking threads are live hangs on wasm. Removed once the wasm runtime owns its lifetime.
    #[cfg_attr(
        target_family = "wasm",
        ignore = "tokio runtime shutdown hangs on wasm while blocking threads are live"
    )]
    fn test_mixed_cpu_bound_and_waiting_tasks() {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .event_interval(1)
            .global_queue_interval(1)
            .disable_lifo_slot()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                tokio::time::timeout(
                    Duration::from_secs(10),
                    test_mixed_cpu_bound_and_waiting_tasks_impl(),
                )
                .await
            })
            .expect("Timed out")
    }

    async fn test_mixed_cpu_bound_and_waiting_tasks_impl() {
        const NUM_TASKS: usize = 20;

        struct TestContext {
            dispatch_order: Mutex<Vec<u32>>,
            completion_order: Mutex<Vec<u32>>,
            task_barriers: Vec<(Barrier, Barrier)>,
        }

        impl Drop for TestContext {
            fn drop(&mut self) {
                // Print ordering for debugging purposes (in both test success
                // and failure cases). Not asserted because the barriers will
                // enforce a reasonable ordering and there's a bit of a race
                // between barrier release and printing anyways.
                let dispatch_order = self.dispatch_order.lock().clone();
                let completion_order = self.completion_order.lock().clone();
                println!("Dispatch order: {:?}", dispatch_order);
                println!("Completion order: {:?}", completion_order);
            }
        }

        struct ExecutorImpl;

        impl Executor<TestContext, (u32, bool), u32> for ExecutorImpl {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

            fn execute(
                &self,
                ctx: &Arc<TestContext>,
                (task, cpu): (u32, bool),
                _priority: u32,
            ) -> Self::Future {
                let ctx = ctx.clone();
                Box::pin(async move {
                    println!("Dispatched task {task}");
                    ctx.dispatch_order.lock().push(task);
                    let ctx_clone = ctx.clone();
                    tokio::task::spawn_blocking(move || {
                        ctx_clone.task_barriers[task as usize].0.wait();
                    })
                    .await
                    .unwrap();
                    println!("Started task {task}");
                    if !cpu {
                        tokio::task::yield_now().await;
                    }
                    // The ending barrier is sync!
                    ctx.task_barriers[task as usize].1.wait();
                    println!("Finished task {task}");
                    ctx.completion_order.lock().push(task);
                })
            }
        }

        let ctx = Arc::new(TestContext {
            dispatch_order: Mutex::new(Vec::new()),
            completion_order: Mutex::new(Vec::new()),
            task_barriers: (0..NUM_TASKS)
                .map(|_| (Barrier::new(2), Barrier::new(2)))
                .collect(),
        });

        let runner = Arc::new(PriorityRunner::new(ExecutorImpl));

        #[derive(Debug)]
        enum Action {
            Schedule(u32, bool),      // true if cpu, false if wait
            ScheduleStart(u32, bool), // true if cpu, false if wait
            StartFinish(u32),
            Start(u32),
            Finish(u32),
        }

        // This action sequence encodes scheduling and barrier-runs.
        #[rustfmt::skip]
        let actions: &[Action] = &[
            // Schedule and start 0 and 1 (CPU-bound).
            Action::ScheduleStart(0, true),
            Action::ScheduleStart(1, true),

            // These sneak in during a thread race
            Action::Schedule(2, true),
            Action::Schedule(3, true),
            Action::Schedule(4, true),
            Action::Schedule(5, true),

            // Let CPU-bound 0 and 1 reach complete which allows 4 and 5 to start
            Action::Finish(0),
            Action::Finish(1),
            Action::Start(4),
            Action::Start(5),

            // Schedule the rest of the tasks while the CPU-bound tasks are running
            Action::Schedule(6, true),
            Action::Schedule(7, true),
            Action::Schedule(8, true),
            Action::Schedule(9, true),
            // 10..19 are waiting tasks
            Action::Schedule(10, false),
            Action::Schedule(11, false),
            Action::Schedule(12, false),
            Action::Schedule(13, false),
            Action::Schedule(14, false),
            Action::Schedule(15, false),
            Action::Schedule(16, false),
            Action::Schedule(17, false),
            Action::Schedule(18, false),
            Action::Schedule(19, false),

            // Let CPU-bound 2 and 3 reach complete which lets in the high priority tasks
            Action::Finish(4),
            Action::StartFinish(19),
            Action::Finish(5),
            Action::StartFinish(18),

            // Then let the rest of the waiting tasks through
            Action::StartFinish(17),
            Action::StartFinish(16),
            Action::StartFinish(15),
            Action::StartFinish(14),
            Action::StartFinish(13),
            Action::StartFinish(12),
            Action::StartFinish(11),
            Action::StartFinish(10),

            // And interleave the CPU ones a bit
            Action::Start(9),
            Action::Start(8),
            Action::Finish(8),
            Action::Start(7),
            Action::Finish(7),
            Action::Finish(9),
            Action::Start(6),
            Action::Finish(6),
            Action::Start(3),
            Action::Start(2),
            Action::Finish(2),
            Action::Finish(3),
        ];

        // Run in a blocking thread to avoid competing for workers
        let ctx_clone = ctx.clone();
        tokio::task::spawn_blocking(move || {
            let ctx = ctx_clone;
            let mut scheduled = 0;
            let mut started = 0;
            let mut finished = 0;
            for action in actions {
                println!("{:?}", action);
                match action {
                    Action::Schedule(task, cpu) => {
                        runner.schedule(&ctx, (*task, *cpu), *task);
                        scheduled += 1;
                    }
                    Action::ScheduleStart(task, cpu) => {
                        runner.schedule(&ctx, (*task, *cpu), *task);
                        ctx.task_barriers[*task as usize].0.wait();
                        scheduled += 1;
                        started += 1;
                    }
                    Action::StartFinish(task) => {
                        ctx.task_barriers[*task as usize].0.wait();
                        started += 1;
                        ctx.task_barriers[*task as usize].1.wait();
                        finished += 1;
                    }
                    Action::Start(task) => {
                        ctx.task_barriers[*task as usize].0.wait();
                        started += 1;
                    }
                    Action::Finish(task) => {
                        ctx.task_barriers[*task as usize].1.wait();
                        finished += 1;
                    }
                }
            }

            assert_eq!(scheduled, NUM_TASKS);
            assert_eq!(started, NUM_TASKS);
            assert_eq!(finished, NUM_TASKS);
        })
        .await
        .unwrap();

        println!("Waiting for completion...");
        while ctx.completion_order.lock().len() < NUM_TASKS {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    /// Directly exercise `Queue` ordering: items pop highest priority first, and in FIFO order
    /// within a priority.
    #[test]
    fn queues_pop_in_priority_then_fifo_order() {
        let q: Queue<u32, &str> = Queue::new();
        assert!(q.is_empty());

        // Push out of priority order, mixing the default priority and several others. Every item
        // has its own key, so nothing is replaced.
        for (priority, task) in [
            (0, "low-a"),
            (3, "p3"),
            (9, "p9-a"),
            (0, "low-b"),
            (7, "p7"),
            (5, "p5"),
            (9, "p9-b"),
        ] {
            assert!(q.push(priority, task).is_none());
        }

        assert!(!q.is_empty());

        let mut out = Vec::new();
        while let Some((_, task)) = q.pop() {
            out.push(task);
        }
        assert_eq!(out, ["p9-a", "p9-b", "p7", "p5", "p3", "low-a", "low-b"]);
        assert!(q.is_empty());
        // Only the default priority's queue is left.
        assert_eq!(q.queue_count(), 1);
        assert_eq!(q.current.load().priority, 0);
    }

    /// `current` always is the highest priority queue in the map, also when a higher priority is
    /// pushed while lower ones are still queued, and drained queues are removed again, except for
    /// the last one.
    #[test]
    fn test_current_tracks_highest_priority() {
        let q: Queue<u32, u32> = Queue::new();
        let current = || q.current.load().priority;
        assert_eq!(current(), 0);
        assert_eq!(q.queue_count(), 1);

        assert!(q.push(3, 1).is_none());
        assert_eq!(current(), 3);
        assert!(q.push(1, 2).is_none());
        assert_eq!(
            current(),
            3,
            "a lower priority doesn't replace the current one"
        );
        assert!(q.push(5, 3).is_none());
        assert_eq!(current(), 5);
        assert_eq!(q.queue_count(), 4);

        assert_eq!(q.pop(), Some((5, 3)));
        // The drained queue is only retired by the next pop.
        assert_eq!(q.pop(), Some((3, 1)));
        assert_eq!(current(), 3);
        assert_eq!(q.pop(), Some((1, 2)));
        assert_eq!(current(), 1);
        assert_eq!(q.pop(), None);
        assert_eq!(current(), 0);
        assert_eq!(q.queue_count(), 1);
        assert_eq!(q.pop(), None);
        assert_eq!(q.queue_count(), 1);
    }

    /// The last remaining queue is kept, open and published, even when it is empty, so pushing
    /// its priority keeps using it.
    #[test]
    fn test_last_queue_is_kept_when_empty() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(5, 1).is_none());
        assert_eq!(q.pop(), Some((5, 1)));
        assert_eq!(q.pop(), None);
        assert_eq!(q.queue_count(), 1);
        let kept = q.current.load_full();
        assert_eq!(kept.priority, 0);
        assert!(!kept.keys.is_closed());

        assert!(q.push(0, 2).is_none());
        assert!(Arc::ptr_eq(&q.current.load_full(), &kept));
        assert_eq!(q.pop(), Some((0, 2)));
        assert_eq!(q.pop(), None);
        assert!(Arc::ptr_eq(&q.current.load_full(), &kept));
        assert!(!kept.keys.is_closed());
    }

    /// The kept last queue doesn't have to be the default priority's queue: the default queue is
    /// retired like any other once a lower priority is the only one with work left.
    #[test]
    fn test_last_queue_can_be_below_default_priority() {
        let q: Queue<i32, u32> = Queue::new();
        assert!(q.push(-1, 1).is_none());
        assert_eq!(q.current.load().priority, 0);
        assert_eq!(q.pop(), Some((-1, 1)));
        assert_eq!(q.queue_count(), 1);
        let kept = q.current.load_full();
        assert_eq!(kept.priority, -1);
        assert_eq!(q.pop(), None);
        assert!(Arc::ptr_eq(&q.current.load_full(), &kept));
        assert!(!kept.keys.is_closed());

        // Its priority is pushed lock-free into the kept queue.
        assert_eq!(q.try_push_current(&-1, 2), Ok(()));
        assert_eq!(kept.keys.len(), 1);
    }

    /// Runs `f` on another thread while this thread holds the `queues` lock, and asserts that it
    /// finishes without the lock.
    fn assert_lock_free(runner: &TestRunner<u32>, f: impl FnOnce() + Send + 'static) {
        let queues_guard = runner.queue.queues.lock();
        let (sender, receiver) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            f();
            sender.send(()).unwrap();
        });
        let result = receiver.recv_timeout(Duration::from_secs(1));
        drop(queues_guard);
        thread.join().unwrap();
        assert_eq!(result, Ok(()), "must not take the queues lock");
    }

    /// Pushing and popping items with the `current` priority doesn't take the `queues` lock, both
    /// for a non-default current priority and for the kept, empty default priority queue.
    #[test]
    fn test_current_priority_push_and_pop_are_lock_free() {
        let (runner, executed) = queueing_runner::<u32>();
        // Make priority 5 the current one (this push takes the lock, as it creates the queue).
        runner.schedule(&executed, 100, 5);
        assert_lock_free(&runner, {
            let runner = runner.clone();
            let executed = executed.clone();
            move || {
                for task in 1..=3 {
                    runner.schedule(&executed, task, 5);
                }
                for _ in 0..4 {
                    assert!(runner.pop_future_from_worker(&executed).is_some());
                }
            }
        });
        assert_eq!(drain(&runner, &executed), vec![100, 1, 2, 3]);

        // Only the empty default priority queue is left now; pushing it stays lock-free.
        assert_eq!(runner.queue.queue_count(), 1);
        assert_lock_free(&runner, {
            let runner = runner.clone();
            let executed = executed.clone();
            move || {
                for task in 10..20 {
                    runner.schedule(&executed, task, 0);
                }
                for _ in 10..20 {
                    assert!(runner.pop_future_from_worker(&executed).is_some());
                }
            }
        });
        assert_eq!(drain(&runner, &executed), (10..20).collect::<Vec<_>>());
    }

    /// A lock-free push that lands in the `current` queue right before a pop closes it to retire
    /// it keeps its priority: the queue is replaced by a new queue for the same priority instead
    /// of being removed, so the item still runs before all lower priorities.
    #[test]
    fn test_retire_keeps_keys_pushed_before_close() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(0, 1).is_none());
        assert!(q.push(5, 2).is_none());
        assert_eq!(q.pop(), Some((5, 2)));

        // A pop found the priority 5 queue empty and is about to retire it; a lock-free push
        // (`try_push_current`) lands in it before it is closed.
        let mut queues = q.queues.lock();
        let old = q.current.load_full();
        assert_eq!(old.priority, 5);
        assert!(q.push(5, 3).is_none());
        assert_eq!(
            old.keys.len(),
            1,
            "the push went to the current queue lock-free"
        );
        q.retire_current(&mut queues, &old);
        drop(queues);

        assert!(old.keys.is_closed());
        let current = q.current.load_full();
        assert!(
            !Arc::ptr_eq(&current, &old),
            "the closed queue was replaced"
        );
        assert_eq!(current.priority, 5);
        assert!(!current.keys.is_closed());
        assert_eq!(q.queue_count(), 2);

        // Pushes to the replaced queue's priority go to the new queue.
        assert!(q.push(5, 4).is_none());
        assert_eq!(old.keys.len(), 0);
        assert_eq!(q.pop(), Some((5, 3)));
        assert_eq!(q.pop(), Some((5, 4)));
        assert_eq!(q.pop(), Some((0, 1)));
        assert_eq!(q.pop(), None);
        assert_eq!(q.queue_count(), 1);
    }

    /// A push that finds the `current` queue closed (a pop is retiring it) retries under the lock
    /// and ends up in the map's queue for its priority, so it isn't lost in the closed queue.
    #[test]
    fn test_push_to_closed_current_queue_retries_under_lock() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(0, 1).is_none());
        assert!(q.push(5, 2).is_none());
        assert_eq!(q.pop(), Some((5, 2)));

        // A pop is retiring the priority 5 queue: it closed it while holding the lock.
        let mut queues = q.queues.lock();
        let old = q.current.load_full();
        old.keys.close();
        // A lock-free push now fails, so the push has to wait for the lock.
        assert_eq!(q.try_push_current(&5, 3), Err(3));
        // Finish retiring it, like `pop_locked` would.
        q.retire_current(&mut queues, &old);
        drop(queues);
        // Once the push gets the lock, its key goes to the map's queue for its priority.
        assert!(q.push(5, 3).is_none());

        assert_eq!(old.keys.len(), 0);
        assert!(!Arc::ptr_eq(&q.current.load_full(), &old));
        assert_eq!(q.current.load().priority, 5);
        assert_eq!(q.pop(), Some((5, 3)));
        assert_eq!(q.pop(), Some((0, 1)));
        assert_eq!(q.pop(), None);
    }

    /// A popper that loaded a `current` queue that was retired since (a stale, closed handle)
    /// falls back to the lock and still finds the remaining work in the map, in priority order.
    #[test]
    fn test_pop_with_stale_current_queue_finds_remaining_work() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(5, 1).is_none());
        let stale = q.current.load_full();
        assert_eq!(q.pop(), Some((5, 1)));
        assert_eq!(q.pop(), None);
        assert!(stale.keys.is_closed());
        assert!(q.push(3, 2).is_none());
        assert!(q.push(5, 3).is_none());
        assert!(q.push(0, 4).is_none());
        assert!(!Arc::ptr_eq(&q.current.load_full(), &stale));
        // The slow path doesn't look at the stale queue the caller had.
        assert_eq!(q.pop_locked(), Some((5, 3)));
        assert_eq!(q.pop(), Some((3, 2)));
        assert_eq!(q.pop(), Some((0, 4)));
        assert_eq!(q.pop(), None);
    }

    /// Tombstones of claimed items are skipped by pops in every queue, and a queue that only had
    /// tombstones left is retired like an empty one.
    #[test]
    fn test_tombstones_in_priority_queues() {
        let (runner, executed) = queueing_runner::<u32>();
        for _ in 0..3 {
            runner.schedule(&executed, 1, 10);
            runner.schedule(&executed, 2, 2);
            runner.schedule(&executed, 3, 0);
            assert_eq!(runner.queue.queue_count(), 3);

            assert!(runner.claim(&executed, &1).is_some());
            assert!(runner.claim(&executed, &2).is_some());
            assert!(
                !runner.queue.is_empty(),
                "tombstones are still queue entries"
            );
            executed.lock().clear();

            // Popping skips both tombstones, retires their queues, and takes the default
            // priority item.
            assert!(runner.pop_future_from_worker(&executed).is_some());
            assert_eq!(*executed.lock(), vec![3]);
            executed.lock().clear();
            assert!(runner.queue.is_empty());
            assert_eq!(runner.queue.queue_count(), 1);
            assert!(runner.pop_future_from_worker(&executed).is_none());
        }
    }

    /// Producers and consumers race on few, constantly changing priorities, so queues are created,
    /// pushed lock-free, closed and retired concurrently all the time. Every item must be popped
    /// exactly once, and all queues except the last one must be gone afterwards.
    #[test]
    fn test_concurrent_priority_churn_pops_every_item_once() {
        const PRODUCERS: u32 = 4;
        const CONSUMERS: usize = 4;
        const ITEMS: u32 = 20_000;
        let q: Arc<Queue<u32, u32>> = Arc::new(Queue::new());
        let done = Arc::new(AtomicUsize::new(0));
        let barrier = Arc::new(Barrier::new(PRODUCERS as usize + CONSUMERS));
        let producers: Vec<_> = (0..PRODUCERS)
            .map(|producer| {
                let q = q.clone();
                let done = done.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    for i in 0..ITEMS {
                        let task = producer * ITEMS + i;
                        // Bursts of the same priority, so most pushes hit the current queue.
                        let priority = (i / 16) % 4;
                        assert!(q.push(priority, task).is_none());
                    }
                    done.fetch_add(1, Ordering::Release);
                })
            })
            .collect();
        let consumers: Vec<_> = (0..CONSUMERS)
            .map(|_| {
                let q = q.clone();
                let done = done.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    let mut popped = Vec::new();
                    loop {
                        let finished = done.load(Ordering::Acquire) == PRODUCERS as usize;
                        match q.pop() {
                            Some((priority, task)) => {
                                assert_eq!(priority, ((task % ITEMS) / 16) % 4);
                                popped.push(task);
                            }
                            None if finished => break,
                            None => std::thread::yield_now(),
                        }
                    }
                    popped
                })
            })
            .collect();
        for producer in producers {
            producer.join().unwrap();
        }
        let mut popped: Vec<u32> = consumers
            .into_iter()
            .flat_map(|consumer| consumer.join().unwrap())
            .collect();
        popped.sort_unstable();
        assert_eq!(popped, (0..PRODUCERS * ITEMS).collect::<Vec<_>>());
        assert!(q.is_empty());
        assert!(q.claimable.is_empty());
        assert_eq!(q.pop(), None);
        assert_eq!(q.queue_count(), 1);
        assert!(!q.current.load().keys.is_closed());
    }
    /// Claims find items in all priority queues, and claiming leaves the order of the remaining
    /// items intact.
    #[test]
    fn test_claim_from_all_priority_queues() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 0, 0);
        runner.schedule(&executed, 1, 0);
        runner.schedule(&executed, 2, 3);
        runner.schedule(&executed, 3, 5);
        runner.schedule(&executed, 4, 10);

        assert!(runner.claim(&executed, &0).is_some());
        assert!(runner.claim(&executed, &3).is_some());
        assert_eq!(*executed.lock(), vec![0, 3]);
        executed.lock().clear();

        assert_eq!(drain(&runner, &executed), vec![4, 2, 1]);
    }

    /// Queueing a key again with another priority replaces the queued item too: only the latest
    /// one is executed, at its own priority, and its claim index entry survives the stale entry of
    /// the replaced one.
    #[test]
    fn test_push_same_key_overrides_across_priorities() {
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        // Default priority first, then the same key with a higher priority.
        runner.schedule(&executed, (1, false), 0);
        runner.schedule(&executed, (1, true), 10);
        assert_eq!(take_discarded(&runner), vec![(1, false)]);
        assert!(runner.claim(&executed, &1).is_some());
        assert_eq!(*executed.lock(), vec![(1, true)]);
        executed.lock().clear();
        assert!(runner.claim(&executed, &1).is_none());
        assert!(drain(&runner, &executed).is_empty());

        // And the other way around: higher priority first, then the latest item with the default
        // priority.
        runner.schedule(&executed, (2, false), 10);
        runner.schedule(&executed, (2, true), 0);
        assert_eq!(take_discarded(&runner), vec![(2, false)]);
        assert_eq!(drain(&runner, &executed), vec![(2, true)]);

        // The stale entry is skipped and must not remove the index entry of the latest item.
        runner.schedule(&executed, (3, false), 10);
        runner.schedule(&executed, (3, true), 0);
        assert!(runner.claim(&executed, &3).is_some());
        assert_eq!(*executed.lock(), vec![(3, true)]);
        executed.lock().clear();
        assert!(runner.queue.claimable.is_empty());
        assert!(drain(&runner, &executed).is_empty());
        assert!(runner.queue.is_empty());
    }

    /// A key queued again with the default priority after a higher priority push: the replaced
    /// item's stale entry must not take the latest item (the priorities don't match), so the
    /// latest item keeps its FIFO position in the default priority queue.
    #[test]
    fn test_stale_entry_in_other_priority_does_not_take_newer_item() {
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        runner.schedule(&executed, (1, false), 10);
        runner.schedule(&executed, (5, false), 0);
        runner.schedule(&executed, (1, true), 0);
        assert_eq!(take_discarded(&runner), vec![(1, false)]);
        assert_eq!(drain(&runner, &executed), vec![(5, false), (1, true)]);
        assert!(runner.queue.claimable.is_empty());
        assert!(runner.queue.is_empty());
    }

    /// Claiming leaves a tombstone in a higher priority queue; queueing the same key again with
    /// the default priority must not let that tombstone take the new item ahead of other default
    /// priority items.
    #[test]
    fn test_claim_then_requeue_with_other_priority() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 1, 10);
        assert!(runner.claim(&executed, &1).is_some());
        executed.lock().clear();
        runner.schedule(&executed, 2, 0);
        runner.schedule(&executed, 1, 0);
        assert_eq!(drain(&runner, &executed), vec![2, 1]);
        assert_eq!(runner.queue.queue_count(), 1);
    }

    /// Claiming and queueing the same key again at the same priority: the stale entry may take the
    /// new item early (equal priority, so only the FIFO position changes), but it still runs
    /// exactly once.
    #[test]
    fn test_claim_then_requeue_same_priority() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 1, 0);
        assert!(runner.claim(&executed, &1).is_some());
        executed.lock().clear();
        runner.schedule(&executed, 2, 0);
        runner.schedule(&executed, 1, 0);
        let mut drained = drain(&runner, &executed);
        drained.sort();
        assert_eq!(drained, vec![1, 2]);
        assert!(runner.queue.claimable.is_empty());
        assert!(runner.queue.is_empty());
    }

    /// Producers push items sharing a few keys concurrently with poppers and claimers, across
    /// several priorities. A newer item replaces a still-queued older one with the same key, so
    /// every item is either executed or discarded, exactly once, and the last item queued for
    /// each key is executed (nothing can replace it). Nothing may be left behind.
    #[test]
    fn test_concurrent_same_key_producers_override() {
        use std::sync::atomic::{AtomicBool, AtomicU32};

        const PRODUCERS: u32 = 4;
        const PER_PRODUCER: u32 = 5_000;
        /// Keys per producer. Each key is only pushed by one producer, so "the last item queued for
        /// a key" is well defined.
        const KEYS_PER_PRODUCER: u32 = 4;
        const KEYS: u32 = PRODUCERS * KEYS_PER_PRODUCER;
        const ITEMS: u32 = PRODUCERS * PER_PRODUCER;

        /// An item identified by a unique id, queued under a shared key.
        struct Item {
            id: u32,
            key: u32,
        }
        impl Claimable for Item {
            type Key = u32;

            fn claim_key(&self) -> u32 {
                self.key
            }
        }

        struct CountingExecutor {
            discards: Vec<AtomicU32>,
        }
        impl Executor<Vec<AtomicU32>, Item, u32> for CountingExecutor {
            type Future = std::future::Ready<()>;

            fn execute(
                &self,
                counts: &Arc<Vec<AtomicU32>>,
                item: Item,
                _priority: u32,
            ) -> Self::Future {
                counts[item.id as usize].fetch_add(1, Ordering::Relaxed);
                std::future::ready(())
            }

            fn discard(&self, _counts: &Arc<Vec<AtomicU32>>, item: Item, _priority: u32) {
                self.discards[item.id as usize].fetch_add(1, Ordering::Relaxed);
            }
        }

        let runner: Arc<PriorityRunner<Vec<AtomicU32>, Item, u32, CountingExecutor>> =
            Arc::new(PriorityRunner::with_target_workers(
                CountingExecutor {
                    discards: (0..ITEMS).map(|_| AtomicU32::new(0)).collect(),
                },
                0,
            ));
        let counts: Arc<Vec<AtomicU32>> = Arc::new((0..ITEMS).map(|_| AtomicU32::new(0)).collect());
        let producers_done = AtomicU32::new(0);
        let stop = AtomicBool::new(false);

        std::thread::scope(|scope| {
            for _ in 0..2 {
                scope.spawn(|| {
                    loop {
                        let finished = producers_done.load(Ordering::Acquire) == PRODUCERS;
                        if runner.pop_future_from_worker(&counts).is_none() && finished {
                            break;
                        }
                    }
                });
            }
            scope.spawn(|| {
                let mut key = 0;
                while !stop.load(Ordering::Acquire) {
                    let _ = runner.claim(&counts, &key);
                    key = (key + 1) % KEYS;
                }
            });
            for producer in 0..PRODUCERS {
                let runner = &runner;
                let counts = &counts;
                let producers_done = &producers_done;
                scope.spawn(move || {
                    for i in 0..PER_PRODUCER {
                        let id = producer * PER_PRODUCER + i;
                        let key = producer * KEYS_PER_PRODUCER + i % KEYS_PER_PRODUCER;
                        let priority = match id % 3 {
                            0 => 0,
                            1 => 10,
                            _ => 1 + id % 5,
                        };
                        runner.schedule(counts, Item { id, key }, priority);
                    }
                    producers_done.fetch_add(1, Ordering::AcqRel);
                });
            }
            // Stop the claimer once all producers are done; the poppers drain the rest.
            while producers_done.load(Ordering::Acquire) < PRODUCERS {
                std::hint::spin_loop();
            }
            stop.store(true, Ordering::Release);
        });

        assert!(runner.pop_future_from_worker(&counts).is_none());
        assert!(runner.queue.claimable.is_empty());
        assert!(runner.queue.is_empty());
        assert_eq!(runner.queue.queue_count(), 1);
        for (id, count) in counts.iter().enumerate() {
            let executed = count.load(Ordering::Relaxed);
            let discarded = runner.executor.discards[id].load(Ordering::Relaxed);
            let id = id as u32;
            assert_eq!(
                executed + discarded,
                1,
                "item {id}: executed {executed}, discarded {discarded}"
            );
            // The last `KEYS_PER_PRODUCER` items of a producer are the last ones for their key.
            if id % PER_PRODUCER >= PER_PRODUCER - KEYS_PER_PRODUCER {
                assert_eq!(executed, 1, "last item {id} of its key must be executed");
            }
        }
    }

    /// Claimers race popping workers over the same items, with several priorities. Every item must
    /// be executed exactly once: either by exactly one successful claim or by exactly one pop.
    #[test]
    fn test_claim_concurrent_with_pop_exactly_once() {
        use std::sync::atomic::{AtomicBool, AtomicU32};

        const ITEMS: u32 = 20_000;
        const POPPERS: usize = 4;
        const CLAIMERS: usize = 4;

        struct CountingExecutor;
        impl Executor<Vec<AtomicU32>, u32, u32> for CountingExecutor {
            type Future = std::future::Ready<()>;

            fn execute(
                &self,
                counts: &Arc<Vec<AtomicU32>>,
                task: u32,
                _priority: u32,
            ) -> Self::Future {
                counts[task as usize].fetch_add(1, Ordering::Relaxed);
                std::future::ready(())
            }
        }

        let runner: Arc<PriorityRunner<Vec<AtomicU32>, u32, u32, CountingExecutor>> =
            Arc::new(PriorityRunner::with_target_workers(CountingExecutor, 0));
        let counts: Arc<Vec<AtomicU32>> = Arc::new((0..ITEMS).map(|_| AtomicU32::new(0)).collect());
        let done_scheduling = AtomicBool::new(false);
        let published = AtomicU32::new(0);

        std::thread::scope(|scope| {
            for _ in 0..POPPERS {
                scope.spawn(|| {
                    loop {
                        let finished = done_scheduling.load(Ordering::Acquire);
                        if runner.pop_future_from_worker(&counts).is_none() && finished {
                            break;
                        }
                    }
                });
            }
            for claimer in 0..CLAIMERS {
                let runner = &runner;
                let counts = &counts;
                let published = &published;
                scope.spawn(move || {
                    for task in (claimer as u32..ITEMS).step_by(CLAIMERS) {
                        // Only try keys that are already queued, so this races poppers instead
                        // of probing items before their producer reached them.
                        while published.load(Ordering::Acquire) <= task {
                            std::hint::spin_loop();
                        }
                        let _ = runner.claim(counts, &task);
                    }
                });
            }
            for task in 0..ITEMS {
                let priority = match task % 3 {
                    0 => 0,
                    1 => 10,
                    _ => 1 + task % 7,
                };
                runner.schedule(&counts, task, priority);
                published.store(task + 1, Ordering::Release);
            }
            done_scheduling.store(true, Ordering::Release);
        });

        // Nothing left behind, and every item ran exactly once.
        assert!(runner.pop_future_from_worker(&counts).is_none());
        assert!(runner.queue.claimable.is_empty());
        for (task, count) in counts.iter().enumerate() {
            assert_eq!(
                count.load(Ordering::Relaxed),
                1,
                "task {task} execution count"
            );
        }
    }

    /// A multi-thread runtime for the stress tests, with the I/O driver disabled (nothing here
    /// needs I/O).
    ///
    /// On `wasm32-wasip1-threads`, these stress tests can stop polling newly spawned tasks when
    /// the I/O driver is enabled, even plain `tokio::spawn`s, so they would time out for reasons
    /// unrelated to the runner. Enabling only the timer avoids this.
    fn stress_runtime(worker_threads: usize) -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(worker_threads)
            .enable_time()
            .build()
            .unwrap()
    }

    /// Liveness stress test for the schedule/retire race: saturate the worker pool and rapidly
    /// schedule a large fan-out of short tasks from *within* executing tasks (so `schedule` runs
    /// while the pool is saturated and workers are constantly hitting the `Done` → pop → retire
    /// path), mixing the default and several other priorities. Asserts every scheduled task
    /// eventually runs — a stranded task (the hazard the acquire/release ordering on
    /// `active_workers` guards against) would leave the count short and hang, caught by the
    /// outer timeout.
    #[test]
    fn stress_no_task_is_stranded() {
        // A fresh tokio runtime per iteration; loop to shake interleavings. Each iteration spawns a
        // wide fan-out tree of tiny tasks and waits for all of them under a timeout.
        for iteration in 0..50 {
            let rt = stress_runtime(4);
            rt.block_on(async {
                tokio::time::timeout(Duration::from_secs(20), stress_iteration(iteration))
                    .await
                    .unwrap_or_else(|_| panic!("iteration {iteration} timed out — task stranded"));
            });
        }
    }

    type StressRunner = Arc<PriorityRunner<StressCtx, StressTask, u32, StressExecutor>>;

    /// A node of the stress fan-out tree. Every task has its own key, so no task replaces another.
    struct StressTask {
        id: u32,
        depth: u32,
    }

    impl Claimable for StressTask {
        type Key = u32;

        fn claim_key(&self) -> u32 {
            self.id
        }
    }

    struct StressCtx {
        runner: Mutex<Option<StressRunner>>,
        /// Source of unique task ids.
        next_id: std::sync::atomic::AtomicU32,
        /// Total number of tasks that have run so far (roots + all fanned-out children).
        completed: std::sync::atomic::AtomicUsize,
        /// Total number of tasks scheduled so far. Stays >= `completed`; they are equal exactly
        /// when the whole tree has drained. Incremented before each `schedule`.
        scheduled: std::sync::atomic::AtomicUsize,
    }

    #[derive(Clone, Copy)]
    struct StressExecutor;

    impl Executor<StressCtx, StressTask, u32> for StressExecutor {
        type Future = Pin<Box<dyn Future<Output = ()> + Send>>;

        fn execute(
            &self,
            ctx: &Arc<StressCtx>,
            StressTask { depth, .. }: StressTask,
            _priority: u32,
        ) -> Self::Future {
            let ctx = ctx.clone();
            Box::pin(async move {
                // Fan out two children for a few levels, then stop. This keeps scheduling tasks
                // while the pool is saturated and workers churn through the retire path.
                if depth > 0 {
                    let runner = ctx.runner.lock().clone().unwrap();
                    for child in 0..2u32 {
                        // Count the child as scheduled BEFORE scheduling it, so `scheduled` is
                        // never observed lower than the true outstanding work.
                        ctx.scheduled
                            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
                        // Spread children across the default and several other priorities to
                        // exercise lock-free and locked pushes.
                        let priority = match (depth + child) % 3 {
                            0 => 0,
                            1 => 10,
                            _ => depth,
                        };
                        let id = ctx
                            .next_id
                            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                        runner.schedule(
                            &ctx,
                            StressTask {
                                id,
                                depth: depth - 1,
                            },
                            priority,
                        );
                    }
                }
                // Occasionally yield so the worker suspends/resumes (exercises the Pending path
                // too).
                if depth.is_multiple_of(2) {
                    tokio::task::yield_now().await;
                }
                ctx.completed
                    .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
            })
        }
    }

    async fn stress_iteration(_iteration: u32) {
        use std::sync::atomic::Ordering;
        const ROOTS: usize = 64;
        const DEPTH: u32 = 6;
        // Each task fans out to 2 children for DEPTH levels: a full binary tree of 2^(DEPTH+1)-1
        // nodes per root.
        let per_root = (1usize << (DEPTH + 1)) - 1;
        let total = ROOTS * per_root;

        let ctx = Arc::new(StressCtx {
            runner: Mutex::new(None),
            next_id: std::sync::atomic::AtomicU32::new(ROOTS as u32),
            completed: std::sync::atomic::AtomicUsize::new(0),
            scheduled: std::sync::atomic::AtomicUsize::new(ROOTS),
        });
        let runner = Arc::new(PriorityRunner::new(StressExecutor));
        *ctx.runner.lock() = Some(runner.clone());

        for i in 0..ROOTS {
            let priority = match i % 3 {
                0 => 0,
                1 => 10,
                _ => DEPTH,
            };
            let task = StressTask {
                id: i as u32,
                depth: DEPTH,
            };
            runner.schedule(&ctx, task, priority);
        }

        // Poll until every task has run. If any task is stranded (the hazard), `completed` never
        // reaches `total` and the outer timeout fails the test.
        while ctx.completed.load(Ordering::Acquire) < total {
            tokio::time::sleep(Duration::from_millis(2)).await;
        }
        assert_eq!(ctx.scheduled.load(Ordering::Acquire), total);
        assert_eq!(ctx.completed.load(Ordering::Acquire), total);

        // Drop the self-reference so the runner Arc can be released.
        *ctx.runner.lock() = None;
    }

    /// Targeted regression test for the schedule/retire strand race on the *enqueue* path.
    ///
    /// The hazard the removed `is_empty()` fast path had: a scheduler observes the queue non-empty
    /// and pushes without any `active_workers` operation, while the last active worker runs its
    /// final `queue.pop()`, sees nothing it has yet to drain, and retires — stranding the
    /// pushed task with no live worker.
    ///
    /// To hit that window reliably we schedule from an *external* thread (not from inside a
    /// worker), two tasks back-to-back per round, then wait for the pool to fully drain before
    /// the next round. Each round therefore races a fresh `schedule` against a pool that is
    /// constantly retiring its last worker. A single stranded task leaves `completed` short
    /// forever and the outer timeout fails the test.
    #[test]
    fn stress_external_schedule_against_retiring_pool() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Ctx {
            completed: AtomicUsize,
        }

        struct Exec;
        impl Executor<Ctx, u32, u32> for Exec {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;
            fn execute(&self, ctx: &Arc<Ctx>, _task: u32, _priority: u32) -> Self::Future {
                let ctx = ctx.clone();
                Box::pin(async move {
                    // Tiny amount of work so workers churn through the retire path quickly.
                    ctx.completed.fetch_add(1, Ordering::AcqRel);
                })
            }
        }

        let rt = stress_runtime(4);

        rt.block_on(async {
            tokio::time::timeout(Duration::from_secs(20), async {
                const ROUNDS: usize = 5_000;
                let ctx = Arc::new(Ctx {
                    completed: AtomicUsize::new(0),
                });
                let runner = Arc::new(PriorityRunner::new(Exec));

                let mut expected = 0;
                for round in 0..ROUNDS {
                    // Two tasks (with their own keys) so at least one is likely to take the
                    // enqueue (non-spawn) path while the other occupies a worker. Mix priorities
                    // across rounds to exercise lock-free and locked pushes.
                    let (p0, p1) = match round % 3 {
                        0 => (0, 10),
                        1 => (10, 5),
                        _ => (3, 0),
                    };
                    let task = 2 * round as u32;
                    runner.schedule(&ctx, task, p0);
                    runner.schedule(&ctx, task + 1, p1);
                    expected += 2;

                    // Wait for the pool to fully drain before the next round, so the next
                    // `schedule` races a retiring pool.
                    while ctx.completed.load(Ordering::Acquire) < expected {
                        tokio::task::yield_now().await;
                    }
                }
                assert_eq!(ctx.completed.load(Ordering::Acquire), expected);
            })
            .await
            .expect("timed out — a scheduled task was stranded with no live worker");
        });
    }

    /// Targeted regression test for the *saturated path* of `schedule` (push, `SeqCst` fence,
    /// `load`).
    ///
    /// With a single worker thread and `target_workers == 1`, every task scheduled while the sole
    /// worker is busy takes the saturated branch, and every schedule races the sole worker's
    /// retirement (`fetch_sub`, `SeqCst` fence, re-check). This maximally exercises the case where
    /// the worker's fence comes *before* the scheduler's: the scheduler must then observe the count
    /// drop below target and rescue the pushed task via `spawn_worker_if_work_available`. A single
    /// stranded task leaves `completed` short and the outer timeout fails the test.
    ///
    /// The default priority rounds keep every push and pop lock-free (it is the only queue), so
    /// the liveness edge is carried purely by the fences and `active_workers`, not incidentally by
    /// the queue mutex.
    #[test]
    fn stress_saturated_schedule_vs_retiring_worker() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Ctx {
            completed: AtomicUsize,
        }

        struct Exec;
        impl Executor<Ctx, u32, u32> for Exec {
            type Future = Pin<Box<dyn Future<Output = ()> + Send>>;
            fn execute(&self, ctx: &Arc<Ctx>, _task: u32, _priority: u32) -> Self::Future {
                let ctx = ctx.clone();
                Box::pin(async move {
                    ctx.completed.fetch_add(1, Ordering::AcqRel);
                })
            }
        }

        // A single worker thread forces `target_workers == 1`, so a saturated push always races the
        // one worker retiring.
        let rt = stress_runtime(1);

        rt.block_on(async {
            tokio::time::timeout(Duration::from_secs(20), async {
                const ROUNDS: usize = 10_000;
                let ctx = Arc::new(Ctx {
                    completed: AtomicUsize::new(0),
                });
                let runner = Arc::new(PriorityRunner::new(Exec));

                let mut expected = 0;
                for round in 0..ROUNDS {
                    // Alternate: default priority rounds isolate the lock-free edge; other rounds
                    // create a higher priority queue under the lock. Every task has its own key.
                    let priority = match round % 2 {
                        0 => 0,
                        _ => 10,
                    };
                    runner.schedule(&ctx, round as u32, priority);
                    expected += 1;

                    // Drain fully before the next round so the next `schedule` races a retiring
                    // pool.
                    while ctx.completed.load(Ordering::Acquire) < expected {
                        tokio::task::yield_now().await;
                    }
                }
                assert_eq!(ctx.completed.load(Ordering::Acquire), expected);
            })
            .await
            .expect("timed out — a task was stranded on the saturated schedule path");
        });
    }
}
