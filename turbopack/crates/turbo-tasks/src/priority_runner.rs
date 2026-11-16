use std::{
    collections::BinaryHeap,
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
use arrayvec::ArrayVec;
use concurrent_queue::ConcurrentQueue;
use dashmap::Entry;
use parking_lot::{Mutex, MutexGuard};
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

/// How many keys a priority's [`SinglePriorityEntry::Plain`] entry holds before it is promoted to
/// a [`SinglePriorityEntry::Concurrent`] one. Priorities that only ever get a few items then don't
/// need a `ConcurrentQueue` allocation.
const PLAIN_ENTRY_CAPACITY: usize = 4;

/// Pushes `value` to an unbounded queue that is never closed.
fn push_unclosed<V>(queue: &ConcurrentQueue<V>, value: V) {
    let result = queue.push(value);
    debug_assert!(result.is_ok(), "the queues of the `Queue` are never closed");
}

/// A new unbounded queue holding `values`, oldest first.
fn queue_from<V>(values: impl IntoIterator<Item = V>) -> ConcurrentQueue<V> {
    let queue = ConcurrentQueue::unbounded();
    for value in values {
        push_unclosed(&queue, value);
    }
    queue
}

/// The keys of the queued items with one priority that are kept in the map, because they were
/// pushed with a priority below the `current` label (see [`Queue`]).
enum SinglePriorityEntry<K> {
    /// Up to [`PLAIN_ENTRY_CAPACITY`] keys, only accessed under the entry's map shard lock.
    Plain(ArrayVec<K, PLAIN_ENTRY_CAPACITY>),
    /// A lock-free queue, which can be pushed to under a shared lock of the entry's map shard.
    /// Boxed, as the queue is much larger than a `Plain` entry.
    Concurrent(Box<ConcurrentQueue<K>>),
}

impl<K: Copy> SinglePriorityEntry<K> {
    /// Creates the entry for `keys`. More keys than a `Plain` entry holds start out `Concurrent`.
    fn new(keys: &[K]) -> Self {
        if keys.len() <= PLAIN_ENTRY_CAPACITY {
            Self::Plain(keys.iter().copied().collect())
        } else {
            Self::Concurrent(Box::new(queue_from(keys.iter().copied())))
        }
    }

    /// Adds `keys`, promoting a `Plain` entry that would overflow to `Concurrent`.
    fn extend(&mut self, keys: &[K]) {
        match self {
            Self::Concurrent(queue) => {
                for &key in keys {
                    push_unclosed(queue, key);
                }
            }
            Self::Plain(plain) if plain.remaining_capacity() >= keys.len() => {
                plain.extend(keys.iter().copied());
            }
            Self::Plain(plain) => {
                let queue = queue_from(plain.drain(..).chain(keys.iter().copied()));
                *self = Self::Concurrent(Box::new(queue));
            }
        }
    }

    /// Passes all keys to `f`, oldest first. Only called on an entry that was removed from the
    /// map, so no push can race with it.
    fn drain_into(self, mut f: impl FnMut(K)) {
        match self {
            Self::Plain(keys) => keys.into_iter().for_each(f),
            Self::Concurrent(queue) => {
                while let Ok(key) = queue.pop() {
                    f(key);
                }
            }
        }
    }

    #[cfg(test)]
    fn is_empty(&self) -> bool {
        match self {
            Self::Plain(keys) => keys.is_empty(),
            Self::Concurrent(queue) => queue.is_empty(),
        }
    }
}

/// The queue that pops take items from: a single FIFO of `(priority, key)` elements that is never
/// closed or replaced, and the priority `label` that decides which pushes go to it (see [`Queue`]).
struct CurrentQueue<P, K> {
    /// Pushes with at least this priority go to `items`. It is raised by such pushes (only ever
    /// raised, with compare-and-swap), and set by a pop that refills `items` from the map. It is a
    /// hint, not an invariant: an element in `items` can have a higher priority than the label
    /// (see [`CurrentQueue::relabel`]).
    label: ArcSwap<P>,
    /// The queued keys, with the priority they were queued with, in push order.
    items: ConcurrentQueue<(P, K)>,
}

impl<P: Clone + Ord, K> CurrentQueue<P, K> {
    fn new(label: P) -> Self {
        Self {
            label: ArcSwap::from_pointee(label),
            items: ConcurrentQueue::unbounded(),
        }
    }

    /// Raises the label to `priority`, unless it is at least as high already. A concurrent raise
    /// to a higher priority is never overwritten, as the label is only replaced by
    /// compare-and-swap.
    fn raise_label(&self, priority: &P) {
        let mut label = self.label.load_full();
        while *label < *priority {
            let previous = self
                .label
                .compare_and_swap(&label, Arc::new(priority.clone()));
            if Arc::ptr_eq(&previous, &label) {
                return;
            }
            label = arc_swap::Guard::into_inner(previous);
        }
    }

    /// Sets the label to `priority` after a refill (which may lower it), unless a push raised it
    /// since `seen` was loaded: then the label is only raised to `priority`, if it is lower. Only
    /// called under the `heap` lock, so refills don't race each other.
    ///
    /// A push with exactly the `seen` priority that lands in `items` after the refill found them
    /// empty doesn't change the label, so the label can end up lower than that element. This only
    /// affects where later pushes go, never whether an element is popped.
    fn relabel(&self, seen: &Arc<P>, priority: P) {
        if **seen == priority {
            return;
        }
        let previous = self
            .label
            .compare_and_swap(seen, Arc::new(priority.clone()));
        if !Arc::ptr_eq(&previous, seen) {
            drop(previous);
            self.raise_label(&priority);
        }
    }
}

/// The queue of items that are not scheduled yet.
///
/// Pops take items from `current`, a single lock-free FIFO of `(priority, key)` elements that is
/// never closed or replaced, and that has a priority `label`:
/// - A push with at least the label's priority pushes to `current` without locking. A push with a
///   higher priority also raises the label (with compare-and-swap, so concurrent raises keep the
///   highest one). It never pulls back the older, lower-priority elements in `current`: those are
///   still popped first.
/// - A push with a lower priority goes to its priority's [`SinglePriorityEntry`] in the `entries`
///   map. An entry starts out `Plain` (a few inline keys, under an exclusive lock of its map shard)
///   and is promoted to a lock-free `ConcurrentQueue` once it holds more than
///   [`PLAIN_ENTRY_CAPACITY`] keys; pushes to it then only take a shared shard lock. Only a push
///   that creates an entry takes the `heap` mutex, to register its priority, after it released the
///   shard lock. [`Queue::push_many`] takes it at most once for the whole batch.
/// - A pop takes the next element from `current` without locking. Only when `current` is empty, it
///   locks the `heap`, moves all keys of the highest priority's entry to `current`, and sets the
///   label to that priority (see [`Queue::pop_locked`]).
///
/// This assumes that items tend to come in runs of the same priority: when all items have the
/// default priority (e.g. a from-scratch build), pushes and pops never take the mutex while there
/// is work queued; only a pop that finds the queue empty takes it, which is when workers run out of
/// work anyway.
///
/// The priority order is intentionally relaxed: a pop may return an item while an item with a
/// higher priority is queued.
/// - An element pushed with a higher priority than the label waits behind the older elements in
///   `current`, whatever their priority.
/// - A push with a lower priority than the label waits in the map until `current` is empty, even if
///   the higher-priority elements that raised the label were popped since.
/// - Concurrent pushes, refills and relabels can mix priorities in `current` in any order, and an
///   entry whose priority is registered after a refill picked a lower one waits for the next
///   refill.
///
/// So there is no bound on how long a higher-priority item waits behind lower-priority ones, other
/// than that `current` is processed in FIFO order. What is guaranteed is that every queued item is
/// popped (or claimed or replaced) at most once, and that pops keep finding queued items until
/// there are none: every element is either in `current` or in a map entry whose priority is (or is
/// about to be) in the `heap`. There is no guaranteed order between items with the same priority
/// either (e.g. [`Queue::push_many`] reorders them).
///
/// Invariants:
/// - Every priority in the `heap` has an entry, and appears once. An entry is only removed under
///   the `heap` lock, together with its priority, by the refill that moves its keys to `current`. A
///   new entry is added to the `heap` by the push that created it, right after it released the
///   entry's shard lock (so there is a short window in which a new priority isn't in the `heap`
///   yet).
/// - No queue is ever closed: an entry is removed under an exclusive lock of its map shard, so no
///   push to it is in progress then, and later pushes create a new entry.
/// - The label is only lowered under the `heap` lock (by a refill); otherwise, it is only raised.
///
/// Items are stored by value in the `claimable` map, at most one per key, and the queues only
/// hold their key (`current` also holds the priority the key was queued with). Pushing a key that
/// is still queued replaces the queued item, which is then handed to [`Executor::discard`] instead
/// of being executed. Claiming removes the item from the map. Either way the old key stays behind
/// as a tombstone that a pop skips. A pop only takes an item whose priority matches the one the
/// key was queued with, so a stale key never takes an item queued again with another priority.
/// With the *same* priority it may take it early, which only reorders equal-priority items; every
/// queued item still executes at most once.
///
/// Lock ordering: `heap`, then `entries` shard, then `claimable` shard. [`Queue::pop_locked`]
/// takes an `entries` shard lock while holding the `heap` mutex, and releases it before it takes
/// `claimable` shard locks (to resolve popped keys) while holding the `heap` mutex. Pushes finish
/// their `claimable` insert before they queue the key, and release the `entries` shard lock before
/// they take the `heap` mutex. [`Queue::claim`] only touches `claimable`.
struct Queue<P, T: Claimable> {
    /// The queue that pops take items from, and its priority label (see above).
    current: CurrentQueue<P, T::Key>,
    /// The priorities of all entries, to find the highest one.
    ///
    /// Its lock may be held while taking `entries` and `claimable` shard locks, never the other
    /// way around (see the lock ordering on [`Queue`]).
    heap: Mutex<BinaryHeap<P>>,
    /// The keys of the queued items that were pushed with a priority below the label, by priority.
    entries: FxDashMap<P, SinglePriorityEntry<T::Key>>,
    /// The queued items with their priority, by claim key. An item is removed when it is popped or
    /// claimed, and replaced when another item with the same key is pushed.
    claimable: FxDashMap<T::Key, (P, T)>,
    /// How many items were ever pushed. Diagnostics only, see [`PriorityRunner::total_queued`].
    #[cfg(feature = "inline_execution_stats")]
    pushes: std::sync::atomic::AtomicU64,
    /// How often the `heap` mutex was locked. Tests only.
    #[cfg(test)]
    heap_locks: AtomicUsize,
}

impl<P: Clone + Ord + Hash + Default, T: Claimable> Queue<P, T> {
    fn new() -> Self {
        Self {
            current: CurrentQueue::new(P::default()),
            heap: Mutex::new(BinaryHeap::new()),
            entries: FxDashMap::default(),
            claimable: FxDashMap::default(),
            #[cfg(feature = "inline_execution_stats")]
            pushes: std::sync::atomic::AtomicU64::new(0),
            #[cfg(test)]
            heap_locks: AtomicUsize::new(0),
        }
    }

    fn lock_heap(&self) -> MutexGuard<'_, BinaryHeap<P>> {
        #[cfg(test)]
        self.heap_locks.fetch_add(1, Ordering::Relaxed);
        self.heap.lock()
    }

    /// Whether no key is queued. This can be `false` while all remaining keys are tombstones of
    /// claimed or replaced items; popping is what cleans those up.
    #[cfg(test)]
    fn is_empty(&self) -> bool {
        let _heap = self.heap.lock();
        self.current.items.is_empty() && self.entries.iter().all(|entry| entry.is_empty())
    }

    /// The number of priorities that have a map entry.
    #[cfg(test)]
    fn queue_count(&self) -> usize {
        let heap = self.heap.lock();
        debug_assert_eq!(heap.len(), self.entries.len());
        heap.len()
    }

    /// The current priority label.
    #[cfg(test)]
    fn label(&self) -> P {
        (**self.current.label.load()).clone()
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

    /// Pushes `key` to `current` without locking, if `priority` is at least the label, and raises
    /// the label if `priority` is higher. Returns the key back otherwise.
    fn try_push_current(&self, priority: &P, key: T::Key) -> Result<(), T::Key> {
        let label = self.current.label.load();
        if *priority < **label {
            return Err(key);
        }
        let raises = *priority > **label;
        drop(label);
        push_unclosed(&self.current.items, (priority.clone(), key));
        if raises {
            self.current.raise_label(priority);
        }
        Ok(())
    }

    /// Pushes `keys` (all with the given priority) to the priority's map entry, creating it if
    /// needed. Returns whether it created the entry, whose priority then has to be registered in
    /// the `heap` (see [`Queue::register`]).
    ///
    /// Doesn't take the `heap` mutex. Pushing to an existing `Concurrent` entry only takes a shared
    /// lock of its map shard.
    fn push_to_map(&self, priority: &P, keys: &[T::Key]) -> bool {
        if let Some(entry) = self.entries.get(priority)
            && let SinglePriorityEntry::Concurrent(queue) = &*entry
        {
            for &key in keys {
                push_unclosed(queue, key);
            }
            return false;
        }
        match self.entries.entry(priority.clone()) {
            Entry::Occupied(mut entry) => {
                entry.get_mut().extend(keys);
                false
            }
            Entry::Vacant(entry) => {
                entry.insert(SinglePriorityEntry::new(keys));
                true
            }
        }
    }

    /// Adds the priorities of entries that [`Queue::push_to_map`] created to the `heap`, under a
    /// single lock.
    fn register<'a>(&self, priorities: impl IntoIterator<Item = &'a P>)
    where
        P: 'a,
    {
        let mut heap = self.lock_heap();
        heap.extend(priorities.into_iter().cloned());
    }

    /// Queues `task`. Returns the still-queued item with the same key that it replaced, if any:
    /// that item will not be executed, and its queue entry became a tombstone.
    #[must_use]
    fn push(&self, priority: P, task: T) -> Option<(P, T)> {
        let (key, replaced) = self.insert_claimable(&priority, task);
        if let Err(key) = self.try_push_current(&priority, key)
            && self.push_to_map(&priority, &[key])
        {
            self.register([&priority]);
        }
        replaced
    }

    /// Queues all `items`, like calling [`Queue::push`] for each of them, but loads the label only
    /// once and raises it at most once, pushes the keys of each map priority with a single map
    /// lookup, and takes the `heap` mutex at most once for the whole batch. Each still-queued item
    /// that one of the pushes replaced is passed to `on_replaced`, in the order of `items`. Items
    /// with the same priority aren't necessarily queued in the order of `items`.
    ///
    /// `items` must report its exact length, which is used to size an allocation.
    fn push_many(
        &self,
        items: impl IntoIterator<Item = (P, T), IntoIter: ExactSizeIterator>,
        mut on_replaced: impl FnMut(P, T),
    ) {
        let mut items = items.into_iter();
        // The keys below the label are collected first, so the map and heap are only touched for
        // them after all `claimable` inserts (which also keeps the lock ordering, see [`Queue`]).
        // Only allocated once the first such key shows up, as batches of only `current` items
        // don't need it.
        let mut other_items = Vec::new();
        let mut raise_to: Option<P> = None;
        {
            let label = self.current.label.load();
            while let Some((priority, task)) = items.next() {
                let (key, replaced) = self.insert_claimable(&priority, task);
                if priority < **label {
                    if other_items.is_empty() {
                        // This item plus at most all remaining ones go to the map.
                        other_items.reserve(items.len() + 1);
                    }
                    other_items.push((priority, key));
                } else {
                    if priority > **label && raise_to.as_ref().is_none_or(|max| priority > *max) {
                        raise_to = Some(priority.clone());
                    }
                    push_unclosed(&self.current.items, (priority, key));
                }
                if let Some((priority, task)) = replaced {
                    on_replaced(priority, task);
                }
            }
        }
        if let Some(priority) = raise_to {
            self.current.raise_label(&priority);
        }
        if other_items.is_empty() {
            return;
        }
        // Group the keys by priority, so each priority's entry is looked up and locked only once.
        // The order within a priority doesn't matter, so an unstable sort is fine.
        other_items.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));
        let keys: Vec<T::Key> = other_items.iter().map(|&(_, key)| key).collect();
        let mut created = Vec::new();
        let mut start = 0;
        while start < other_items.len() {
            let priority = &other_items[start].0;
            let end = start
                + other_items[start..]
                    .iter()
                    .take_while(|(other, _)| other == priority)
                    .count();
            if self.push_to_map(priority, &keys[start..end]) {
                created.push(priority);
            }
            start = end;
        }
        if !created.is_empty() {
            self.register(created);
        }
    }

    /// Pops the next item from `current`, skipping tombstones. The `heap` mutex is only taken when
    /// `current` is empty.
    fn pop(&self) -> Option<(P, T)> {
        self.pop_current().or_else(|| self.pop_locked())
    }

    /// Pops from `current` without locking until it finds an item that is still queued.
    fn pop_current(&self) -> Option<(P, T)> {
        while let Ok((priority, key)) = self.current.items.pop() {
            if let Some(task) = self.take(&priority, &key) {
                return Some((priority, task));
            }
        }
        None
    }

    /// The slow path of [`Queue::pop`] once `current` was found empty: under the `heap` lock, moves
    /// all keys of the highest priority's map entry to `current`, sets the label to that
    /// priority, and pops from `current` again, until it finds an item or there are no entries
    /// left.
    fn pop_locked(&self) -> Option<(P, T)> {
        let mut heap = self.lock_heap();
        loop {
            // Loaded before `current` is checked, so a push that raises the label after that check
            // is noticed by `relabel`.
            let seen = self.current.label.load_full();
            // Pushes may have landed in `current` since the caller found it empty.
            if let Some(item) = self.pop_current() {
                return Some(item);
            }
            if !self.refill(&mut heap, &seen) {
                return None;
            }
        }
    }

    /// Moves all keys of the highest priority's map entry to `current`, and sets the label to that
    /// priority (see [`CurrentQueue::relabel`]; `seen` is the label loaded before `current` was
    /// found empty). Returns `false` if there is no entry.
    fn refill(&self, heap: &mut BinaryHeap<P>, seen: &Arc<P>) -> bool {
        let Some(priority) = heap.pop() else {
            return false;
        };
        let (_, entry) = self
            .entries
            .remove(&priority)
            .expect("every priority in the heap has an entry");
        entry.drain_into(|key| push_unclosed(&self.current.items, (priority.clone(), key)));
        self.current.relabel(seen, priority);
        true
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
    P: Clone + Ord + Hash + Default + Send + Sync + 'static,
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
    P: Clone + Ord + Hash + Default + Send + Sync + 'static,
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
        // or to an existing map entry (without the `heap` lock), while a retiring worker's pop
        // only takes the `heap` lock after it found `current` empty, so there is no single edge
        // forcing the push to be observed. A push that creates a map entry adds its priority to
        // the `heap` before it returns, so before the scheduler's fence.)
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
        P: Hash,
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
    P: Clone + Ord + Hash + Default + Send + Sync + 'static,
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
    P: Clone + Ord + Hash + Default + Send + Sync + 'static,
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
        // Highest priority first: it raises the label, so the lower ones wait in the map, and run
        // strictly by priority.
        for task in (0..4).rev() {
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
        // Highest priority first, so the lower ones wait in the map (see
        // `test_claim_queued_entry_by_key`).
        for task in (0..6).rev() {
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

    /// Asserts that `actual` consists of the `groups` in order, where the items within a group (of
    /// the same priority) may come in any order.
    #[track_caller]
    fn assert_groups<T: Ord + Clone + Debug>(actual: &[T], groups: &[&[T]]) {
        let mut rest = actual;
        for group in groups {
            assert!(
                rest.len() >= group.len(),
                "{actual:?} doesn't consist of the groups {groups:?}"
            );
            let (head, tail) = rest.split_at(group.len());
            let mut head = head.to_vec();
            let mut group = group.to_vec();
            head.sort();
            group.sort();
            assert_eq!(
                head, group,
                "{actual:?} doesn't consist of the groups {groups:?}"
            );
            rest = tail;
        }
        assert!(
            rest.is_empty(),
            "{actual:?} doesn't consist of the groups {groups:?}"
        );
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
        assert_groups(&drain(&runner, &executed), &[&[(1, true), (2, false)]]);
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
        // Raises the label above the whole batch, so the batch goes to the map.
        runner.schedule(&executed, 8, 8);
        // Mixes priorities: odd items have their own priority, even ones the default priority.
        runner.schedule_many(
            &executed,
            (0..8).map(|task| (task, if task % 2 == 0 { 0 } else { task })),
        );
        // Highest priority first, then the default priority items (in any order).
        assert_groups(
            &drain(&runner, &executed),
            &[&[8], &[7], &[5], &[3], &[1], &[0, 2, 4, 6]],
        );
        assert!(runner.queue.is_empty());
        assert!(runner.queue.claimable.is_empty());
    }

    #[test]
    fn test_schedule_many_interleaves_with_schedule() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule(&executed, 4, 4);
        runner.schedule_many(&executed, [(1, 1), (6, 6), (3, 3)]);
        runner.schedule(&executed, 5, 5);
        // 6 raises the label and goes to `current` behind 4 (FIFO, no pull-back); 1, 3 and 5 are
        // below the label, wait in the map and run by priority.
        assert_eq!(drain(&runner, &executed), vec![4, 6, 5, 3, 1]);
    }

    #[test]
    fn test_schedule_many_empty() {
        let (runner, executed) = queueing_runner::<u32>();
        runner.schedule_many(&executed, std::iter::empty());
        assert!(runner.queue.is_empty());
        assert_eq!(runner.queue.queue_count(), 0);
        assert!(drain(&runner, &executed).is_empty());
        assert!(take_discarded(&runner).is_empty());
    }

    #[test]
    fn test_schedule_many_items_are_claimable() {
        let (runner, executed) = queueing_runner::<u32>();
        // Items 0 and 1 have the default priority, the others their own priority. The whole batch
        // is at or above the label, so it goes to `current` and runs in FIFO order (here: highest
        // priority first, as it is queued that way).
        runner.schedule_many(
            &executed,
            (0..6)
                .rev()
                .map(|task| (task, if task < 2 { 0 } else { task })),
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

        // The first two are spawned directly; the others are queued, highest priority first, so
        // the lower ones wait in the map below the label and run strictly by priority.
        for i in [0, 1, 9, 8, 7, 6, 5, 4, 3, 2] {
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

        // Queued highest priority first, see `test_cpu_bound_tasks`.
        for i in [0, 1, 9, 8, 7, 6, 5, 4, 3, 2] {
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

    /// Directly exercise `Queue` ordering. Pushes below the label wait in the map and are popped
    /// strictly by priority (in any order within a priority) once `current` is empty; pushes at or
    /// above the label are popped in FIFO order.
    #[test]
    fn queues_pop_in_priority_order() {
        let q: Queue<u32, &str> = Queue::new();
        assert!(q.is_empty());

        // The first push raises the label to 9, so the lower priorities go to the map. Every item
        // has its own key, so nothing is replaced.
        for (priority, task) in [
            (9, "p9-a"),
            (3, "p3"),
            (0, "low-a"),
            (7, "p7"),
            (0, "low-b"),
            (5, "p5"),
            (9, "p9-b"),
        ] {
            assert!(q.push(priority, task).is_none());
        }
        assert!(!q.is_empty());
        assert_eq!(q.queue_count(), 4);

        let mut out = Vec::new();
        while let Some((_, task)) = q.pop() {
            out.push(task);
        }
        assert_groups(
            &out,
            &[
                &["p9-a", "p9-b"],
                &["p7"],
                &["p5"],
                &["p3"],
                &["low-a", "low-b"],
            ],
        );
        assert!(q.is_empty());
        assert_eq!(q.queue_count(), 0);
        assert_eq!(q.label(), 0, "the last refill set the label");
    }

    /// A push with a higher priority than the label goes to `current` behind the older,
    /// lower-priority elements, which are not pulled back: `current` is popped in FIFO order.
    #[test]
    fn test_higher_priority_push_does_not_pull_back() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(0, 1).is_none());
        assert!(q.push(0, 2).is_none());
        assert!(q.push(5, 3).is_none());
        assert_eq!(q.label(), 5);
        assert_eq!(q.queue_count(), 0, "nothing went to the map");
        assert_eq!(q.pop(), Some((0, 1)));
        assert_eq!(q.pop(), Some((0, 2)));
        assert_eq!(q.pop(), Some((5, 3)));
        assert_eq!(q.pop(), None);
    }

    /// The label is raised by pushes and set by refills: a push below the label goes to the map,
    /// and is popped once `current` is empty, which sets the label to its priority.
    #[test]
    fn test_label_tracks_pushes_and_refills() {
        let q: Queue<u32, u32> = Queue::new();
        assert_eq!(q.label(), 0);
        assert!(q.push(3, 1).is_none());
        assert_eq!(q.label(), 3);
        assert!(q.push(1, 2).is_none());
        assert_eq!(q.label(), 3, "a lower priority doesn't change the label");
        assert_eq!(entry_state(&q, &1), Some(("plain", 1)));
        assert!(q.push(5, 3).is_none());
        assert_eq!(q.label(), 5);
        assert_eq!(q.queue_count(), 1);

        assert_eq!(q.pop(), Some((3, 1)));
        assert_eq!(q.pop(), Some((5, 3)));
        assert_eq!(q.label(), 5, "only a refill lowers the label");
        assert_eq!(q.pop(), Some((1, 2)));
        assert_eq!(q.label(), 1);
        assert_eq!(q.queue_count(), 0);
        assert_eq!(q.pop(), None);
        assert_eq!(q.label(), 1, "an empty queue keeps its label");

        // Pushing the label's priority again goes to `current`.
        assert!(q.push(1, 4).is_none());
        assert_eq!(q.queue_count(), 0);
        assert_eq!(q.pop(), Some((1, 4)));
    }

    /// Runs `f` on another thread while this thread holds the `heap` lock, and asserts that it
    /// finishes without the lock.
    fn assert_lock_free(runner: &TestRunner<u32>, f: impl FnOnce() + Send + 'static) {
        assert_queue_lock_free(&runner.queue, f);
    }

    /// Runs `f` on another thread while this thread holds the `heap` lock of `queue`, and asserts
    /// that it finishes without the lock.
    fn assert_queue_lock_free<P: Send, T: Claimable>(
        queue: &Queue<P, T>,
        f: impl FnOnce() + Send + 'static,
    ) {
        let heap_guard = queue.heap.lock();
        let (sender, receiver) = std::sync::mpsc::channel();
        let thread = std::thread::spawn(move || {
            f();
            sender.send(()).unwrap();
        });
        let result = receiver.recv_timeout(Duration::from_secs(1));
        drop(heap_guard);
        thread.join().unwrap();
        assert_eq!(result, Ok(()), "must not take the heap lock");
    }

    /// Pushes at or above the label, and pops from a non-empty `current`, don't take the `heap`
    /// lock: also a push that raises the label, and pushes after `current` ran empty.
    #[test]
    fn test_current_priority_push_and_pop_are_lock_free() {
        let (runner, executed) = queueing_runner::<u32>();
        assert_lock_free(&runner, {
            let runner = runner.clone();
            let executed = executed.clone();
            move || {
                // Raises the label from the default priority to 5.
                runner.schedule(&executed, 100, 5);
                for task in 1..=3 {
                    runner.schedule(&executed, task, 5);
                }
                for _ in 0..4 {
                    assert!(runner.pop_future_from_worker(&executed).is_some());
                }
            }
        });
        assert_eq!(drain(&runner, &executed), vec![100, 1, 2, 3]);
        assert_eq!(runner.queue.label(), 5);

        // `current` is empty now; pushing at or above its label stays lock-free.
        assert_lock_free(&runner, {
            let runner = runner.clone();
            let executed = executed.clone();
            move || {
                for task in 10..20 {
                    // The label's priority, then a higher one that raises it.
                    runner.schedule(&executed, task, if task < 15 { 5 } else { 6 });
                }
                for _ in 10..20 {
                    assert!(runner.pop_future_from_worker(&executed).is_some());
                }
            }
        });
        assert_eq!(drain(&runner, &executed), (10..20).collect::<Vec<_>>());
        assert_eq!(runner.queue.label(), 6);
    }

    /// A higher-priority push doesn't take the `heap` lock (it only raises the label).
    #[test]
    fn test_higher_priority_push_is_heap_lock_free() {
        let q: Arc<Queue<u32, u32>> = Arc::new(Queue::new());
        assert!(q.push(0, 1).is_none());
        assert_queue_lock_free(&q, {
            let q = q.clone();
            move || {
                assert!(q.push(5, 2).is_none());
                q.push_many([(7, 3), (6, 4)], |_, _| unreachable!());
            }
        });
        assert_eq!(q.label(), 7);
        assert_eq!(q.queue_count(), 0);
    }

    /// The label only goes up via [`CurrentQueue::raise_label`], and a refill's
    /// [`CurrentQueue::relabel`] doesn't overwrite a raise that happened after it loaded the label.
    #[test]
    fn test_relabel_keeps_concurrent_raise() {
        let current: CurrentQueue<u32, u32> = CurrentQueue::new(3);
        current.raise_label(&2);
        assert_eq!(**current.label.load(), 3, "raising never lowers");

        // A refill loaded the label (3), then a push raised it to 7: the refill to 1 keeps 7.
        let seen = current.label.load_full();
        current.raise_label(&7);
        current.relabel(&seen, 1);
        assert_eq!(**current.label.load(), 7);

        // The same, with a refill to a priority above the raise: it raises the label further.
        let seen = current.label.load_full();
        current.raise_label(&8);
        current.relabel(&seen, 9);
        assert_eq!(**current.label.load(), 9);

        // Without a concurrent raise, the refill sets (here: lowers) the label.
        let seen = current.label.load_full();
        current.relabel(&seen, 2);
        assert_eq!(**current.label.load(), 2);
    }

    /// A refill (here driven step by step under the `heap` lock) that races with pushes: one that
    /// raises the label after the refill loaded it, and a stale one that loaded the label before
    /// the refill and pushes with that (now outdated) priority without raising. Every item is
    /// popped exactly once, and the label keeps the raise. The stale push leaves the label below
    /// its element's priority, which is the documented hint semantics of the label.
    #[test]
    fn test_refill_races_with_pushes() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(5, 1).is_none());
        assert!(q.push(2, 2).is_none());
        assert_eq!(q.pop(), Some((5, 1)));

        // A pop found `current` empty and refills it.
        let mut heap = q.heap.lock();
        let seen = q.current.label.load_full();
        assert_eq!(*seen, 5);
        // A stale push of priority 5: it loaded the label (5) before the refill, so it pushes to
        // `current` without raising.
        let (key, replaced) = q.insert_claimable(&5, 3);
        assert!(replaced.is_none());
        push_unclosed(&q.current.items, (5, key));
        assert!(q.refill(&mut heap, &seen));
        drop(heap);
        assert_eq!(q.label(), 2, "the stale push didn't raise the label");
        assert_eq!(q.pop(), Some((5, 3)));
        assert_eq!(q.pop(), Some((2, 2)));
        assert_eq!(q.pop(), None);

        // The same, with a push that raises the label after the refill loaded it.
        assert!(q.push(4, 4).is_none());
        assert!(q.push(1, 5).is_none());
        assert_eq!(q.pop(), Some((4, 4)));
        let mut heap = q.heap.lock();
        let seen = q.current.label.load_full();
        assert_eq!(*seen, 4);
        assert!(
            q.push(8, 6).is_none(),
            "pushed lock-free while a refill holds the lock"
        );
        assert!(q.refill(&mut heap, &seen));
        drop(heap);
        assert_eq!(q.label(), 8, "the refill kept the raise");
        assert_eq!(q.pop(), Some((8, 6)));
        assert_eq!(q.pop(), Some((1, 5)));
        assert_eq!(q.pop(), None);
        assert!(q.is_empty());
    }

    /// Many threads race to raise the label: it ends at the highest pushed priority, and every item
    /// is popped exactly once.
    #[test]
    fn test_concurrent_raises_keep_the_highest() {
        const THREADS: u32 = 8;
        for _ in 0..200 {
            let q: Arc<Queue<u32, u32>> = Arc::new(Queue::new());
            let barrier = Arc::new(Barrier::new(THREADS as usize));
            let threads: Vec<_> = (1..=THREADS)
                .map(|priority| {
                    let q = q.clone();
                    let barrier = barrier.clone();
                    std::thread::spawn(move || {
                        barrier.wait();
                        assert!(q.push(priority, priority).is_none());
                    })
                })
                .collect();
            for thread in threads {
                thread.join().unwrap();
            }
            assert_eq!(q.label(), THREADS);
            let mut out = Vec::new();
            while let Some((priority, task)) = q.pop() {
                assert_eq!(priority, task);
                out.push(task);
            }
            out.sort_unstable();
            assert_eq!(out, (1..=THREADS).collect::<Vec<_>>());
            assert!(q.is_empty());
        }
    }

    fn entry_state<P: Clone + Ord + Hash + Default, T: Claimable>(
        q: &Queue<P, T>,
        priority: &P,
    ) -> Option<(&'static str, usize)> {
        q.entries.get(priority).map(|entry| match &*entry {
            SinglePriorityEntry::Plain(keys) => ("plain", keys.len()),
            SinglePriorityEntry::Concurrent(queue) => ("concurrent", queue.len()),
        })
    }

    /// A priority below the label starts out with a `Plain` entry, which is promoted to a
    /// `Concurrent` one by the push that overflows it, keeping all its keys.
    #[test]
    fn test_plain_entry_promoted_on_overflow() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(9, 100).is_none());
        for key in 1..=PLAIN_ENTRY_CAPACITY as u32 {
            assert!(q.push(5, key).is_none());
            assert_eq!(entry_state(&q, &5), Some(("plain", key as usize)));
        }
        assert!(q.push(5, 99).is_none());
        assert_eq!(
            entry_state(&q, &5),
            Some(("concurrent", PLAIN_ENTRY_CAPACITY + 1))
        );
        assert_eq!(q.label(), 9);

        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        let mut low = (1..=PLAIN_ENTRY_CAPACITY as u32)
            .map(|key| (5, key))
            .collect::<Vec<_>>();
        low.push((5, 99));
        assert_groups(&out, &[&[(9, 100)], &low]);
    }

    /// A pop that finds `current` empty refills it from the highest map entry, `Plain` or
    /// `Concurrent`, and the following pops of that priority are lock-free again.
    #[test]
    fn test_refill_from_plain_and_concurrent_entries() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(9, 100).is_none());
        assert!(q.push(6, 1).is_none());
        for key in 10..=(10 + PLAIN_ENTRY_CAPACITY as u32) {
            assert!(q.push(5, key).is_none());
        }
        assert_eq!(entry_state(&q, &6), Some(("plain", 1)));
        assert_eq!(
            entry_state(&q, &5),
            Some(("concurrent", PLAIN_ENTRY_CAPACITY + 1))
        );
        assert_eq!(q.pop(), Some((9, 100)));
        // Refills from the `Plain` entry.
        assert_eq!(q.pop(), Some((6, 1)));
        assert_eq!(q.label(), 6);
        assert_eq!(entry_state(&q, &6), None);
        // Refills from the `Concurrent` entry; the next pops don't take the lock.
        let (priority, first) = q.pop().unwrap();
        assert_eq!(priority, 5);
        assert_eq!(q.label(), 5);
        assert_eq!(q.queue_count(), 0);
        let locks = q.heap_locks.load(Ordering::Relaxed);
        let mut rest = vec![first];
        for _ in 0..PLAIN_ENTRY_CAPACITY {
            let (priority, key) = q.pop().unwrap();
            assert_eq!(priority, 5);
            rest.push(key);
        }
        assert_eq!(
            q.heap_locks.load(Ordering::Relaxed),
            locks,
            "popping the refilled `current` is lock-free"
        );
        let expected: Vec<_> = (10..=(10 + PLAIN_ENTRY_CAPACITY as u32)).collect();
        assert_groups(&rest, &[&expected]);
        assert_eq!(q.pop(), None);
    }

    /// Pushing to a lower priority that already has an entry doesn't take the `heap` lock, both
    /// for a `Concurrent` and for a `Plain` entry.
    #[test]
    fn test_push_to_existing_lower_priority_is_heap_lock_free() {
        let q: Arc<Queue<u32, u32>> = Arc::new(Queue::new());
        assert!(q.push(9, 1).is_none());
        for key in 10..=(10 + PLAIN_ENTRY_CAPACITY as u32) {
            assert!(q.push(5, key).is_none());
        }
        assert_eq!(
            entry_state(&q, &5),
            Some(("concurrent", PLAIN_ENTRY_CAPACITY + 1))
        );
        assert!(q.push(6, 30).is_none());
        assert_eq!(entry_state(&q, &6), Some(("plain", 1)));
        assert_queue_lock_free(&q, {
            let q = q.clone();
            move || {
                assert!(q.push(5, 20).is_none());
                assert!(q.push(6, 31).is_none());
                q.push_many([(5, 21), (6, 32)], |_, _| unreachable!());
            }
        });
        assert_eq!(
            entry_state(&q, &5),
            Some(("concurrent", PLAIN_ENTRY_CAPACITY + 3))
        );
        assert_eq!(entry_state(&q, &6), Some(("plain", 3)));
    }

    /// `push_many` reports replaced items in input order, queues every item with its priority
    /// (in any order within a priority), and takes the `heap` lock at most once, also for a batch
    /// with several new priorities below the label.
    #[test]
    fn test_push_many_groups_by_priority() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(9, 1).is_none());
        assert!(q.push(4, 2).is_none());
        let locks = q.heap_locks.load(Ordering::Relaxed);
        let mut replaced = Vec::new();
        q.push_many(
            [
                (5, 10),
                (2, 1),
                (7, 11),
                (5, 12),
                (6, 2),
                (9, 13),
                (7, 14),
                (5, 15),
            ],
            |priority, task| replaced.push((priority, task)),
        );
        assert_eq!(q.heap_locks.load(Ordering::Relaxed), locks + 1);
        assert_eq!(replaced, [(9, 1), (4, 2)]);

        // A batch of priorities that all have an entry (or go to `current`) doesn't take the lock.
        q.push_many([(9, 20), (5, 21), (9, 22)], |_, _| unreachable!());
        assert_eq!(q.heap_locks.load(Ordering::Relaxed), locks + 1);

        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        assert_groups(
            &out,
            &[
                &[(9, 13), (9, 20), (9, 22)],
                &[(7, 11), (7, 14)],
                &[(6, 2)],
                &[(5, 10), (5, 12), (5, 15), (5, 21)],
                &[(2, 1)],
            ],
        );
    }

    /// A `push_many` batch raises the label to its highest priority at or above the label, and
    /// queues the others in the map.
    #[test]
    fn test_push_many_raises_label() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(3, 0).is_none());
        q.push_many([(3, 1), (8, 2), (5, 3), (2, 4)], |_, _| unreachable!());
        assert_eq!(q.label(), 8);
        assert_eq!(entry_state(&q, &2), Some(("plain", 1)));
        assert_eq!(q.queue_count(), 1);
        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        // `current` in FIFO order (with the label loaded once, at 3, for the batch), then the map.
        assert_eq!(out, [(3, 0), (3, 1), (8, 2), (5, 3), (2, 4)]);
    }

    /// A push creates a map entry, and before it registers the priority in the `heap`, other
    /// pushes add to the entry. Until the priority is registered, pops don't find the entry (the
    /// scheduler's fence covers that window, see [`PriorityRunner::schedule`]); afterwards they
    /// find all its items.
    #[test]
    fn test_registration_pending() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(9, 100).is_none());
        // The creating push, up to (but not including) its registration.
        let (key, _) = q.insert_claimable(&5, 1);
        assert!(q.push_to_map(&5, &[key]));
        for key in 2..=(PLAIN_ENTRY_CAPACITY as u32 + 1) {
            assert!(q.push(5, key).is_none());
        }
        assert_eq!(
            entry_state(&q, &5),
            Some(("concurrent", PLAIN_ENTRY_CAPACITY + 1))
        );
        assert!(q.heap.lock().is_empty(), "not registered yet");
        assert_eq!(q.pop(), Some((9, 100)));
        assert_eq!(q.pop(), None);

        q.register([&5]);
        assert_eq!(q.queue_count(), 1);
        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        let expected: Vec<_> = (1..=(PLAIN_ENTRY_CAPACITY as u32 + 1))
            .map(|key| (5, key))
            .collect();
        assert_groups(&out, &[&expected]);
        assert_eq!(q.queue_count(), 0);
        assert_eq!(q.label(), 5);
    }

    /// `current` can hold elements of several priorities for the same key: a pop resolves each
    /// element with the priority it was queued with, so a stale element never takes the newer
    /// item, in `current` or in the map, and every item is popped once.
    #[test]
    fn test_mixed_priority_current_resolves_by_element_priority() {
        let q: Queue<u32, (u32, bool)> = Queue::new();
        // Both go to `current`; the second replaces the first.
        assert!(q.push(0, (1, false)).is_none());
        assert_eq!(q.push(5, (1, true)), Some((0, (1, false))));
        // The newer item goes to the map (below the label), replacing the one in `current`.
        assert!(q.push(5, (2, false)).is_none());
        assert_eq!(q.push(0, (2, true)), Some((5, (2, false))));
        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        assert_eq!(out, [(5, (1, true)), (0, (2, true))]);
        assert!(q.claimable.is_empty());
        assert!(q.is_empty());

        // An item waiting in the map (below the label) is replaced by one pushed to `current`
        // (at the label): the newer one is popped from `current`, and the stale map key is
        // skipped after the refill.
        assert!(q.push(5, (3, false)).is_none());
        assert!(q.push(1, (4, false)).is_none());
        assert_eq!(q.push(1, (4, false)), Some((1, (4, false))));
        assert_eq!(q.push(5, (4, true)), Some((1, (4, false))));
        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        assert_eq!(out, [(5, (3, false)), (5, (4, true))]);
        assert!(q.claimable.is_empty());
        assert!(q.is_empty());
        assert_eq!(q.queue_count(), 0);
    }

    /// Claimed items leave tombstones in `current` and in the map; pops skip both, and the queue
    /// is empty afterwards.
    #[test]
    fn test_claim_in_current_and_map() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(5, 1).is_none());
        assert!(q.push(2, 2).is_none());
        assert!(q.push(2, 3).is_none());
        assert_eq!(q.claim(&1), Some((5, 1)));
        assert_eq!(q.claim(&2), Some((2, 2)));
        assert!(!q.is_empty(), "tombstones are still queued keys");
        assert_eq!(q.pop(), Some((2, 3)));
        assert_eq!(q.pop(), None);
        assert!(q.is_empty());
        assert_eq!(q.queue_count(), 0);
    }

    /// Tombstones of claimed items are skipped by pops in `current` and in the map, and an entry
    /// that only had tombstones is refilled like any other.
    #[test]
    fn test_tombstones_in_priority_queues() {
        let (runner, executed) = queueing_runner::<u32>();
        for _ in 0..3 {
            runner.schedule(&executed, 1, 10);
            runner.schedule(&executed, 2, 2);
            runner.schedule(&executed, 3, 0);
            // Priority 10 raised the label; 2 and 0 are below it, in the map.
            assert_eq!(runner.queue.queue_count(), 2);

            assert!(runner.claim(&executed, &1).is_some());
            assert!(runner.claim(&executed, &2).is_some());
            assert!(!runner.queue.is_empty(), "tombstones are still queued keys");
            executed.lock().clear();

            // Popping skips both tombstones, refilling from both entries, and takes the default
            // priority item.
            assert!(runner.pop_future_from_worker(&executed).is_some());
            assert_eq!(*executed.lock(), vec![3]);
            executed.lock().clear();
            assert!(runner.queue.is_empty());
            assert_eq!(runner.queue.queue_count(), 0);
            assert!(runner.pop_future_from_worker(&executed).is_none());
        }
    }

    /// Producers and consumers race on few, constantly changing priorities, so the label is
    /// raised, pushes go to `current` or to map entries that are created, promoted and refilled
    /// concurrently all the time. Half of the producers push short bursts (which mostly stay
    /// `Plain`) in batches. Every item must be popped exactly once (with its own priority), and no
    /// entry is left afterwards.
    #[test]
    fn test_concurrent_priority_churn_pops_every_item_once() {
        const PRODUCERS: u32 = 4;
        const CONSUMERS: usize = 4;
        const ITEMS: u32 = 20_000;
        const BATCH: u32 = 7;
        fn priority_of(task: u32) -> u32 {
            let (producer, i) = (task / ITEMS, task % ITEMS);
            // Bursts of the same priority, so many pushes hit the current queue, or a `Plain`
            // entry for the short bursts.
            let burst = if producer < PRODUCERS / 2 { 16 } else { 3 };
            (i / burst) % 6
        }
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
                    let tasks = producer * ITEMS..(producer + 1) * ITEMS;
                    if producer < PRODUCERS / 2 {
                        for task in tasks {
                            assert!(q.push(priority_of(task), task).is_none());
                        }
                    } else {
                        let tasks: Vec<_> = tasks.collect();
                        for batch in tasks.chunks(BATCH as usize) {
                            q.push_many(
                                batch.iter().map(|&task| (priority_of(task), task)),
                                |_, _| unreachable!(),
                            );
                        }
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
                                assert_eq!(priority, priority_of(task));
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
        assert_eq!(q.queue_count(), 0, "every entry was refilled");
    }

    /// Claims find items in `current` and in the map, and claiming leaves the order of the
    /// remaining items intact.
    #[test]
    fn test_claim_from_all_priority_queues() {
        let (runner, executed) = queueing_runner::<u32>();
        // Highest priority first, so the others wait in the map below the label.
        runner.schedule(&executed, 4, 10);
        runner.schedule(&executed, 3, 5);
        runner.schedule(&executed, 2, 3);
        runner.schedule(&executed, 1, 0);
        runner.schedule(&executed, 0, 0);

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
    /// latest item is popped from the default priority's entry, with the default priority.
    #[test]
    fn test_stale_entry_in_other_priority_does_not_take_newer_item() {
        let q: Queue<u32, (u32, bool)> = Queue::new();
        assert!(q.push(10, (1, false)).is_none());
        assert!(q.push(0, (5, false)).is_none());
        assert_eq!(q.push(0, (1, true)), Some((10, (1, false))));
        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        assert_groups(&out, &[&[(0, (5, false)), (0, (1, true))]]);
        assert!(q.claimable.is_empty());
        assert!(q.is_empty());
    }

    /// Claiming leaves a tombstone in a higher priority queue; queueing the same key again with
    /// the default priority must not let that tombstone take the new item (with the higher
    /// priority, ahead of other default priority items).
    #[test]
    fn test_claim_then_requeue_with_other_priority() {
        let q: Queue<u32, u32> = Queue::new();
        assert!(q.push(10, 1).is_none());
        assert_eq!(q.claim(&1), Some((10, 1)));
        assert!(q.push(0, 2).is_none());
        assert!(q.push(0, 1).is_none());
        let mut out = Vec::new();
        while let Some(item) = q.pop() {
            out.push(item);
        }
        assert_groups(&out, &[&[(0, 2), (0, 1)]]);
        assert_eq!(q.queue_count(), 0);
    }

    /// Claiming and queueing the same key again at the same priority: the stale entry may take the
    /// new item early (equal priority, so only the order within the priority changes), but it
    /// still runs exactly once.
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
        assert_eq!(runner.queue.queue_count(), 0);
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
    /// The rounds alternate between the default priority and a higher one. A higher-priority round
    /// raises the label and pushes lock-free to `current`; the next default priority round is
    /// below the label, so it creates a map entry under the `heap` lock, which the worker's pop
    /// then refills into `current` (lowering the label again). So the saturated push races a
    /// retiring worker both on the lock-free raise path and on the map path. See
    /// `stress_saturated_raise_vs_retiring_worker` for a variant where every push raises.
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
                    // Alternate: higher-priority rounds raise the label lock-free; default
                    // priority rounds go to the map below it, under the lock. Every task has its
                    // own key.
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

    /// Like `stress_saturated_schedule_vs_retiring_worker`, but every round has a higher priority
    /// than the one before, so every saturated push (one that isn't spawned directly into a free
    /// worker slot) raises the label and goes lock-free to `current`, and nothing ever goes to the
    /// map. The liveness edge is carried purely by the fences and `active_workers`, not
    /// incidentally by the queue mutex.
    #[test]
    fn stress_saturated_raise_vs_retiring_worker() {
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

        let rt = stress_runtime(1);

        rt.block_on(async {
            tokio::time::timeout(Duration::from_secs(20), async {
                const ROUNDS: u32 = 10_000;
                let ctx = Arc::new(Ctx {
                    completed: AtomicUsize::new(0),
                });
                let runner = Arc::new(PriorityRunner::new(Exec));

                let mut expected = 0;
                for round in 0..ROUNDS {
                    // Strictly increasing, so every push raises the label.
                    runner.schedule(&ctx, round, round + 1);
                    expected += 1;
                    while ctx.completed.load(Ordering::Acquire) < expected {
                        tokio::task::yield_now().await;
                    }
                }
                assert_eq!(ctx.completed.load(Ordering::Acquire), expected);
                // Directly spawned rounds bypass the queue, so the label is only at most the last
                // priority.
                assert!(runner.queue.label() <= ROUNDS);
                assert_eq!(runner.queue.queue_count(), 0, "nothing went to the map");
            })
            .await
            .expect("timed out — a task was stranded on the saturated raise path");
        });
    }

    /// Concurrent producers push items with random priorities (so pushes raise the label, go to
    /// `current` at the label, or to the map below it), sharing keys so that items replace each
    /// other, while poppers and claimers run. Once the producers are done, draining executes every
    /// item that was neither replaced nor claimed, exactly once: progress on a finite workload.
    #[test]
    fn test_finite_workload_progress_with_random_priorities() {
        use std::sync::atomic::{AtomicBool, AtomicU64};

        const PRODUCERS: u32 = 4;
        const PER_PRODUCER: u32 = 20_000;
        const KEYS: u32 = 64;

        #[derive(Debug)]
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

        for _ in 0..5 {
            let q: Arc<Queue<u32, Item>> = Arc::new(Queue::new());
            // Per item: 1 popped, 2 claimed, 3 replaced.
            let outcome: Arc<Vec<AtomicU64>> = Arc::new(
                (0..PRODUCERS * PER_PRODUCER)
                    .map(|_| AtomicU64::new(0))
                    .collect(),
            );
            let record = |outcome: &[AtomicU64], id: u32, what: u64| {
                let previous = outcome[id as usize].swap(what, Ordering::Relaxed);
                assert_eq!(
                    previous, 0,
                    "item {id} had outcome {previous} before {what}"
                );
            };
            let stop = Arc::new(AtomicBool::new(false));
            let producers: Vec<_> = (0..PRODUCERS)
                .map(|producer| {
                    let q = q.clone();
                    let outcome = outcome.clone();
                    std::thread::spawn(move || {
                        // A small xorshift, so the test is deterministic per producer.
                        let mut state = 0x9e37_79b9u32 ^ (producer + 1);
                        let mut next = move || {
                            state ^= state << 13;
                            state ^= state >> 17;
                            state ^= state << 5;
                            state
                        };
                        for i in 0..PER_PRODUCER {
                            let id = producer * PER_PRODUCER + i;
                            let random = next();
                            let priority = random % 8;
                            let key = (random >> 8) % KEYS;
                            if let Some((_, replaced)) = q.push(priority, Item { id, key }) {
                                record(&outcome, replaced.id, 3);
                            }
                        }
                    })
                })
                .collect();
            let workers: Vec<_> = (0..4)
                .map(|worker| {
                    let q = q.clone();
                    let outcome = outcome.clone();
                    let stop = stop.clone();
                    std::thread::spawn(move || {
                        let mut key = worker;
                        while !stop.load(Ordering::Acquire) {
                            if worker % 2 == 0 {
                                if let Some((_, item)) = q.pop() {
                                    record(&outcome, item.id, 1);
                                }
                            } else {
                                key = (key + 7) % KEYS;
                                if let Some((_, item)) = q.claim(&key) {
                                    record(&outcome, item.id, 2);
                                }
                            }
                        }
                    })
                })
                .collect();
            for producer in producers {
                producer.join().unwrap();
            }
            stop.store(true, Ordering::Release);
            for worker in workers {
                worker.join().unwrap();
            }
            while let Some((_, item)) = q.pop() {
                record(&outcome, item.id, 1);
            }
            assert!(q.is_empty());
            assert!(q.claimable.is_empty());
            assert_eq!(q.queue_count(), 0);
            for (id, outcome) in outcome.iter().enumerate() {
                assert_ne!(
                    outcome.load(Ordering::Relaxed),
                    0,
                    "item {id} was neither popped, claimed nor replaced"
                );
            }
        }
    }
}
