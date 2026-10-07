use std::{
    collections::BinaryHeap,
    fmt::Debug,
    future::Future,
    hash::{BuildHasherDefault, Hash},
    pin::Pin,
    ptr::drop_in_place,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    task::{Context, Poll},
    time::{Duration, Instant},
};

use dashmap::DashMap;
use parking_lot::Mutex;
use pin_project_lite::pin_project;
use rustc_hash::{FxHashMap, FxHasher};

use crate::experiment_lock_stats as lock_stats;

pub trait Executor<C, T, P>: Send + Sync {
    type Future: Future<Output = ()> + Send;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: P) -> Self::Future;
}

/// A queued item that can be claimed by key before a worker starts executing it.
///
/// Claiming is how a reader takes over work it is about to wait for: instead of parking until some
/// worker gets around to the queued item, the reader removes it from the queue (see
/// [`PriorityRunner::claim`]) and drives it itself.
pub trait Claimable {
    type Key: Eq + Hash + Copy + Debug + Send + Sync;

    /// The key this item can be claimed by, or `None` when it must not be claimable.
    ///
    /// When multiple queued items share a key, only the most recently queued one is claimable; the
    /// others stay in the queue and are executed by workers as usual.
    fn claim_key(&self) -> Option<Self::Key>;
}

impl<C, T, P, F, Fut> Executor<C, T, P> for F
where
    F: Fn(&Arc<C>, T, P) -> Fut + Send + Sync,
    Fut: Future<Output = ()> + Send,
{
    type Future = Fut;

    fn execute(&self, execute_context: &Arc<C>, task: T, priority: P) -> Self::Future {
        (self)(execute_context, task, priority)
    }
}

struct HeapItem<P> {
    priority: P,
    /// Index into [`Queue::slots`]. The slot holds the queued item, or `None` when it was claimed
    /// (see [`Queue::claim`]).
    slot: usize,
}

impl<P: Eq> PartialEq for HeapItem<P> {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority
    }
}

impl<P: Eq> Eq for HeapItem<P> {}

impl<P: Ord> Ord for HeapItem<P> {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority.cmp(&other.priority)
    }
}

impl<P: Ord> PartialOrd for HeapItem<P> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// The queue of items that are not scheduled yet.
///
/// Items are ordered by priority in a [`BinaryHeap`], but they are stored out-of-line in `slots` so
/// that a single item can be removed by key without disturbing the heap (a binary heap has no
/// keyed removal). Claiming an item takes the value out of its slot and leaves the heap entry
/// behind as a tombstone, which is skipped (and its slot recycled) when a worker pops it.
struct Queue<P, T: Claimable> {
    heap: BinaryHeap<HeapItem<P>>,
    /// The queued items with their priority. A slot is `Some` while the item is queued, `None` if
    /// it was claimed. The slot itself is only recycled once its (tombstone) heap entry has
    /// been popped, so a slot index is never reused while it is still referenced by the heap.
    ///
    /// The priority is stored here as well as in the heap entry because [`Queue::claim`] finds an
    /// item by key and never touches the heap, so unlike [`Queue::pop`] it has no heap entry to
    /// read it from — and [`Executor::execute`] needs the priority.
    ///
    /// EXPERIMENT (local slot): the `u64` is the item's schedule sequence number, see
    /// [`PriorityRunner::latest`].
    slots: Vec<Option<(P, T, u64)>>,
    /// Recycled indices into `slots`.
    free_slots: Vec<usize>,
    /// Slot index of the claimable item for each key.
    claimable: FxHashMap<T::Key, usize>,
    /// How many items were ever pushed. Diagnostics only, see [`PriorityRunner::total_queued`].
    #[cfg(feature = "inline_execution_stats")]
    pushes: u64,
    /// EXPERIMENT (not for merge): number of live (not claimed, not popped) items. Unlike
    /// `heap.len()` this excludes tombstones of claimed items.
    live: usize,
}

impl<P: Clone + Ord, T: Claimable> Queue<P, T> {
    fn new() -> Self {
        Self {
            heap: BinaryHeap::new(),
            slots: Vec::new(),
            free_slots: Vec::new(),
            claimable: FxHashMap::default(),
            #[cfg(feature = "inline_execution_stats")]
            pushes: 0,
            live: 0,
        }
    }

    /// Whether there is any heap entry left. This can be `true` while all remaining entries are
    /// tombstones of claimed items; popping is what cleans those up.
    fn is_empty(&self) -> bool {
        self.heap.is_empty()
    }

    /// Pushes an item. `seq` is its schedule sequence number.
    ///
    /// With `newest_by_seq == false` (local slot off) the most recently *pushed* item with a key is
    /// the claimable one, as before. With `newest_by_seq == true` (local slot on) an item that was
    /// parked locally and is flushed late must not hide a newer item with the same key, so the
    /// claimable mapping keeps pointing at the item with the highest `seq`.
    fn push(&mut self, priority: P, task: T, seq: u64, newest_by_seq: bool) {
        #[cfg(feature = "inline_execution_stats")]
        {
            self.pushes += 1;
        }
        let key = task.claim_key();
        let heap_priority = priority.clone();
        let slot = if let Some(slot) = self.free_slots.pop() {
            self.slots[slot] = Some((priority, task, seq));
            slot
        } else {
            self.slots.push(Some((priority, task, seq)));
            self.slots.len() - 1
        };
        if let Some(key) = key {
            // If this key is already queued, the older item stops being claimable. It stays in the
            // queue and is executed by a worker as usual.
            let keep_existing = newest_by_seq
                && self.claimable.get(&key).is_some_and(|&existing| {
                    self.slots[existing]
                        .as_ref()
                        .is_some_and(|(_, _, existing_seq)| *existing_seq > seq)
                });
            if !keep_existing {
                self.claimable.insert(key, slot);
            }
        }
        self.heap.push(HeapItem {
            priority: heap_priority,
            slot,
        });
        self.live += 1;
    }

