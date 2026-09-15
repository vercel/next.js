use std::{
    collections::BinaryHeap,
    fmt::Debug,
    future::Future,
    hash::{BuildHasher, Hash},
    pin::Pin,
    ptr::drop_in_place,
    sync::{
        Arc,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    task::{Context, Poll},
    time::{Duration, Instant},
};

use parking_lot::Mutex;
use pin_project_lite::pin_project;
use rustc_hash::{FxBuildHasher, FxHashMap};

/// An order-preserving projection of a priority into `u64`, used to publish a shard's top
/// priority in an atomic so that a pop can pick a shard without locking every one of them.
///
/// `a < b` must imply `a.priority_bits() < b.priority_bits()`, and the result must be less than
/// `u64::MAX`: the sharded queue stores `priority_bits + 1` so that `0` can mean "shard empty".
pub trait PriorityBits {
    fn priority_bits(&self) -> u64;
}

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
    slots: Vec<Option<(P, T)>>,
    /// Recycled indices into `slots`.
    free_slots: Vec<usize>,
    /// Slot index of the claimable item for each key.
    claimable: FxHashMap<T::Key, usize>,
    /// How many items were ever pushed. Diagnostics only, see [`PriorityRunner::total_queued`].
    #[cfg(feature = "inline_execution_stats")]
    pushes: u64,
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
        }
    }

    fn push(&mut self, priority: P, task: T, key: Option<T::Key>) {
        #[cfg(feature = "inline_execution_stats")]
        {
            self.pushes += 1;
        }
        let heap_priority = priority.clone();
        let slot = if let Some(slot) = self.free_slots.pop() {
            self.slots[slot] = Some((priority, task));
            slot
        } else {
            self.slots.push(Some((priority, task)));
            self.slots.len() - 1
        };
        if let Some(key) = key {
            // If this key is already queued, the older item stops being claimable. It stays in the
            // queue and is executed by a worker as usual.
            self.claimable.insert(key, slot);
        }
        self.heap.push(HeapItem {
            priority: heap_priority,
            slot,
        });
    }

    /// Pops the highest priority item, skipping tombstones of claimed items.
    fn pop(&mut self) -> Option<(P, T)> {
        while let Some(HeapItem { slot, .. }) = self.heap.pop() {
            let entry = self.slots[slot].take();
            self.free_slots.push(slot);
            if let Some((priority, task)) = entry {
                if let Some(key) = task.claim_key() {
                    // Only remove the mapping when it still points at this item. A newer item with
                    // the same key must stay claimable.
                    if self.claimable.get(&key) == Some(&slot) {
                        self.claimable.remove(&key);
                    }
                }
                self.shrink_amortized();
                return Some((priority, task));
            }
        }
        self.shrink_amortized();
        None
    }

    /// Removes the queued item with the given key, if it is still queued and claimable.
    fn claim(&mut self, key: &T::Key) -> Option<(P, T)> {
        let slot = self.claimable.remove(key)?;
        // The slot is intentionally not recycled here: its heap entry is still around as a
        // tombstone and must not start pointing at a different item.
        self.slots.get_mut(slot).and_then(|slot| slot.take())
    }

    /// Priority bits of the best heap entry. Call [`Queue::drop_leading_tombstones`] first: a
    /// tombstone still carries its claimed item's priority, so peeking past one reports a
    /// priority that no live item in this queue has.
    fn peek_bits(&self) -> Option<u64>
    where
        P: PriorityBits,
    {
        self.heap.peek().map(|item| item.priority.priority_bits())
    }

    /// Number of heap entries, including tombstones. `pop` consumes tombstones silently, so the
    /// sharded queue tracks its global count by the change in this value rather than by whether
    /// an item came back.
    fn heap_len(&self) -> usize {
        self.heap.len()
    }

    /// Retires tombstones sitting at the top of the heap, returning how many were removed.
    fn drop_leading_tombstones(&mut self) -> usize {
        let mut removed = 0;
        while let Some(HeapItem { slot, .. }) = self.heap.peek() {
            if self.slots[*slot].is_some() {
                break;
            }
            let slot = self.heap.pop().expect("just peeked").slot;
            self.free_slots.push(slot);
            removed += 1;
        }
        removed
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

/// Number of queue shards.
///
/// A pop scans every shard's cached top, so choosing a shard costs O(QUEUE_SHARDS) on every call.
/// That is why this is a small constant rather than something derived from
/// `available_parallelism` the way `compute_shard_amount` sizes its maps: widening it to the
/// machine would make the common path more expensive on exactly the wide machines sharding is
/// meant to help. 16 was chosen as a fixed value and has not been swept.
const QUEUE_SHARDS: usize = 16;

/// Stale hints tolerated on the fast path before [`ShardedQueue::pop`] takes the blocking path.
const MAX_POP_RESCANS: usize = 16;

/// Yields tolerated when the entry count and the cached tops disagree, before falling back to the
/// blocking path instead of continuing to spin.
const EMPTY_SCAN_YIELDS: usize = 4;

/// A shard's published top: `priority_bits + 1`, reserving `0` for "empty".
#[inline]
fn top_of(bits: u64) -> u64 {
    bits.checked_add(1)
        .expect("PriorityBits::priority_bits must be < u64::MAX; 0 is reserved for `empty`")
}

/// A [`Queue`] split into independently locked shards.
///
/// Invariants:
/// * a keyed item always lives in `hash(key) % QUEUE_SHARDS`, so `claim` is a direct lookup;
/// * `tops[i]` is `0` when shard `i` is known-empty, otherwise `top_of` a priority at least as good
///   as that shard's true best. It may be stale-HIGH (a claim leaves a tombstone carrying the
///   claimed priority; a popper may already have taken the item) and is never stale-low. Stale-high
///   is safe for liveness but NOT for ordering, which is why `pop` re-checks the shard under its
///   lock instead of trusting this value;
/// * `heap_entries` counts live heap entries across all shards, including tombstones, so that
///   `is_empty` matches the unsharded `heap.is_empty()`.
struct ShardedQueue<P, T: Claimable> {
    shards: Box<[Mutex<Queue<P, T>>]>,
    tops: Box<[AtomicU64]>,
    heap_entries: AtomicUsize,
    round_robin: AtomicUsize,
}

impl<P: Clone + Ord + PriorityBits, T: Claimable> ShardedQueue<P, T> {
    fn new() -> Self {
        Self {
            shards: (0..QUEUE_SHARDS)
                .map(|_| Mutex::new(Queue::new()))
                .collect(),
            tops: (0..QUEUE_SHARDS).map(|_| AtomicU64::new(0)).collect(),
            heap_entries: AtomicUsize::new(0),
            round_robin: AtomicUsize::new(0),
        }
    }

    fn shard_for_key(key: &T::Key) -> usize {
        (FxBuildHasher.hash_one(key) as usize) % QUEUE_SHARDS
    }

    fn is_empty(&self) -> bool {
        self.heap_entries.load(Ordering::Acquire) == 0
    }

    fn push(&self, priority: P, task: T) {
        // Computed once: the shard a keyed item lands in and the key `Queue::push` indexes it
        // under must agree, or `claim` would look in the wrong shard.
        let key = task.claim_key();
        let shard = match key {
            Some(key) => Self::shard_for_key(&key),
            None => self.round_robin.fetch_add(1, Ordering::Relaxed) % QUEUE_SHARDS,
        };
        let bits = top_of(priority.priority_bits());
        self.heap_entries.fetch_add(1, Ordering::AcqRel);
        // If the push unwinds, the count must not stay high forever: an over-count makes
        // `is_empty` permanently false and leaves workers looking for work that is not there.
        let counted = EntryCount(&self.heap_entries);
        self.shards[shard].lock().push(priority, task, key);
        std::mem::forget(counted);
        // Only ever raise the cached top: a stale-high value costs a re-check in `pop`, a
        // stale-low one would hide this item from it.
        self.tops[shard].fetch_max(bits, Ordering::AcqRel);
    }

    fn pop(&self) -> Option<(P, T)> {
        // The scan of `tops` is a hint, never a promise. Between the scan and the lock another
        // popper can take the item it named, and a claimed item leaves a tombstone that still
        // carries the claimed priority. Popping on the strength of the hint returns whatever the
        // shard happens to hold, which can be far below the maximum waiting in another shard, so
        // the shard is re-checked under its own lock before anything is taken from it.
        let mut rescans = 0usize;
        let mut empty_scans = 0usize;
        loop {
            if self.is_empty() {
                return None;
            }
            let mut best = 0u64;
            let mut best_shard = usize::MAX;
            for (i, top) in self.tops.iter().enumerate() {
                let v = top.load(Ordering::Acquire);
                if v > best {
                    best = v;
                    best_shard = i;
                }
            }
            if best_shard == usize::MAX {
                // `heap_entries` says there is work but no shard advertises any: a pusher is
                // between its counter increment and its top publish, or a popper between its top
                // store and its decrement. Yield briefly, then take the blocking path rather than
                // spinning -- an idle worker burning a core here starves the very thread that has
                // to run for the count to become true again.
                empty_scans += 1;
                if empty_scans > EMPTY_SCAN_YIELDS {
                    return self.pop_verified_under_all_locks();
                }
                std::thread::yield_now();
                if self.is_empty() {
                    return None;
                }
                continue;
            }
            if rescans >= MAX_POP_RESCANS {
                // Repeatedly beaten to the item by other threads; take the blocking path so this
                // caller cannot be starved indefinitely.
                return self.pop_verified_under_all_locks();
            }
            let mut shard = self.shards[best_shard].lock();
            // Retire tombstones first, so the priority read below belongs to a live item.
            let retired = shard.drop_leading_tombstones();
            if retired > 0 {
                self.heap_entries.fetch_sub(retired, Ordering::AcqRel);
            }
            let actual = shard.peek_bits().map_or(0, top_of);
            if actual < best {
                // Stale hint: this shard no longer holds what the scan promised. Publish the
                // truth and scan again rather than popping a lower-priority item.
                self.tops[best_shard].store(actual, Ordering::Release);
                drop(shard);
                rescans += 1;
                continue;
            }
            let before = shard.heap_len();
            let popped = shard.pop();
            let consumed = before - shard.heap_len();
            self.tops[best_shard].store(shard.peek_bits().map_or(0, top_of), Ordering::Release);
            drop(shard);
            if consumed > 0 {
                self.heap_entries.fetch_sub(consumed, Ordering::AcqRel);
            }
            if let Some(item) = popped {
                return Some(item);
            }
        }
    }

    /// Blocking slow path. Locks every shard in index order (so two of these cannot deadlock),
    /// refreshes every cached top, and takes the true global maximum. Reached only when the fast
    /// path has been beaten repeatedly or when the entry count and the cached tops disagree, so it
    /// trades throughput for a guarantee that a caller makes progress, and sleeps on a mutex
    /// rather than spinning while it waits.
    fn pop_verified_under_all_locks(&self) -> Option<(P, T)> {
        let mut guards: Vec<_> = self.shards.iter().map(|s| s.lock()).collect();
        let mut best_shard = usize::MAX;
        let mut best = 0u64;
        for (i, guard) in guards.iter_mut().enumerate() {
            let retired = guard.drop_leading_tombstones();
            if retired > 0 {
                self.heap_entries.fetch_sub(retired, Ordering::AcqRel);
            }
            let bits = guard.peek_bits().map_or(0, top_of);
            self.tops[i].store(bits, Ordering::Release);
            if bits > best {
                best = bits;
                best_shard = i;
            }
        }
        if best_shard == usize::MAX {
            return None;
        }
        let before = guards[best_shard].heap_len();
        let popped = guards[best_shard].pop();
        let consumed = before - guards[best_shard].heap_len();
        let refreshed = guards[best_shard].peek_bits().map_or(0, top_of);
        self.tops[best_shard].store(refreshed, Ordering::Release);
        drop(guards);
        if consumed > 0 {
            self.heap_entries.fetch_sub(consumed, Ordering::AcqRel);
        }
        popped
    }

    fn claim(&self, key: &T::Key) -> Option<(P, T)> {
        // The tombstone stays in the heap, so neither `heap_entries` nor the cached top changes
        // here. Both are left stale-high, which keeps `is_empty` honest about there being a heap
        // entry still to retire; `pop` is responsible for not mistaking the advertised priority
        // for a live one.
        self.shards[Self::shard_for_key(key)].lock().claim(key)
    }

    #[cfg(feature = "inline_execution_stats")]
    fn pushes(&self) -> u64 {
        self.shards.iter().map(|s| s.lock().pushes).sum()
    }
}

/// Decrements the shared entry count unless forgotten, so a panicking push cannot leave the count
/// permanently high.
struct EntryCount<'a>(&'a AtomicUsize);