    /// Pops the highest priority item, skipping tombstones of claimed items.
    fn pop(&mut self) -> Option<(P, T, u64)> {
        while let Some(HeapItem { slot, .. }) = self.heap.pop() {
            let entry = self.slots[slot].take();
            self.free_slots.push(slot);
            if let Some((priority, task, seq)) = entry {
                self.live -= 1;
                if let Some(key) = task.claim_key() {
                    // Only remove the mapping when it still points at this item. A newer item with
                    // the same key must stay claimable.
                    if self.claimable.get(&key) == Some(&slot) {
                        self.claimable.remove(&key);
                    }
                }
                self.shrink_amortized();
                return Some((priority, task, seq));
            }
        }
        self.shrink_amortized();
        None
    }

    /// Removes the queued item with the given key, if it is still queued and claimable and its
    /// sequence number is accepted by `accept_seq`. A rejected item stays queued (and keeps its
    /// claimable mapping), so a worker still executes it.
    fn claim(&mut self, key: &T::Key, accept_seq: impl FnOnce(u64) -> bool) -> Option<(P, T)> {
        let slot = *self.claimable.get(key)?;
        let seq = self.slots.get(slot)?.as_ref()?.2;
        if !accept_seq(seq) {
            return None;
        }
        self.claimable.remove(key);
        // The slot is intentionally not recycled here: its heap entry is still around as a
        // tombstone and must not start pointing at a different item.
        let claimed = self.slots.get_mut(slot).and_then(|slot| slot.take());
        if claimed.is_some() {
            self.live -= 1;
        }
        claimed.map(|(priority, task, _)| (priority, task))
    }

    /// Amortized shrinking of the queue, but with a lower threshold to avoid
    /// frequent reallocations when the queue is small.
    fn shrink_amortized(&mut self) {
        if self.heap.capacity() > self.heap.len() * 3 && self.heap.capacity() > 128 {
            let new_capacity = self.heap.len().next_power_of_two().max(128);
            self.heap.shrink_to(new_capacity);
        }
        if self.heap.is_empty() && self.claimable.is_empty() && self.slots.capacity() > 128 {
            // Nothing references any slot anymore.
            self.slots.clear();
            self.slots.shrink_to(128);
            self.free_slots.clear();
            self.free_slots.shrink_to(128);
        }
    }
}

pub struct PriorityRunner<
    C: Send + Sync + 'static,
    T: Claimable + Send + 'static,
    P: Clone + Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> {
    executor: E,
    /// The target number of workers to spawn.
    target_workers: usize,
    /// The queue of tasks to execute. These tasks are not scheduled yet.
    queue: Mutex<Queue<P, T>>,
    /// The number of active workers currently polling tasks.
    /// Workers that responded with Poll::Pending are not counted until they are polled again.
    active_workers: AtomicUsize,
    /// EXPERIMENT (local slot): monotonically increasing schedule sequence number.
    next_seq: AtomicU64,
    /// EXPERIMENT (local slot): the sequence number of the newest scheduled item per claim key,
    /// while it is still queued (locally or in the shared queue). Only maintained while the local
    /// slot is enabled. Exactly the item with this sequence number is claimable; consuming it
    /// (claim or pop) removes the entry, so older items with the same key never become claimable.
    latest: DashMap<T::Key, u64, BuildHasherDefault<FxHasher>>,
    /// EXPERIMENT (local slot): advisory copy of the shared queue's live item count (excluding
    /// tombstones), written under the queue lock and read without it by adaptive parking.
    live_hint: AtomicUsize,
    phantom: std::marker::PhantomData<C>,
}