impl Drop for EntryCount<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

pub struct PriorityRunner<
    C: Send + Sync + 'static,
    T: Claimable + Send + 'static,
    P: Clone + Ord + PriorityBits + Send + 'static,
    E: Executor<C, T, P> + 'static,
> {
    executor: E,
    /// The target number of workers to spawn.
    target_workers: usize,
    /// The queue of tasks to execute. These tasks are not scheduled yet.
    queue: ShardedQueue<P, T>,
    /// The number of active workers currently polling tasks.
    /// Workers that responded with Poll::Pending are not counted until they are polled again.
    active_workers: AtomicUsize,
    phantom: std::marker::PhantomData<C>,
}

impl<
    C: Send + Sync + 'static,
    T: Claimable + Send + 'static,
    P: Clone + Debug + Ord + PriorityBits + Send + 'static,
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
            queue: ShardedQueue::new(),
            active_workers: AtomicUsize::new(0),
            phantom: std::marker::PhantomData,
        }
    }

    /// How many tasks were ever put into the queue, as opposed to being executed without ever being
    /// queued. Diagnostics only — it lets a test assert that a task never took the detour through
    /// the queue.
    #[cfg(feature = "inline_execution_stats")]
    pub fn total_queued(&self) -> u64 {
        self.queue.pushes()
    }

    pub fn schedule(self: &Arc<Self>, execute_context: &Arc<C>, task: T, priority: P) {
        let queue = &self.queue;
        if !queue.is_empty() {
            // If there is already work in the queue, we don't have any
            // free capacity so we can just push the task to the queue.
            // It will be picked up by existing workers.
            //
            // Across shards this observation is not serialized with a worker's decision to
            // stop: a worker can retire the last entry and exit between the check above and the
            // push below, which would leave this task queued with nobody to drain it. So after
            // pushing, make sure a worker actually exists.
            queue.push(priority, task);
            if self.active_workers.load(Ordering::Acquire) == 0 {
                // Claim a worker slot the same way the empty-queue path does, so a runner
                // configured with no workers (or already at its target) still spawns nothing.
                let active_workers = self.active_workers.fetch_add(1, Ordering::Relaxed);
                if active_workers >= self.target_workers
                    || !self.spawn_worker_if_work_available(execute_context, true)
                {
                    self.decrease_active_workers(execute_context);
                }
            }
            return;
        }
        // The queue is empty, so we might have free capacity to spawn a new worker.
        let active_workers = self.active_workers.fetch_add(1, Ordering::Relaxed);
        if active_workers < self.target_workers {
            // We have free capacity, spawn a new worker to execute this task immediately.

            let future = self.executor.execute(execute_context, task, priority);
            WorkerFuture::spawn(future, execute_context.clone(), self.clone());
        } else {
            // No free capacity, push the task to the queue.
            queue.push(priority, task);

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
        let (priority, task) = self.queue.claim(key)?;
        Some(self.executor.execute(execute_context, task, priority))
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

    fn pop_future_from_worker(&self, execute_context: &Arc<C>) -> Option<E::Future> {
        let popped = self.queue.pop();
        popped.map(|(priority, task)| self.executor.execute(execute_context, task, priority))
    }

    fn spawn_worker_if_work_available(
        self: &Arc<Self>,
        execute_context: &Arc<C>,
        unused_active_count: bool,
    ) -> bool {
        let popped = self.queue.pop();
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
        P: PriorityBits,
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
    P: Clone + Debug + Ord + PriorityBits + Send + 'static,
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
    P: Clone + Debug + Ord + PriorityBits + Send + 'static,
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

    /// `impl PriorityBits for u32` is test-only scaffolding: the production instantiation uses
    /// `TaskPriority`, whose impl lives next to the type in `manager.rs`.
    impl PriorityBits for u32 {
        fn priority_bits(&self) -> u64 {
            *self as u64
        }
    }

    /// Sharding must not change *which* item pops next.
    ///
    /// A claimed item leaves a tombstone in its shard, and that shard's cached top goes on
    /// advertising the claimed priority. A `pop` that trusts the advertisement locks the shard and
    /// takes whatever is left in it, which can be far below the maximum waiting elsewhere. This is
    /// the production shape, not a contrived one: `read_task_output` claims by key, and every
    /// `ScheduledTask` is claimable.
    ///
    /// The keys are pinned rather than searched for. The shard layout is a function of the hasher
    /// and `QUEUE_SHARDS`, so bumping rustc-hash or changing the shard count silently re-rolls it
    /// and could quietly stop this test from exercising the collision it is about; the asserts
    /// below fail loudly instead. (The pre-existing tests use keys 0..9, which land in ten
    /// distinct shards, which is why none of them could ever see this.)
    #[test]
    fn test_claim_tombstone_does_not_break_global_order() {
        let (runner, executed) = queueing_runner::<u32>();
        let (co_a, co_b, other) = (3u32, 29u32, 5u32);
        assert_eq!(
            ShardedQueue::<u32, u32>::shard_for_key(&co_a),
            ShardedQueue::<u32, u32>::shard_for_key(&co_b),
            "test assumes keys {co_a} and {co_b} share a shard; the hasher or QUEUE_SHARDS changed"
        );
        assert_ne!(
            ShardedQueue::<u32, u32>::shard_for_key(&co_a),
            ShardedQueue::<u32, u32>::shard_for_key(&other),
            "test assumes key {other} is in a different shard; the hasher or QUEUE_SHARDS changed"
        );

        runner.schedule(&executed, co_a, 100);
        runner.schedule(&executed, co_b, 1);
        runner.schedule(&executed, other, 50);

        // Taking the maximum out by key leaves the tombstone that misleads the cached top.
        assert!(runner.claim(&executed, &co_a).is_some());

        // `RecordingExecutor` records at `execute()` time and `claim` calls it, so the claimed
        // item is recorded first; what this test is about is the order of the two that remain.
        assert_eq!(
            drain(&runner, &executed),
            vec![co_a, other, co_b],
            "after the maximum was claimed, the next pop must be the next-highest priority (50, \
             in another shard), not the priority-1 item sharing the claimed item's shard"
        );
    }

    /// Concurrent poppers must not both act on one scan: two threads can choose the same shard,
    /// the first takes its maximum, and the second then takes that shard's next item while a
    /// higher priority waits elsewhere. Racy by nature, so this only checks the conservation
    /// property over many rounds; the tombstone test above pins the ordering defect exactly.
    #[test]
    fn test_concurrent_pops_conserve_every_item() {
        for _round in 0..200 {
            let (runner, executed) = queueing_runner::<u32>();
            for id in 0..64u32 {
                runner.schedule(&executed, id, id);
            }
            let threads: Vec<_> = (0..4)
                .map(|_| {
                    let runner = runner.clone();
                    std::thread::spawn(move || {
                        let mut seen = Vec::new();
                        while let Some((priority, _)) = runner.queue.pop() {
                            seen.push(priority);
                        }
                        seen
                    })
                })
                .collect();
            let mut all: Vec<u32> = threads
                .into_iter()
                .flat_map(|t| t.join().unwrap())
                .collect();
            all.sort_unstable();
            all.dedup();
            assert_eq!(
                all.len(),
                64,
                "every queued item must be popped exactly once"
            );
            let _ = &executed;
        }
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
            // Sharded: the unsharded invariants hold over the sum across shards.
            assert!(runner.queue.is_empty());
            let total_slots: usize = runner
                .queue
                .shards
                .iter()
                .map(|s| s.lock().slots.len())
                .sum();
            assert!(
                total_slots <= 8,
                "slots should be recycled, got {total_slots} across shards"
            );
            assert!(
                runner
                    .queue
                    .shards
                    .iter()
                    .all(|s| s.lock().claimable.is_empty()),
                "claimable index should be empty in every shard when the queue is empty"
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