impl<
    C: Send + Sync + 'static,
    T: Claimable + Send + 'static,
    P: Clone + Debug + Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> PriorityRunner<C, T, P, E>
{
    pub fn new(executor: E) -> Self {
        let target_workers = tokio::runtime::Handle::current().metrics().num_workers();
        lock_stats::ensure_dumper();
        lock_stats::TARGET_WORKERS.store(target_workers, Ordering::Relaxed);
        Self::with_target_workers(executor, target_workers)
    }

    fn with_target_workers(executor: E, target_workers: usize) -> Self {
        Self {
            executor,
            target_workers,
            queue: Mutex::new(Queue::new()),
            active_workers: AtomicUsize::new(0),
            next_seq: AtomicU64::new(0),
            latest: DashMap::default(),
            live_hint: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    /// How many tasks were ever put into the queue, as opposed to being executed without ever being
    /// queued. Diagnostics only — it lets a test assert that a task never took the detour through
    /// the queue.
    #[cfg(feature = "inline_execution_stats")]
    pub fn total_queued(&self) -> u64 {
        self.queue.lock().pushes
    }

    fn record_gauges(&self, queue: &Queue<P, T>) {
        // EXPERIMENT (local slot): keep the advisory live hint current. Written under the queue
        // lock; adaptive parking reads it without the lock.
        self.live_hint.store(queue.live, Ordering::Relaxed);
        if *lock_stats::ENABLED {
            lock_stats::record_queue_len(queue.heap.len(), queue.live);
            lock_stats::ACTIVE_WORKERS.store(
                self.active_workers.load(Ordering::Relaxed),
                Ordering::Relaxed,
            );
        }
    }

    /// EXPERIMENT (local slot): forgets `key`'s newest-item entry if it still refers to `seq`.
    fn consumed(&self, key: Option<T::Key>, seq: u64) {
        if let Some(key) = key {
            self.latest.remove_if(&key, |_, latest| *latest == seq);
        }
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: P) {
        // EXPERIMENT (local slot): see [`local_slot`]. With the slot off this is exactly the
        // previous behavior (`schedule_to_queue` with push-order newest-wins).
        let mode = local_slot::mode();
        // The schedule sequence number is allocated and published while holding the key's
        // `latest` entry (a DashMap shard lock), so that for each key, a higher sequence number
        // is always published later. Otherwise a schedule that allocated first but published
        // last would overwrite a newer entry with an older one. No other lock is taken while
        // holding the entry. With the slot off, or for unkeyed tasks, the sequence number is
        // unused (0).
        let seq = match task.claim_key() {
            Some(key) if mode != local_slot::Mode::Off => {
                let entry = self.latest.entry(key);
                let seq = self.next_seq.fetch_add(1, Ordering::Relaxed);
                #[cfg(test)]
                tests::run_after_seq_alloc_hook();
                entry.insert(seq);
                seq
            }
            _ => 0,
        };
        if let Err((task, priority)) =
            local_slot::try_put(self, execute_context, task, priority, seq, mode)
        {
            self.schedule_to_queue(execute_context, task, priority, seq);
        }
    }

    fn schedule_to_queue(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        task: T,
        priority: P,
        seq: u64,
    ) {
        let newest_by_seq = local_slot::mode() != local_slot::Mode::Off;
        let mut queue = lock_stats::lock(&self.queue, lock_stats::Site::Schedule);
        if !queue.is_empty() {
            // If there is already work in the queue, we don't have any
            // free capacity so we can just push the task to the queue.
            // It will be picked up by existing workers.
            //
            // A worker only stops when it finds the queue empty, so a non-empty queue always has a
            // worker that will drain it. [`claim`](Self::claim) does take work out of the queue
            // without being a worker, but that only ever makes the queue shorter.
            queue.push(priority, task, seq, newest_by_seq);
            self.record_gauges(&queue);
            if *lock_stats::ENABLED {
                lock_stats::PUSHES.fetch_add(1, Ordering::Relaxed);
            }
            return;
        }
        // The queue is empty, so we might have free capacity to spawn a new worker.
        let active_workers = self.active_workers.fetch_add(1, Ordering::Relaxed);
        if active_workers < self.target_workers {
            // We have free capacity, spawn a new worker to execute this task immediately.
            self.record_gauges(&queue);
            if *lock_stats::ENABLED {
                lock_stats::SPAWNS_DIRECT.fetch_add(1, Ordering::Relaxed);
            }
            drop(queue);
            // The task is executed directly, so it is no longer claimable.
            if newest_by_seq {
                self.consumed(task.claim_key(), seq);
            }

            let future = self.executor.execute(execute_context, task, priority);
            WorkerFuture::spawn(future, execute_context.clone(), self.clone());
        } else {
            // No free capacity, push the task to the queue.
            queue.push(priority, task, seq, newest_by_seq);
            self.record_gauges(&queue);
            if *lock_stats::ENABLED {
                lock_stats::PUSHES.fetch_add(1, Ordering::Relaxed);
            }
            drop(queue);

            // Undo the added active worker since we didn't spawn a new worker.
            self.decrease_active_workers(execute_context);
        }
    }

    /// Takes the queued task with the given key out of the queue and returns its execution future,
    /// or `None` when there is no such task in the queue (it was never scheduled, a worker already
    /// picked it up, or it was claimed before).
    ///
    /// The caller takes over the responsibility to drive the returned future to completion; the
    /// task left the queue, so no worker will do it.
    pub fn claim(&self, execute_context: &Arc<C>, key: &T::Key) -> Option<E::Future> {
        let (priority, task) = if local_slot::mode() == local_slot::Mode::Off {
            self.claim_from_queue(key, |_| true)?
        } else {
            // EXPERIMENT (local slot): only the newest scheduled item for `key` is claimable,
            // wherever it is stored. It is looked up locally first (no shared queue mutex; only a
            // short DashMap shard read here and a compare-and-remove below), then in the shared
            // queue.
            let latest = *self.latest.get(key)?;
            let claimed = match local_slot::try_take::<C, T, P, E>(self, key, latest) {
                Some(claimed) => claimed,
                None => self.claim_from_queue(key, |seq| seq == latest)?,
            };
            self.consumed(Some(*key), latest);
            claimed
        };
        Some(self.executor.execute(execute_context, task, priority))
    }

    fn claim_from_queue(
        &self,
        key: &T::Key,
        accept_seq: impl FnOnce(u64) -> bool,
    ) -> Option<(P, T)> {
        let mut queue = lock_stats::lock(&self.queue, lock_stats::Site::Claim);
        let claimed = queue.claim(key, accept_seq);
        self.record_gauges(&queue);
        if *lock_stats::ENABLED {
            if claimed.is_some() {
                lock_stats::CLAIM_HIT.fetch_add(1, Ordering::Relaxed);
            } else {
                lock_stats::CLAIM_MISS.fetch_add(1, Ordering::Relaxed);
            }
        }
        claimed
    }

    /// Tries to decrease the active worker count by 1.
    /// If there is work available in the queue, a new worker is spawned instead.
    fn reuse_or_decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        let active_workers = self.active_workers.load(Ordering::Relaxed) - 1;
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
    fn decrease_active_workers(self: &Arc<Self>, execute_context: &Arc<C>) {
        // If the active workers became lower we might have free
        // capacity now, so we try to spawn a new worker if
        // there is work available.
        let active_workers = self.active_workers.fetch_sub(1, Ordering::Relaxed) - 1;
        if active_workers < self.target_workers {
            self.spawn_worker_if_work_available(execute_context, false);
        }
    }

    fn locked_pop(&self, site: lock_stats::Site) -> Option<(P, T)> {
        let mut queue = lock_stats::lock(&self.queue, site);
        let popped = queue.pop();
        self.record_gauges(&queue);
        if *lock_stats::ENABLED {
            if popped.is_some() {
                lock_stats::POP_HIT.fetch_add(1, Ordering::Relaxed);
            } else {
                lock_stats::POP_EMPTY.fetch_add(1, Ordering::Relaxed);
            }
        }
        drop(queue);
        let (priority, task, seq) = popped?;
        if local_slot::mode() != local_slot::Mode::Off {
            self.consumed(task.claim_key(), seq);
        }
        Some((priority, task))
    }

    fn pop_future_from_worker(&self, execute_context: &Arc<C>) -> Option<E::Future> {
        let popped = self.locked_pop(lock_stats::Site::PopFromWorker);
        popped.map(|(priority, task)| self.executor.execute(execute_context, task, priority))
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        unused_active_count: bool,
    ) -> bool {
        let popped = self.locked_pop(lock_stats::Site::SpawnIfAvailable);
        if let Some((priority, task)) = popped {
            let new_future = self.executor.execute(execute_context, task, priority);

            if !unused_active_count {
                self.active_workers.fetch_add(1, Ordering::Relaxed);
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
        T: 'static,
        P: Clone,
        P: Ord,
        P: Send,
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
    T: Claimable + Send + 'static,
    P: Clone + Debug + Ord + Send + 'static,
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
    T: Claimable + Send + 'static,
    P: Clone + Debug + Ord + Send + 'static,
    E: Executor<C, T, P> + 'static,
> Future for WorkerFuture<C, T, P, E>
{
    type Output = ();

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut this = self.project();
        if matches!(this.state, WorkerState::PendingFuture) {
            // When the worker is not active (it previously returned Poll::Pending),
            // we need to mark it as active again since it is being polled now.
            this.runner.active_workers.fetch_add(1, Ordering::Relaxed);
            *this.state = WorkerState::UnfinishedFuture;
        }
        let last_yield = Instant::now();
        loop {
            match this.state {
                WorkerState::Closed => return Poll::Ready(()),
                WorkerState::PendingFuture => unreachable!(),
                WorkerState::UnfinishedFuture => {
                    let poll = {
                        let _slot_scope = local_slot::WorkerPollScope::enter();
                        this.future.as_mut().poll(cx)
                        // `_slot_scope` drop flushes a task left in the local slot
                    };
                    match poll {
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
                    let active_workers = this.runner.active_workers.load(Ordering::Relaxed);
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

/// EXPERIMENT (not for merge): a per-thread "deferred schedule" buffer ("local slot"), see
/// `turbopack/crates/turbo-tasks/EXPERIMENT_LOCAL_SLOT.md`.
///
/// Most scheduled tasks are read right after being scheduled by the task that scheduled them, and
/// that read claims the task back out of the shared queue to execute it inline. That costs two
/// acquisitions of the shared queue lock per task. Instead, while a worker poll is active on this
/// thread, scheduled tasks are parked in a thread-local buffer (up to a capacity). A claim for a
/// parked key takes it from the buffer without taking the shared queue mutex (it only touches the
/// key's sharded `latest` entry). Whatever is still parked is pushed to the
/// shared queue (via the regular scheduling path) when the worker poll ends, or before a blocking
/// wait ([`flush`]), so a parked task is not stranded.
///
/// Modes (`TURBO_TASKS_EXPERIMENT_LOCAL_SLOT`): unset/`0` = off (default, never parks), `1` or
/// `always` = park whenever possible, `adaptive` = park only while the shared queue has live items
/// (an advisory hint), so that idle workers can pick up work immediately when the queue is empty.
///
/// Claim-by-key semantics: only the newest scheduled item for a key is claimable, wherever it is
/// stored (see [`PriorityRunner::latest`]).
pub(crate) mod local_slot {
    use std::{
        any::Any,
        cell::{Cell, RefCell},
        sync::{Arc, LazyLock, atomic::Ordering},
    };

    use super::{Claimable, Executor, PriorityRunner};
    use crate::experiment_lock_stats as lock_stats;

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum Mode {
        Off,
        Always,
        Adaptive,
    }

    fn parse_mode(value: Option<&str>) -> Mode {
        match value {
            None | Some("") | Some("0") => Mode::Off,
            Some("1") | Some("always") => Mode::Always,
            Some("adaptive") => Mode::Adaptive,
            Some(other) => {
                eprintln!(
                    "TURBO_TASKS_EXPERIMENT_LOCAL_SLOT: unknown value {other:?}, using off \
                     (expected 0, 1, always or adaptive)"
                );
                Mode::Off
            }
        }
    }

    static ENV_MODE: LazyLock<Mode> = LazyLock::new(|| {
        parse_mode(
            std::env::var("TURBO_TASKS_EXPERIMENT_LOCAL_SLOT")
                .ok()
                .as_deref(),
        )
    });

    /// Max number of parked tasks per thread (`TURBO_TASKS_EXPERIMENT_LOCAL_SLOT_CAP`, default 16).
    static ENV_CAPACITY: LazyLock<usize> = LazyLock::new(|| {
        std::env::var("TURBO_TASKS_EXPERIMENT_LOCAL_SLOT_CAP")
            .ok()
            .and_then(|v| v.parse().ok())
            .filter(|&cap| cap >= 1)
            .unwrap_or(16)
    });

    thread_local! {
        static IN_WORKER_POLL: Cell<bool> = const { Cell::new(false) };
        static SLOT: RefCell<Vec<Box<dyn SlotEntry>>> = const { RefCell::new(Vec::new()) };
    }

    #[cfg(test)]
    thread_local! {
        static TEST_OVERRIDE: Cell<Option<(Mode, usize)>> = const { Cell::new(None) };
    }

    /// Test-only: overrides mode and capacity for the current thread (`None` restores the env).
    #[cfg(test)]
    pub(super) fn set_test_override(value: Option<(Mode, usize)>) {
        TEST_OVERRIDE.set(value);
    }

    pub fn mode() -> Mode {
        #[cfg(test)]
        if let Some((mode, _)) = TEST_OVERRIDE.get() {
            return mode;
        }
        *ENV_MODE
    }

    fn capacity() -> usize {
        #[cfg(test)]
        if let Some((_, capacity)) = TEST_OVERRIDE.get() {
            return capacity;
        }
        *ENV_CAPACITY
    }

    trait SlotEntry {
        fn runner_id(&self) -> usize;
        fn flush(self: Box<Self>);
        fn into_any(self: Box<Self>) -> Box<dyn Any>;
        fn as_any(&self) -> &dyn Any;
    }

    struct Entry<C, T, P, E>
    where
        C: Send + Sync + 'static,
        T: Claimable + Send + 'static,
        P: Clone + std::fmt::Debug + Ord + Send + 'static,
        E: Executor<C, T, P> + 'static,
    {
        runner: Arc<PriorityRunner<C, T, P, E>>,
        execute_context: Arc<C>,
        task: T,
        priority: P,
        seq: u64,
    }

    impl<C, T, P, E> SlotEntry for Entry<C, T, P, E>
    where
        C: Send + Sync + 'static,
        T: Claimable + Send + 'static,
        P: Clone + std::fmt::Debug + Ord + Send + 'static,
        E: Executor<C, T, P> + 'static,
    {
        fn runner_id(&self) -> usize {
            Arc::as_ptr(&self.runner) as *const () as usize
        }

        fn flush(self: Box<Self>) {
            let Entry {
                runner,
                execute_context,
                task,
                priority,
                seq,
            } = *self;
            runner.schedule_to_queue(&execute_context, task, priority, seq);
        }

        fn into_any(self: Box<Self>) -> Box<dyn Any> {
            self
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    /// Parks the task if the mode allows it, a worker poll is active, the task is claimable and
    /// the buffer has room. Otherwise hands the task back.
    pub(super) fn try_put<C, T, P, E>(
        runner: &Arc<PriorityRunner<C, T, P, E>>,
        execute_context: &Arc<C>,
        task: T,
        priority: P,
        seq: u64,
        mode: Mode,
    ) -> Result<(), (T, P)>
    where
        C: Send + Sync + 'static,
        T: Claimable + Send + 'static,
        P: Clone + std::fmt::Debug + Ord + Send + 'static,
        E: Executor<C, T, P> + 'static,
    {
        if mode == Mode::Off || !IN_WORKER_POLL.get() || task.claim_key().is_none() {
            return Err((task, priority));
        }
        if mode == Mode::Adaptive && runner.live_hint.load(Ordering::Relaxed) == 0 {
            // The shared queue (probably) has no live items, so idle workers could start this
            // task right away. Don't hide it.
            lock_stats::count(&lock_stats::SLOT_ADAPTIVE_SKIP);
            return Err((task, priority));
        }
        let capacity = capacity();
        SLOT.with_borrow_mut(|slot| {
            if slot.len() >= capacity {
                return Err((task, priority));
            }
            slot.push(Box::new(Entry {
                runner: runner.clone(),
                execute_context: execute_context.clone(),
                task,
                priority,
                seq,
            }));
            lock_stats::count(&lock_stats::SLOT_PUT);
            Ok(())
        })
    }

    /// Takes the parked task of `runner` with `key` and sequence number `seq`, if any.
    pub(super) fn try_take<C, T, P, E>(
        runner: &PriorityRunner<C, T, P, E>,
        key: &T::Key,
        seq: u64,
    ) -> Option<(P, T)>
    where
        C: Send + Sync + 'static,
        T: Claimable + Send + 'static,
        P: Clone + std::fmt::Debug + Ord + Send + 'static,
        E: Executor<C, T, P> + 'static,
    {
        let runner_id = runner as *const PriorityRunner<C, T, P, E> as *const () as usize;
        let found = SLOT.with_borrow_mut(|slot| {
            if slot.is_empty() {
                return None;
            }
            let index = slot.iter().position(|entry| {
                entry.runner_id() == runner_id
                    && entry
                        .as_any()
                        .downcast_ref::<Entry<C, T, P, E>>()
                        .is_some_and(|e| e.seq == seq && e.task.claim_key().as_ref() == Some(key))
            });
            match index {
                Some(index) => Some(slot.remove(index)),
                None => {
                    lock_stats::count(&lock_stats::SLOT_MISS);
                    None
                }
            }
        })?;
        lock_stats::count(&lock_stats::SLOT_HIT);
        let entry: Box<Entry<C, T, P, E>> = found
            .into_any()
            .downcast()
            .unwrap_or_else(|_| unreachable!("slot entry type mismatch"));
        let Entry { task, priority, .. } = *entry;
        Some((priority, task))
    }

    /// Test-only: number of tasks parked on this thread.
    #[cfg(test)]
    pub(super) fn parked_len() -> usize {
        SLOT.with_borrow(|slot| slot.len())
    }

    pub enum FlushReason {
        PollEnd,
        Blocking,
    }

    /// Pushes all parked tasks (if any) to their runner's shared queue, oldest first.
    pub fn flush(reason: FlushReason) {
        let entries = SLOT.with_borrow_mut(std::mem::take);
        for entry in entries {
            lock_stats::count(match reason {
                FlushReason::PollEnd => &lock_stats::SLOT_FLUSH_POLL_END,
                FlushReason::Blocking => &lock_stats::SLOT_FLUSH_BLOCKING,
            });
            entry.flush();
        }
    }

    /// Marks a worker poll as active on this thread; flushes the slot when the outermost scope
    /// ends (including on unwind).
    pub(super) struct WorkerPollScope {
        prev: bool,
    }

    impl WorkerPollScope {
        pub fn enter() -> Self {
            Self {
                prev: IN_WORKER_POLL.replace(true),
            }
        }
    }

    impl Drop for WorkerPollScope {
        fn drop(&mut self) {
            IN_WORKER_POLL.set(self.prev);
            if !self.prev {
                flush(FlushReason::PollEnd);
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

    impl Claimable for u32 {
        type Key = u32;

        fn claim_key(&self) -> Option<u32> {
            Some(*self)
        }
    }

    impl Claimable for (u32, bool) {
        type Key = u32;

        fn claim_key(&self) -> Option<u32> {
            Some(self.0)
        }
    }

    /// An item that is never claimable, to check that `None` keys are queued and executed as usual.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    struct Unkeyed(u32);

    impl Claimable for Unkeyed {
        type Key = u32;

        fn claim_key(&self) -> Option<u32> {
            None
        }
    }

    /// An executor that records which items it was asked to execute, in order, and whose futures
    /// complete immediately. Lets the queue be driven without a tokio runtime.
    struct RecordingExecutor;

    impl<T: Claimable + Copy + Send + Sync + Debug + 'static> Executor<Mutex<Vec<T>>, T, u32>
        for RecordingExecutor
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
    }

    /// The recorded executions of a test runner, in execution order.
    type Executions<T> = Arc<Mutex<Vec<T>>>;
    /// A test runner over items of type `T`.
    type TestRunner<T> = Arc<PriorityRunner<Mutex<Vec<T>>, T, u32, RecordingExecutor>>;

    /// A runner that queues every scheduled item (`target_workers == 0`, so no worker is ever
    /// spawned) and therefore needs no tokio runtime. `pop_future_from_worker` stands in for what a
    /// worker would do.
    fn queueing_runner<T: Claimable + Copy + Send + Sync + Debug + 'static>()
    -> (TestRunner<T>, Executions<T>) {
        (
            Arc::new(PriorityRunner::with_target_workers(RecordingExecutor, 0)),
            Arc::new(Mutex::new(Vec::new())),
        )
    }

    /// EXPERIMENT (not for merge): `live` excludes tombstones of claimed items, while
    /// `heap.len()` includes them.
    #[test]
    fn experiment_live_count_excludes_tombstones() {
        let mut q: Queue<u32, (u32, bool)> = Queue::new();
        q.push(1, (1, false), 0, false);
        q.push(2, (2, false), 1, false);
        q.push(3, (2, true), 2, false); // same key: (2, false) stops being claimable but stays live
        assert_eq!((q.heap.len(), q.live), (3, 3));
        // claim the newest key-2 item -> tombstone stays in the heap
        assert_eq!(q.claim(&2, |_| true).map(|(_, t)| t), Some((2, true)));
        assert_eq!((q.heap.len(), q.live), (3, 2));
        // a second claim for the same key fails and changes nothing
        assert!(q.claim(&2, |_| true).is_none());
        assert_eq!((q.heap.len(), q.live), (3, 2));
        // popping skips the tombstone (decrementing only heap.len) and returns live items
        assert_eq!(q.pop().map(|(_, t, _)| t), Some((2, false)));
        assert_eq!(q.live, 1);
        assert_eq!(q.pop().map(|(_, t, _)| t), Some((1, false)));
        assert_eq!((q.heap.len(), q.live), (0, 0));
        assert!(q.pop().is_none());
        assert_eq!(q.live, 0);

        // unkeyed items are never claimable and are counted until popped
        let mut u: Queue<u32, Unkeyed> = Queue::new();
        u.push(1, Unkeyed(1), 0, false);
        assert!(u.claim(&1, |_| true).is_none());
        assert_eq!(u.live, 1);
        assert!(u.pop().is_some());
        assert_eq!((u.heap.len(), u.live), (0, 0));
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

    #[test]
    fn test_duplicate_keys() {
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        // Both items share the claim key `1`.
        runner.schedule(&executed, (1, false), 1);
        runner.schedule(&executed, (1, true), 2);

        // The most recently queued item is the claimable one.
        assert!(runner.claim(&executed, &1).is_some());
        assert_eq!(*executed.lock(), vec![(1, true)]);
        executed.lock().clear();
        // The other one is not claimable anymore, but it is not lost either.
        assert!(runner.claim(&executed, &1).is_none());
        assert_eq!(drain(&runner, &executed), vec![(1, false)]);
    }

    // EXPERIMENT (not for merge): local slot tests. They enable the slot for the current test
    // thread only, via `local_slot::set_test_override`, and use `WorkerPollScope` to stand in for
    // an active worker poll.

    thread_local! {
        /// One-shot hook run by `PriorityRunner::schedule` right after it allocated the schedule
        /// sequence number, on this thread only.
        static AFTER_SEQ_ALLOC_HOOK: std::cell::RefCell<Option<Box<dyn FnOnce()>>> =
            const { std::cell::RefCell::new(None) };
    }

    pub(super) fn run_after_seq_alloc_hook() {
        if let Some(hook) = AFTER_SEQ_ALLOC_HOOK.with_borrow_mut(Option::take) {
            hook();
        }
    }

    /// Enables the local slot for this thread until dropped.
    struct SlotOverride;

    impl Drop for SlotOverride {
        fn drop(&mut self) {
            local_slot::set_test_override(None);
        }
    }

    fn slot_override(mode: local_slot::Mode, capacity: usize) -> SlotOverride {
        local_slot::set_test_override(Some((mode, capacity)));
        SlotOverride
    }

    fn live_in_queue<T: Claimable + Copy + Send + Sync + Debug + 'static>(
        runner: &TestRunner<T>,
    ) -> usize {
        runner.queue.lock().live
    }

    #[test]
    fn slot_dup_keys_local_newest_wins() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, (1, false), 1);
            runner.schedule(&executed, (1, true), 2);
            assert_eq!(local_slot::parked_len(), 2, "both are parked");

            assert!(runner.claim(&executed, &1).is_some());
            assert_eq!(*executed.lock(), vec![(1, true)], "the newest is claimed");
            executed.lock().clear();
            assert!(
                runner.claim(&executed, &1).is_none(),
                "the older one never becomes claimable"
            );
        }
        assert_eq!(local_slot::parked_len(), 0, "scope end flushes");
        assert!(runner.claim(&executed, &1).is_none());
        assert_eq!(
            drain(&runner, &executed),
            vec![(1, false)],
            "the older one is not lost"
        );
    }

    #[test]
    fn slot_dup_keys_older_local_newer_shared() {
        let _override = slot_override(local_slot::Mode::Always, 1);
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, (1, false), 1);
            // The buffer is full, so the newer item goes to the shared queue.
            runner.schedule(&executed, (1, true), 2);
            assert_eq!(local_slot::parked_len(), 1);
            assert_eq!(live_in_queue(&runner), 1);

            assert!(runner.claim(&executed, &1).is_some());
            assert_eq!(
                *executed.lock(),
                vec![(1, true)],
                "the newer (shared) one wins"
            );
            executed.lock().clear();
            assert!(runner.claim(&executed, &1).is_none());
        }
        assert!(
            runner.claim(&executed, &1).is_none(),
            "flushing the older one doesn't make it claimable"
        );
        assert_eq!(drain(&runner, &executed), vec![(1, false)]);
    }

    #[test]
    fn slot_dup_keys_older_shared_newer_local() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        // Outside of a worker poll: goes to the shared queue.
        runner.schedule(&executed, (1, false), 1);
        {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, (1, true), 2);
            assert_eq!(local_slot::parked_len(), 1);

            assert!(runner.claim(&executed, &1).is_some());
            assert_eq!(
                *executed.lock(),
                vec![(1, true)],
                "the newer (local) one wins"
            );
            executed.lock().clear();
            assert!(
                runner.claim(&executed, &1).is_none(),
                "the older (shared) one never becomes claimable"
            );
        }
        assert!(runner.claim(&executed, &1).is_none());
        assert_eq!(drain(&runner, &executed), vec![(1, false)]);
    }

    #[test]
    fn slot_newest_consumed_by_worker_no_resurrection() {
        let _override = slot_override(local_slot::Mode::Always, 1);

        // Older local, newer shared; a worker pops the newer one.
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, (1, false), 1);
            runner.schedule(&executed, (1, true), 2);
            assert!(runner.pop_future_from_worker(&executed).is_some());
            assert_eq!(*executed.lock(), vec![(1, true)]);
            executed.lock().clear();
            assert!(
                runner.claim(&executed, &1).is_none(),
                "the parked older one is not claimable after the newest was consumed"
            );
        }
        assert!(runner.claim(&executed, &1).is_none());
        assert_eq!(drain(&runner, &executed), vec![(1, false)]);

        // Older shared, newer local; the newer one is flushed and popped by a worker.
        let (runner, executed) = queueing_runner::<(u32, bool)>();
        runner.schedule(&executed, (1, false), 1);
        {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, (1, true), 2);
        }
        // Highest priority first: the newer one.
        assert!(runner.pop_future_from_worker(&executed).is_some());
        assert_eq!(*executed.lock(), vec![(1, true)]);
        executed.lock().clear();
        assert!(
            runner.claim(&executed, &1).is_none(),
            "the older shared one is not claimable after the newest was consumed"
        );
        assert_eq!(drain(&runner, &executed), vec![(1, false)]);
    }

    /// Two concurrent schedules of the same key: thread A allocates its sequence number first but
    /// is delayed before publishing it, while thread B schedules (and publishes) in between. The
    /// newest-item entry must still refer to an item that is actually claimable, and both items
    /// must execute exactly once.
    #[test]
    fn slot_dup_keys_concurrent_registration() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner, executed) = queueing_runner::<(u32, bool)>();

        let (paused_tx, paused_rx) = std::sync::mpsc::channel::<()>();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let thread_a = {
            let runner = runner.clone();
            let executed = executed.clone();
            std::thread::spawn(move || {
                let _override = slot_override(local_slot::Mode::Always, 16);
                AFTER_SEQ_ALLOC_HOOK.set(Some(Box::new(move || {
                    paused_tx.send(()).unwrap();
                    release_rx.recv().unwrap();
                })));
                // Outside of a worker poll: goes to the shared queue.
                runner.schedule(&executed, (1, false), 1);
            })
        };
        paused_rx.recv().unwrap();

        // While A is paused right after allocating its sequence number, inspect the key's
        // `latest` entry without blocking: if A holds the entry guard (allocation and publication
        // are serialized per key), B will have to wait for A. Otherwise B can schedule and
        // publish completely in between, which is the reordering this test is about.
        let a_holds_entry = matches!(
            runner.latest.try_get(&1),
            dashmap::try_result::TryResult::Locked
        );

        let (b_started_tx, b_started_rx) = std::sync::mpsc::channel::<()>();
        let (b_done_tx, b_done_rx) = std::sync::mpsc::channel::<()>();
        let thread_b = {
            let runner = runner.clone();
            let executed = executed.clone();
            std::thread::spawn(move || {
                let _override = slot_override(local_slot::Mode::Always, 16);
                b_started_tx.send(()).unwrap();
                runner.schedule(&executed, (1, true), 2);
                b_done_tx.send(()).unwrap();
            })
        };
        // Timeouts only bound hangs; they don't decide which interleaving is tested.
        b_started_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        if !a_holds_entry {
            // B can complete while A is paused; make sure it did before releasing A.
            b_done_rx.recv_timeout(Duration::from_secs(10)).unwrap();
        }
        release_tx.send(()).unwrap();
        thread_a.join().unwrap();
        thread_b.join().unwrap();

        assert_eq!(live_in_queue(&runner), 2);
        assert!(
            runner.claim(&executed, &1).is_some(),
            "the newest registered item must be claimable"
        );
        assert_eq!(
            *executed.lock(),
            vec![(1, true)],
            "B registered after A, so B's item is the newest"
        );
        executed.lock().clear();
        assert!(
            runner.claim(&executed, &1).is_none(),
            "only one item is claimable"
        );
        assert_eq!(
            drain(&runner, &executed),
            vec![(1, false)],
            "A's item still executes, exactly once"
        );
    }

    #[test]
    fn slot_runner_isolation() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner_a, executed_a) = queueing_runner::<u32>();
        let (runner_b, executed_b) = queueing_runner::<u32>();
        let _scope = local_slot::WorkerPollScope::enter();
        runner_a.schedule(&executed_a, 5, 1);
        assert!(
            runner_b.claim(&executed_b, &5).is_none(),
            "runner B can't take runner A's parked task"
        );
        runner_b.schedule(&executed_b, 5, 1);
        assert_eq!(local_slot::parked_len(), 2);
        assert!(runner_b.claim(&executed_b, &5).is_some());
        assert_eq!(*executed_b.lock(), vec![5]);
        assert!(executed_a.lock().is_empty(), "runner A's task is untouched");
        assert!(runner_a.claim(&executed_a, &5).is_some());
        assert_eq!(*executed_a.lock(), vec![5]);
        assert_eq!(local_slot::parked_len(), 0);
    }

    #[test]
    fn slot_flush_on_scope_end() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner, executed) = queueing_runner::<u32>();
        {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, 1, 1);
            runner.schedule(&executed, 2, 2);
            assert_eq!(local_slot::parked_len(), 2);
            assert_eq!(live_in_queue(&runner), 0);
            {
                // A nested scope doesn't flush when it ends.
                let _nested = local_slot::WorkerPollScope::enter();
            }
            assert_eq!(local_slot::parked_len(), 2);
        }
        assert_eq!(local_slot::parked_len(), 0);
        assert_eq!(live_in_queue(&runner), 2);
        assert_eq!(drain(&runner, &executed), vec![2, 1]);
    }

    #[test]
    fn slot_flush_on_unwind() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner, executed) = queueing_runner::<u32>();
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _scope = local_slot::WorkerPollScope::enter();
            runner.schedule(&executed, 3, 1);
            assert_eq!(local_slot::parked_len(), 1);
            panic!("unwind with a parked task");
        }));
        assert!(result.is_err());
        assert_eq!(local_slot::parked_len(), 0, "unwinding flushes");
        assert_eq!(drain(&runner, &executed), vec![3]);
    }

    #[test]
    fn slot_blocking_flush() {
        let _override = slot_override(local_slot::Mode::Always, 16);
        let (runner, executed) = queueing_runner::<u32>();
        let _scope = local_slot::WorkerPollScope::enter();
        runner.schedule(&executed, 7, 1);
        assert_eq!(local_slot::parked_len(), 1);
        crate::experiment_lock_stats::flush_local_slot();
        assert_eq!(local_slot::parked_len(), 0);
        assert_eq!(live_in_queue(&runner), 1);
        assert!(
            runner.claim(&executed, &7).is_some(),
            "a flushed task is still claimable via the shared queue"
        );
        assert_eq!(*executed.lock(), vec![7]);
    }

    #[test]
    fn slot_adaptive_parks_only_with_live_hint() {
        let _override = slot_override(local_slot::Mode::Adaptive, 16);
        let (runner, executed) = queueing_runner::<u32>();
        let _scope = local_slot::WorkerPollScope::enter();
        runner.schedule(&executed, 1, 1);
        assert_eq!(local_slot::parked_len(), 0, "empty queue: not parked");
        assert_eq!(live_in_queue(&runner), 1);
        runner.schedule(&executed, 2, 2);
        assert_eq!(local_slot::parked_len(), 1, "non-empty queue: parked");
        assert_eq!(live_in_queue(&runner), 1);
        // Drain the shared queue; the hint drops to zero again.
        assert!(runner.pop_future_from_worker(&executed).is_some());
        runner.schedule(&executed, 3, 3);
        assert_eq!(local_slot::parked_len(), 1, "queue empty again: not parked");
    }

    #[test]
    fn slot_off_never_parks() {
        let _override = slot_override(local_slot::Mode::Off, 16);
        let (runner, executed) = queueing_runner::<u32>();
        let _scope = local_slot::WorkerPollScope::enter();
        runner.schedule(&executed, 1, 1);
        runner.schedule(&executed, 2, 2);
        assert_eq!(local_slot::parked_len(), 0);
        assert_eq!(live_in_queue(&runner), 2);
        assert!(
            runner.latest.is_empty(),
            "the newest-item map is only maintained while the slot is on"
        );
    }

    #[test]
    fn test_unkeyed_entries_are_not_claimable() {
        let (runner, executed) = queueing_runner::<Unkeyed>();
        runner.schedule(&executed, Unkeyed(1), 1);
        runner.schedule(&executed, Unkeyed(2), 2);

        assert!(runner.claim(&executed, &1).is_none());
        assert_eq!(
            drain(&runner, &executed),
            vec![Unkeyed(2), Unkeyed(1)],
            "unkeyed items are queued and executed as usual"
        );
    }

    #[test]
    fn test_slots_are_recycled() {
        let (runner, executed) = queueing_runner::<u32>();
        for _ in 0..100 {
            for task in 0..8 {
                runner.schedule(&executed, task, task);
            }
            // Claim one of them each round, so tombstones are part of the cycle.
            assert!(runner.claim(&executed, &3).is_some());
            drain(&runner, &executed);
            let queue = runner.queue.lock();
            assert!(queue.is_empty());
            assert!(
                queue.slots.len() <= 8,
                "slots should be recycled, got {}",
                queue.slots.len()
            );
            assert!(
                queue.claimable.is_empty(),
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
}
