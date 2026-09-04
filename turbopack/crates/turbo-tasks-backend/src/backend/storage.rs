use std::{
    cell::Cell,
    fmt::{Display, Formatter},
    hash::BuildHasher,
    ops::{Deref, DerefMut},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    },
};

use concurrent_queue::{ConcurrentQueue, PushError};
use thread_local::ThreadLocal;
use tracing::span::Id;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{FxDashMap, TaskId, backend::CachedTaskTypeArc, event::Event, parallel};

use crate::{
    backend::{
        storage_schema::{
            DropPartialOutcome, KeyEvictability, TaskStorage, UnevictableReason, ValueEvictability,
        },
        task_map::{TaskMap, TaskMapGuard},
    },
    backing_storage::SnapshotItem,
    database::key_value_database::KeySpace,
    utils::dash_map_drop_contents::drop_contents,
};

/// Maximum exact dirty-ID work retained before a snapshot falls back to scanning all residents.
/// Benchmarks show queued lookup wins decisively for small incremental snapshots while a full scan
/// wins once most of a 100k-task map is dirty.
const DIRTY_QUEUE_LIMIT: usize = 16 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskDataCategory {
    Meta,
    Data,
    All,
}
impl PartialOrd for TaskDataCategory {
    /// `All` is greater than both `Meta` and `Data`; `Meta` and `Data` are unordered.
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        use std::cmp::Ordering::*;

        use TaskDataCategory::All;
        match (self, other) {
            _ if self == other => Some(Equal),
            (All, _) => Some(Greater),
            (_, All) => Some(Less),
            _ => None,
        }
    }
}

/// Counts of tasks evicted at each level.
#[derive(Debug, Default)]
pub struct EvictionCounts {
    pub key_evictions: usize,
    pub full: usize,
    pub data_and_meta: usize,
    pub data_only: usize,
    pub meta_only: usize,
    /// Per-reason counts of tasks we considered but could not evict, indexed by
    /// `UnevictableReason::index()`.
    pub unevictable_reasons: [usize; UnevictableReason::COUNT],
}

impl std::ops::AddAssign for EvictionCounts {
    fn add_assign(&mut self, rhs: Self) {
        self.key_evictions += rhs.key_evictions;
        self.full += rhs.full;
        self.data_and_meta += rhs.data_and_meta;
        self.data_only += rhs.data_only;
        self.meta_only += rhs.meta_only;
        for i in 0..UnevictableReason::COUNT {
            self.unevictable_reasons[i] += rhs.unevictable_reasons[i];
        }
    }
}

impl Display for EvictionCounts {
    /// Compact `field=value,...` form used as a single tracing span field so that
    /// adding a new counter or `UnevictableReason` variant doesn't require updating
    /// the span field list.
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let skipped: usize = self.unevictable_reasons.iter().sum();
        write!(
            f,
            "task_cache_evictions={},full={},data_and_meta={},data_only={},meta_only={},skipped={}",
            self.key_evictions,
            self.full,
            self.data_and_meta,
            self.data_only,
            self.meta_only,
            skipped,
        )?;
        for reason in UnevictableReason::ALL {
            write!(
                f,
                ",{}={}",
                reason.span_name(),
                self.unevictable_reasons[reason.index()],
            )?;
        }
        Ok(())
    }
}

impl TaskDataCategory {
    pub fn includes_data(self) -> bool {
        matches!(self, TaskDataCategory::Data | TaskDataCategory::All)
    }

    pub fn includes_meta(self) -> bool {
        matches!(self, TaskDataCategory::Meta | TaskDataCategory::All)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SpecificTaskDataCategory {
    Meta,
    Data,
}

impl From<SpecificTaskDataCategory> for TaskDataCategory {
    fn from(category: SpecificTaskDataCategory) -> Self {
        match category {
            SpecificTaskDataCategory::Meta => TaskDataCategory::Meta,
            SpecificTaskDataCategory::Data => TaskDataCategory::Data,
        }
    }
}

impl SpecificTaskDataCategory {
    /// Returns the KeySpace for storing data of this category
    pub fn key_space(self) -> KeySpace {
        match self {
            SpecificTaskDataCategory::Meta => KeySpace::TaskMeta,
            SpecificTaskDataCategory::Data => KeySpace::TaskData,
        }
    }
}

/// Records exactly what a `track_modification` call changed, so that
/// [`StorageWriteGuard::undo_track_modification`] can reverse it precisely when the mutation it
/// guarded turns out to be a no-op.  This allows us to track modifications 'optimistically' and
/// undo it if the modification turned out to be a no op.  Useful when dealing with datastructures
/// like `AutoSet` that can efficiently say whether or not they were modified.
#[must_use = "a no-op mutation must undo its TrackOutcome; dropping it leaks an over-track"]
pub enum TrackOutcome {
    /// Nothing was tracked: either the category was already modified, or (in snapshot mode) it was
    /// already modified-during-snapshot. Undo is a no-op.
    NoChange,
    /// Non-snapshot path: `modified(category)` was set. `bumped` is true if this call also
    /// incremented the per-shard modified counter (i.e. the task had no prior modifications).
    Tracked {
        category: SpecificTaskDataCategory,
        bumped: bool,
    },
    /// Snapshot path: `modified_during_snapshot(category)` was set. `inserted_snapshot` is true if
    /// this call also inserted the task's entry into the `snapshots` map (the pre-mutation copy or
    /// a `None` marker).
    TrackedDuringSnapshot {
        category: SpecificTaskDataCategory,
        inserted_snapshot: bool,
    },
}

pub struct Storage {
    snapshot_mode: AtomicBool,
    /// Writers that observed snapshot mode and may still be publishing a snapshot marker.
    snapshot_writers: AtomicUsize,
    /// Number of tasks believed to have modified flags outside snapshot mode. Used to skip the
    /// resident-map scan when no persistence work exists. Transitions are serialized by task
    /// locks.
    modified_count: AtomicU64,
    /// Bounded exact worklist for small incremental snapshots. Once full, `dirty_overflow`
    /// switches the next snapshot to a full Papaya scan, avoiding per-task queue overhead on
    /// cold builds.
    dirty_tasks: ConcurrentQueue<TaskId>,
    dirty_overflow: AtomicBool,
    /// Stores snapshots of task state for tasks accessed during snapshot mode.
    /// - `Some(snapshot)`: Task was modified before snapshot mode and accessed again during it.
    ///   Contains a copy of the pre-snapshot state that needs to be persisted.
    /// - `None`: Task was first modified during snapshot mode (not part of current snapshot). Will
    ///   be marked as modified at the beginning of the next snapshot cycle.
    ///
    /// Task mutation acquires the task lock before a snapshots shard lock. `end_snapshot` drains
    /// snapshots shards completely before resolving and locking resident tasks, so it never holds
    /// those locks in the reverse order.
    snapshots: FxDashMap<TaskId, Option<Box<TaskStorage>>>,
    /// The main resident-task map. Papaya guards provide entry lifetime; each TaskSlot's intrusive
    /// lock provides payload exclusion. Papaya pins do not participate in lock ordering.
    map: TaskMap,
    /// A shared event notified whenever any task finishes restoring (successfully or not).
    ///
    /// Threads waiting for another thread's in-progress restore subscribe to this event,
    /// then re-check the specific task's `restoring`/`restored` bits after waking.
    pub(crate) restored: Event,
    /// Maps `CachedTaskType` → `TaskId` for deduplication of persistent task creation.
    /// This is backed by the TaskCache table in the database.
    ///
    /// Persistent task creation may hold a task_cache shard lock while acquiring a resident task.
    /// Eviction therefore releases its task lock before removing the inverse cache entry.
    pub task_cache: FxDashMap<CachedTaskTypeArc, TaskId>,
}

impl Storage {
    pub fn new(small_preallocation: bool) -> Self {
        let map_capacity: usize = if small_preallocation {
            1024
        } else {
            1024 * 1024
        };

        let map = TaskMap::new(map_capacity);
        Self {
            snapshot_mode: AtomicBool::new(false),
            snapshot_writers: AtomicUsize::new(0),
            modified_count: AtomicU64::new(0),
            dirty_tasks: ConcurrentQueue::bounded(DIRTY_QUEUE_LIMIT),
            dirty_overflow: AtomicBool::new(false),
            snapshots: FxDashMap::default(),
            map,
            restored: Event::new(|| || "Storage::restored".to_string()),
            task_cache: FxDashMap::default(),
        }
    }

    /// Promote `modified_during_snapshot` → `modified` flags on a task, and increment the
    /// per-shard modified count if the task was not already marked as modified.
    ///
    /// This is used after persisting a snapshot: _during_snapshot flags represent changes
    /// that occurred concurrently and were not included in the persisted snapshot, so they
    /// must be carried forward as `modified` for the next snapshot cycle.
    fn promote_during_snapshot_flags(&self, task_id: TaskId, task: &mut TaskStorage) {
        let already_modified = task.flags.any_modified();
        let mut promoted = false;
        if task.flags.meta_modified_during_snapshot() {
            task.flags.set_meta_modified_during_snapshot(false);
            task.flags.set_meta_modified(true);
            promoted = true;
        }
        if task.flags.data_modified_during_snapshot() {
            task.flags.set_data_modified_during_snapshot(false);
            task.flags.set_data_modified(true);
            promoted = true;
        }
        if !already_modified && promoted {
            self.mark_dirty(task_id);
        }
    }

    /// Publish one task's transition from clean to modified into the hybrid snapshot worklist.
    fn mark_dirty(&self, task_id: TaskId) {
        self.modified_count.fetch_add(1, Ordering::Relaxed);
        if let Err(PushError::Full(_)) = self.dirty_tasks.push(task_id) {
            self.dirty_overflow.store(true, Ordering::Relaxed);
        }
    }

    fn unmark_dirty(&self) {
        // A snapshot may already have claimed and reset the global count. Saturating at zero keeps
        // an undo/discard that crosses that claim from wrapping the hint to u64::MAX.
        let _ = self
            .modified_count
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |count| {
                count.checked_sub(1)
            });
    }

    /// Mark a newly allocated task as restored (skip DB queries) and new (include in persistence
    /// snapshots). Optionally sets the `persistent_task_type` eagerly so it's available for
    /// persistence snapshots without needing to propagate it through `connect_child`.
    pub fn initialize_new_task(&self, task_id: TaskId, task_type: Option<CachedTaskTypeArc>) {
        let mut task = self.access_mut(task_id);
        task.flags.set_restored(TaskDataCategory::All);
        task.flags.set_new_task(true);
        if let Some(task_type) = task_type {
            task.set_persistent_task_type(task_type);
            if !task_id.is_transient() {
                // Unconditional track: a new task's type is always a real persistable change.
                let _ =
                    task.track_modification(SpecificTaskDataCategory::Data, "persistent_task_type");
            }
        }
    }

    /// Processes every modified item (resp. a snapshot of it) with the given function and returns
    /// the results. Ends snapshot mode when the returned `SnapshotGuard` (held by each shard) is
    /// dropped.
    ///
    /// `process` is called while holding the task's intrusive lock, so it can access TaskStorage
    /// directly without cloning.
    ///
    /// The process callback receives a mutable scratch buffer reused across iterations.
    ///
    /// The returned batches implement `IntoIterator`. The input scan seeds cache-friendly ID
    /// batches into `scope_unbounded_with`; each worker independently pins, locks, and revalidates
    /// tasks within its batch.
    ///
    /// When `drain_entries` is true (shutdown only), unmodified tasks are removed during the scan;
    /// modified tasks are removed after their snapshot item is serialized.
    pub fn take_snapshot<
        'l,
        P: for<'a> Fn(TaskId, &'a TaskStorage, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
    >(
        &'l self,
        guard: SnapshotGuard<'l>,
        process: &'l P,
        drain_entries: bool,
    ) -> Vec<SnapshotShard<'l, P>> {
        let guard = Arc::new(guard);
        let modified_count = self.modified_count.swap(0, Ordering::Relaxed);
        if modified_count == 0 && !drain_entries {
            return Vec::new();
        }

        let overflow = self.dirty_overflow.swap(false, Ordering::Relaxed);
        let mut queued = Vec::with_capacity(modified_count.min(DIRTY_QUEUE_LIMIT as u64) as usize);
        while let Ok(task_id) = self.dirty_tasks.pop() {
            queued.push(task_id);
        }
        let task_ids = if drain_entries || overflow {
            self.map.task_ids()
        } else {
            queued
        };
        const SNAPSHOT_SCAN_BATCH_SIZE: usize = 256;
        let scan_batches = task_ids
            .chunks(SNAPSHOT_SCAN_BATCH_SIZE)
            .map(<[TaskId]>::to_vec)
            .collect::<Vec<_>>();
        let mut modified = turbo_tasks::scope_unbounded::scope_unbounded_with(
            scan_batches,
            Vec::new,
            |_, task_ids, modified| {
                for task_id in task_ids {
                    if let Some(task) = self.map.get(task_id) {
                        if task.flags.any_modified() {
                            debug_assert!(
                                !task_id.is_transient(),
                                "found a modified transient task: {task_id:?}"
                            );
                            modified.push(task_id);
                        } else if drain_entries {
                            self.map.remove_locked(&task);
                        }
                    }
                }
                std::ops::ControlFlow::Continue(())
            },
            |mut left, mut right| {
                left.append(&mut right);
                left
            },
        );

        // The bounded queue intentionally tolerates stale entries after undo/re-modify cycles.
        // Multiple queued copies can all appear modified during this scan, so collapse them before
        // creating iterators to preserve one persistence record per task.
        modified.sort_unstable();
        modified.dedup();

        const SNAPSHOT_BATCH_SIZE: usize = 1024;
        modified
            .chunks(SNAPSHOT_BATCH_SIZE)
            .map(|task_ids| SnapshotShard {
                work: if drain_entries {
                    ShardWork::Drain(task_ids.to_vec())
                } else {
                    ShardWork::Keep(task_ids.to_vec())
                },
                storage: self,
                process,
                _guard: guard.clone(),
            })
            .collect()
    }

    /// Enter snapshot mode and return a guard that will call `end_snapshot` on drop.
    ///
    /// Returns whether any task is believed to have modifications. The count is reset only when
    /// `take_snapshot` begins its protected scan.
    ///
    /// Safety invariant: `start_snapshot` and `end_snapshot` are always called
    /// sequentially within a single `snapshot_and_persist` invocation (the sole
    /// caller). There is no concurrent snapshot lifecycle, so they cannot race.
    pub fn start_snapshot(&self) -> (SnapshotGuard<'_>, bool) {
        // Enter snapshot mode first so concurrent modifications switch to the during-snapshot
        // path and stop incrementing the pre-snapshot count.
        self.snapshot_mode.store(true, Ordering::SeqCst);
        let has_modifications = self.modified_count.load(Ordering::Relaxed) > 0;
        (SnapshotGuard::new(self), has_modifications)
    }

    /// End snapshot mode.
    ///
    /// Modified/new flags are cleared incrementally in `SnapshotShardIter::next`, so no full-map
    /// scan is needed here.
    ///
    /// This method only needs to:
    /// 1. Leave snapshot mode so new modifications go to the modified flags directly.
    /// 2. Promote `modified_during_snapshot` → `modified` for tasks that were accessed during
    ///    snapshot mode (tracked in the small `snapshots` map).
    fn end_snapshot(&self) {
        // Leave snapshot mode first. After this, concurrent track_modification calls
        // will set modified flags directly instead of going through the snapshots map.
        self.snapshot_mode.store(false, Ordering::SeqCst);
        let mut spins = 0;
        while self.snapshot_writers.load(Ordering::SeqCst) != 0 {
            if spins < 64 {
                std::hint::spin_loop();
                spins += 1;
            } else {
                std::thread::yield_now();
                spins = 0;
            }
        }

        // First collect and detach snapshots without holding any task locks. All DashMap guards
        // are dropped before resident tasks are resolved, so no reverse lock cycle is possible.
        let keys: Vec<TaskId> = self.snapshots.iter().map(|entry| *entry.key()).collect();
        self.snapshots.clear();

        parallel::for_each(&keys, |&key| {
            if let Some(mut task) = self.access_existing_mut(key) {
                self.promote_during_snapshot_flags(key, &mut task);
            }
        });
    }

    /// Returns true if actively snapshotting (modifications should go to snapshots map).
    /// Returns false if inactive (modifications go to modified list).
    fn snapshot_mode(&self) -> bool {
        self.snapshot_mode.load(Ordering::SeqCst)
    }

    fn try_begin_snapshot_write(&self) -> Option<SnapshotWriterGuard<'_>> {
        self.snapshot_writers.fetch_add(1, Ordering::SeqCst);
        if self.snapshot_mode() {
            Some(SnapshotWriterGuard {
                writers: &self.snapshot_writers,
            })
        } else {
            self.snapshot_writers.fetch_sub(1, Ordering::SeqCst);
            None
        }
    }

    pub fn access_mut(&self, key: TaskId) -> StorageWriteGuard<'_> {
        StorageWriteGuard {
            storage: self,
            inner: self.map.get_or_insert(key),
        }
    }

    pub(crate) fn access_existing_mut(&self, key: TaskId) -> Option<StorageWriteGuard<'_>> {
        Some(StorageWriteGuard {
            storage: self,
            inner: self.map.get(key)?,
        })
    }

    /// Read-only access to an already resident task. Returns `None` if the task isn't memory
    /// resident. The closure runs while the task lock and Papaya protection are held, so it must be
    /// cheap and must not re-enter this task or the map.
    pub fn with_task<R>(&self, key: TaskId, f: impl FnOnce(&TaskStorage) -> R) -> Option<R> {
        let task = self.access_existing_mut(key)?;
        Some(f(&task))
    }

    /// The number of **persistent** (non-transient) tasks resident in the map. Use this to assert
    /// GC returns to a flat baseline across re-rooting: GC never collects transient tasks (e.g.
    /// `run_once`/Once roots), so their count is not expected to settle.
    #[doc(hidden)]
    pub fn resident_persistent_task_count_for_testing(&self) -> usize {
        self.map
            .task_ids()
            .into_iter()
            .filter(|task_id| !task_id.is_transient())
            .count()
    }

    /// Snapshot the IDs used to seed GC's unbounded work scope. Workers independently pin, lock,
    /// and revalidate each task before applying the cheap collectibility filter.
    pub fn gc_task_ids(&self) -> Vec<TaskId> {
        self.map
            .task_ids()
            .into_iter()
            .filter(|task_id| !task_id.is_transient())
            .collect()
    }

    pub fn gc_scan_batch(&self, task_ids: &[TaskId], mut on_candidate: impl FnMut(TaskId)) {
        self.map.for_each_locked(task_ids, |task_id, task| {
            if task.gc_maybe_collectible() {
                on_candidate(task_id);
            }
        });
    }

    pub fn access_pair_mut(
        &self,
        key1: TaskId,
        key2: TaskId,
    ) -> (StorageWriteGuard<'_>, StorageWriteGuard<'_>) {
        assert_ne!(key1, key2, "cannot mutably access the same task twice");
        if key1 < key2 {
            let first = self.access_mut(key1);
            let second = self.access_mut(key2);
            (first, second)
        } else {
            let second = self.access_mut(key2);
            let first = self.access_mut(key1);
            (first, second)
        }
    }

    pub fn drop_contents(&self) {
        self.map.clear();
        drop_contents(&self.snapshots);
    }

    /// Drop the `task_cache` map, freeing its memory.
    pub(crate) fn drop_task_cache(&self) {
        drop_contents(&self.task_cache);
    }

    /// Evict tasks from in-memory storage after a successful snapshot.
    ///
    /// Iterates all tasks and applies the eviction level returned by
    /// `TaskStorage::evictability()`:
    /// - `Full`: remove from map entirely
    /// - `DataAndMeta`: drop both data and meta fields, keep task in map
    /// - `DataOnly`: drop data fields only
    /// - `MetaOnly`: drop meta fields only
    /// - `No`: skip
    ///
    /// Must be called when NOT in snapshot mode (i.e., after `end_snapshot()`).
    pub fn evict_after_snapshot(&self, parent_span: Option<Id>) -> EvictionCounts {
        let span = tracing::trace_span!(
            parent: parent_span,
            "evict_after_snapshot",
            total_task_cache_keys = self.task_cache.len(),
            total_map_keys = self.map.len(),
            counts = tracing::field::Empty,
        )
        .entered();
        debug_assert!(
            !self.snapshot_mode(),
            "evict_after_snapshot must not be called during snapshot mode"
        );

        let totals = turbo_tasks::scope_unbounded::scope_unbounded_with(
            self.map.task_ids(),
            EvictionCounts::default,
            |_, task_id, evicted| {
                let Some(mut task) = self.access_existing_mut(task_id) else {
                    return std::ops::ControlFlow::Continue(());
                };
                if task_id.is_transient() {
                    evicted.unevictable_reasons[UnevictableReason::Transient.index()] += 1;
                    return std::ops::ControlFlow::Continue(());
                }

                let mut remove_task = false;
                let mut task_type_to_remove = None;
                if task.flags.deleted() {
                    task_type_to_remove = Some(
                        task.get_persistent_task_type()
                            .expect("GC deleted tasks must have a task type")
                            .clone(),
                    );
                    evicted.full += 1;
                    remove_task = true;
                } else {
                    let (key_evictability, value_evictability) = task.evictability();
                    if key_evictability == KeyEvictability::Evictable {
                        task_type_to_remove =
                            Some(task.get_persistent_task_type().unwrap().clone());
                    }
                    match value_evictability {
                        ValueEvictability::Evictable { meta, data } => {
                            match task.drop_partial(data, meta) {
                                DropPartialOutcome::Empty => {
                                    evicted.full += 1;
                                    remove_task = true;
                                }
                                DropPartialOutcome::HasResidue => {
                                    if data && meta {
                                        evicted.data_and_meta += 1;
                                    } else if data {
                                        evicted.data_only += 1;
                                    } else {
                                        debug_assert!(meta);
                                        evicted.meta_only += 1;
                                    }
                                }
                            }
                        }
                        ValueEvictability::Unevictable(reason) => {
                            evicted.unevictable_reasons[reason.index()] += 1;
                        }
                    }
                }
                if remove_task {
                    self.map.remove_locked(&task.inner);
                }
                // Persistent task creation takes task_cache before acquiring a task lock. Release
                // the task lock before removing the inverse cache entry to preserve that order.
                drop(task);
                if let Some(task_type) = task_type_to_remove
                    && self.task_cache.remove(task_type.as_ref()).is_some()
                {
                    evicted.key_evictions += 1;
                }
                std::ops::ControlFlow::Continue(())
            },
            |mut left, right| {
                left += right;
                left
            },
        );
        // Reclaim task_cache table slack after broad key eviction.
        if totals.key_evictions > self.task_cache.len() {
            parallel::for_each(self.task_cache.shards(), |shard| {
                let mut shard = shard.write();
                let len = shard.len();
                if shard.capacity() > len * 2 {
                    shard.shrink_to(len, |(key, _)| self.task_cache.hasher().hash_one(key));
                }
            });
        }
        span.record("counts", tracing::field::display(&totals));

        totals
    }
}

struct SnapshotWriterGuard<'a> {
    writers: &'a AtomicUsize,
}

impl Drop for SnapshotWriterGuard<'_> {
    fn drop(&mut self) {
        self.writers.fetch_sub(1, Ordering::SeqCst);
    }
}

pub struct StorageWriteGuard<'a> {
    storage: &'a Storage,
    inner: TaskMapGuard<'a>,
}

impl StorageWriteGuard<'_> {
    /// Tracks mutation of this task.
    #[inline(always)]
    pub fn track_modification(
        &mut self,
        category: SpecificTaskDataCategory,
        #[allow(unused_variables)] name: &str,
    ) -> TrackOutcome {
        debug_assert!(
            !self.inner.key().is_transient(),
            "transient task_ids should never be enqueued to be persisted"
        );
        self.track_modification_internal(
            category,
            #[cfg(feature = "trace_task_modification")]
            name,
        )
    }

    fn track_modification_internal(
        &mut self,
        category: SpecificTaskDataCategory,
        #[cfg(feature = "trace_task_modification")] name: &str,
    ) -> TrackOutcome {
        // Transient tasks are never persisted, so tracking modifications is meaningless.
        // All callers (TaskGuard, invalidate_serialization) already
        // guard against this, but we enforce it here as defense-in-depth.
        debug_assert!(
            !self.inner.key().is_transient(),
            "track_modification called on transient task {:?}",
            self.inner.key()
        );
        let flags = &self.flags;
        if flags.is_modified_during_snapshot(category) {
            // We can early return since `end_snapshot` is responsible for reconciling.
            return TrackOutcome::NoChange;
        }
        let modified = flags.is_modified(category);
        #[cfg(feature = "trace_task_modification")]
        let _span = (!modified).then(|| tracing::trace_span!("mark_modified", name).entered());
        if self.storage.snapshot_mode()
            && let Some(_writer) = self.storage.try_begin_snapshot_write()
        {
            // Registration plus the SeqCst mode recheck guarantees end_snapshot cannot drain the
            // marker map until this publication is complete.
            let inserted_snapshot = !flags.any_modified_during_snapshot();
            if inserted_snapshot {
                let snapshot = if modified {
                    // Snapshot all non-transient fields, carrying the modified bits into the copy
                    // so the iterator knows which categories to persist.
                    let mut snapshot = self.clone_snapshot();
                    snapshot.flags.set_data_modified(flags.data_modified());
                    snapshot.flags.set_meta_modified(flags.meta_modified());
                    snapshot.flags.set_new_task(flags.new_task());
                    Some(Box::new(snapshot))
                } else {
                    None
                };
                self.storage.snapshots.insert(*self.inner.key(), snapshot);
            }
            self.flags.set_modified_during_snapshot(category, true);
            return TrackOutcome::TrackedDuringSnapshot {
                category,
                inserted_snapshot,
            };
        }

        if modified {
            return TrackOutcome::NoChange;
        }
        let bumped = !flags.any_modified();
        self.flags.set_modified(category, true);
        if bumped {
            // Publish work only after the protected state is visible. A racing snapshot can then
            // at worst defer this task to its next cycle; it cannot consume an unmarked task.
            self.storage.mark_dirty(*self.inner.key());
        }
        TrackOutcome::Tracked { category, bumped }
    }

    /// Reverse a [`TrackOutcome`] produced by [`Self::track_modification`] when the mutation it
    /// guarded changed nothing persistable.
    ///
    /// # Correctness
    ///
    /// The `outcome` MUST be applied to the **same `StorageWriteGuard`** that produced it, with the
    /// task's intrusive lock and map shard read guard held continuously in between — i.e.
    /// `track_modification`, the mutation, and `undo_track_modification` all run within one guard's
    /// lifetime. This guarantees no other thread observed the task's tracked state, and that
    /// `bumped` / `inserted_snapshot` still describe reality. Because those flags record whether
    /// *this* call created the state, undo never clears a flag, counter, or snapshot entry that a
    /// prior modification owns.
    pub fn undo_track_modification(&mut self, outcome: TrackOutcome) {
        match outcome {
            TrackOutcome::NoChange => {}
            TrackOutcome::Tracked { category, bumped } => {
                self.flags.set_modified(category, false);
                if bumped {
                    self.storage.unmark_dirty();
                }
            }
            TrackOutcome::TrackedDuringSnapshot {
                category,
                inserted_snapshot,
            } => {
                self.flags.set_modified_during_snapshot(category, false);
                if inserted_snapshot {
                    self.storage.snapshots.remove(self.inner.key());
                }
            }
        }
    }

    /// Clears all modified/new flags for a GC-collected task that was **never persisted**
    /// (`new_task`).
    pub fn discard_modifications_for_gc_new_task(&mut self) {
        debug_assert!(
            !self.storage.snapshot_mode(),
            "discard_modifications_for_gc_new_task must run before the snapshot starts"
        );
        debug_assert!(
            self.flags.new_task(),
            "only a never-persisted (new_task) collected task may be discarded this way"
        );
        if self.flags.any_modified() {
            self.storage.unmark_dirty();
        }
        self.flags.set_meta_modified(false);
        self.flags.set_data_modified(false);
        self.flags.set_new_task(false);
    }
}

impl Deref for StorageWriteGuard<'_> {
    type Target = TaskStorage;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl DerefMut for StorageWriteGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

/// How big of a buffer to allocate initially. Based on metrics from a large
/// application this should cover about 98% of values with no resizes.
const SCRATCH_BUFFER_INITIAL_SIZE: usize = 4096;

/// State machine for a per-thread scratch buffer slot.
///
/// Transitions:
/// - `Uninit` → `Taken` (first take)
/// - `Available` → `Taken` (subsequent takes)
/// - `Taken` → `Available` (return)
///
/// Any other transition is a bug (e.g. double-take or double-return).
#[derive(Default)]
enum ScratchBufferSlot {
    /// No buffer has been allocated on this thread yet.
    #[default]
    Uninit,
    /// The buffer is currently checked out.
    Taken,
    /// The buffer is available for reuse.
    Available(TurboBincodeBuffer),
}

pub struct SnapshotGuard<'l> {
    storage: &'l Storage,
    /// Per-thread scratch buffers for encoding task data. Buffers are taken
    /// by `SnapshotShardIter` on creation and returned on drop, allowing reuse
    /// across multiple shards processed by the same thread. When the guard is
    /// dropped (after all iterators are done), the `ThreadLocal` drops too,
    /// freeing all buffers.
    scratch_buffers: ThreadLocal<Cell<ScratchBufferSlot>>,
}

impl<'l> SnapshotGuard<'l> {
    fn new(storage: &'l Storage) -> Self {
        Self {
            storage,
            scratch_buffers: ThreadLocal::new(),
        }
    }

    fn take_scratch_buffer(&self) -> TurboBincodeBuffer {
        let cell = self.scratch_buffers.get_or_default();
        match cell.take() {
            ScratchBufferSlot::Available(buf) => {
                cell.set(ScratchBufferSlot::Taken);
                buf
            }
            ScratchBufferSlot::Uninit => {
                cell.set(ScratchBufferSlot::Taken);
                TurboBincodeBuffer::with_capacity(SCRATCH_BUFFER_INITIAL_SIZE)
            }
            ScratchBufferSlot::Taken => {
                panic!("scratch buffer taken twice without being returned");
            }
        }
    }

    fn return_scratch_buffer(&self, buffer: TurboBincodeBuffer) {
        let cell = self.scratch_buffers.get_or_default();
        match cell.take() {
            ScratchBufferSlot::Taken => cell.set(ScratchBufferSlot::Available(buffer)),
            ScratchBufferSlot::Available(_) => {
                panic!("scratch buffer returned without being taken (already available)");
            }
            ScratchBufferSlot::Uninit => {
                panic!("scratch buffer returned without being taken (uninit)");
            }
        }
    }
}

impl Drop for SnapshotGuard<'_> {
    fn drop(&mut self) {
        self.storage.end_snapshot();
    }
}

/// A snapshot batch with its structural-removal mode encoded in the data.
enum ShardWork {
    /// Normal snapshot: serialize each still-resident task, then clear/promote its flags.
    Keep(Vec<TaskId>),
    /// Shutdown drain: serialize each still-resident modified task and remove that exact entry.
    Drain(Vec<TaskId>),
}

pub struct SnapshotShard<'l, P> {
    work: ShardWork,
    storage: &'l Storage,
    process: &'l P,
    /// Held for its `Drop` impl — ensures snapshot mode ends when all shards are done.
    _guard: Arc<SnapshotGuard<'l>>,
}

impl<'l, P> IntoIterator for SnapshotShard<'l, P>
where
    P: Fn(TaskId, &TaskStorage, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
{
    type Item = SnapshotItem;
    type IntoIter = SnapshotShardIter<'l, P>;

    fn into_iter(self) -> Self::IntoIter {
        let buffer = self._guard.take_scratch_buffer();
        SnapshotShardIter {
            shard: self,
            buffer,
        }
    }
}

/// Iterator over a single shard's snapshot items. Holds a thread-local scratch
/// buffer for the duration of iteration and returns it on drop.
pub struct SnapshotShardIter<'l, P> {
    shard: SnapshotShard<'l, P>,
    buffer: TurboBincodeBuffer,
}

impl<'l, P> Iterator for SnapshotShardIter<'l, P>
where
    P: Fn(TaskId, &TaskStorage, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
{
    type Item = SnapshotItem;

    fn next(&mut self) -> Option<Self::Item> {
        let process = self.shard.process;
        let snapshots = &self.shard.storage.snapshots;
        let buffer = &mut self.buffer;
        let mut serialize_task = |task_id: TaskId, inner: &TaskStorage| {
            // If the task was re-modified during snapshot, the snapshots map may
            // hold a pre-modification copy we must serialize instead of the live
            // data. Remove the entry so end_snapshot doesn't double-promote it;
            // we promote manually below.
            if inner.flags.any_modified_during_snapshot() {
                match snapshots.remove(&task_id) {
                    Some((_, Some(snapshot))) => process(task_id, &snapshot, buffer),
                    Some((_, None)) | None => process(task_id, inner, buffer),
                }
            } else {
                process(task_id, inner, buffer)
            }
        };

        loop {
            let (task_id, drain) = match &mut self.shard.work {
                ShardWork::Keep(modified) => (modified.pop()?, false),
                ShardWork::Drain(modified) => (modified.pop()?, true),
            };
            let Some(mut inner) = self.shard.storage.access_existing_mut(task_id) else {
                continue;
            };
            let item = serialize_task(task_id, &inner);
            if drain {
                // Remove only the exact entry protected and locked by this guard. A concurrent
                // reinsertion for the same TaskId must not be removed.
                self.shard.storage.map.remove_locked(&inner.inner);
            } else {
                // Clear the modified flags captured into the snapshot, then promote modifications
                // that raced the snapshot so the task remains dirty for the next cycle.
                inner.flags.set_data_modified(false);
                inner.flags.set_meta_modified(false);
                inner.flags.set_new_task(false);
                self.shard
                    .storage
                    .promote_during_snapshot_flags(task_id, &mut inner);
            }
            return Some(item);
        }
    }
}

impl<P> Drop for SnapshotShardIter<'_, P> {
    fn drop(&mut self) {
        match &mut self.shard.work {
            ShardWork::Keep(task_ids) => {
                // take_snapshot claimed the original dirty work before producing this iterator.
                // Re-publish unconsumed tasks so an early persistence error cannot lose them.
                for task_id in task_ids.drain(..) {
                    if let Some(task) = self.shard.storage.access_existing_mut(task_id)
                        && task.flags.any_modified()
                    {
                        self.shard.storage.mark_dirty(task_id);
                    }
                }
            }
            ShardWork::Drain(task_ids) => {
                for task_id in task_ids.drain(..) {
                    if let Some(task) = self.shard.storage.access_existing_mut(task_id) {
                        self.shard.storage.map.remove_locked(&task.inner);
                    }
                }
            }
        }
        self.shard
            ._guard
            .return_scratch_buffer(std::mem::take(&mut self.buffer));
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Barrier, atomic::Ordering, mpsc},
        thread,
        time::Duration,
    };

    use turbo_bincode::TurboBincodeBuffer;
    use turbo_tasks::TaskId;

    use super::{DIRTY_QUEUE_LIMIT, SpecificTaskDataCategory, Storage, TrackOutcome};
    use crate::backing_storage::SnapshotItem;

    fn non_transient_task(id: u32) -> TaskId {
        // TRANSIENT_TASK_BIT is 0x2000_0000; any id without that bit is non-transient.
        TaskId::new(id).expect("id must be non-zero")
    }

    fn task_pair() -> (TaskId, TaskId) {
        (non_transient_task(1), non_transient_task(2))
    }

    fn snapshot_value(storage: &Storage, task_id: TaskId) -> Option<bool> {
        storage.snapshots.get(&task_id).map(|value| value.is_some())
    }

    #[test]
    fn unrelated_tasks_lock_independently() {
        let storage = Arc::new(Storage::new(true));
        let (task1, task2) = task_pair();
        drop(storage.access_mut(task2));
        let task1_guard = storage.access_mut(task1);
        let (tx, rx) = mpsc::sync_channel(1);
        let other = storage.clone();
        let join = thread::spawn(move || {
            drop(other.access_mut(task2));
            tx.send(()).unwrap();
        });
        rx.recv_timeout(Duration::from_secs(2))
            .expect("a different task in the same shard should not share its task lock");
        drop(task1_guard);
        join.join().unwrap();
    }

    #[test]
    fn same_task_lock_excludes_another_accessor() {
        let storage = Arc::new(Storage::new(true));
        let task = non_transient_task(1);
        let guard = storage.access_mut(task);
        let (tx, rx) = mpsc::sync_channel(1);
        let other = storage.clone();
        let join = thread::spawn(move || {
            drop(other.access_mut(task));
            tx.send(()).unwrap();
        });
        assert!(rx.recv_timeout(Duration::from_millis(50)).is_err());
        drop(guard);
        rx.recv_timeout(Duration::from_secs(2)).unwrap();
        join.join().unwrap();
    }

    #[test]
    fn concurrent_first_access_inserts_one_task() {
        let storage = Arc::new(Storage::new(true));
        let task = non_transient_task(1);
        let barrier = Arc::new(Barrier::new(8));
        let joins: Vec<_> = (0..8)
            .map(|_| {
                let storage = storage.clone();
                let barrier = barrier.clone();
                thread::spawn(move || {
                    barrier.wait();
                    drop(storage.access_mut(task));
                })
            })
            .collect();
        for join in joins {
            join.join().unwrap();
        }
        assert_eq!(storage.map.len(), 1);
    }

    #[test]
    fn structural_remove_waits_for_task_guard() {
        let storage = Arc::new(Storage::new(true));
        let task = non_transient_task(1);
        let guard = storage.access_mut(task);
        let (tx, rx) = mpsc::sync_channel(1);
        let other = storage.clone();
        let join = thread::spawn(move || {
            let removed = other.map.remove(task);
            tx.send(removed).unwrap();
        });
        assert!(rx.recv_timeout(Duration::from_millis(50)).is_err());
        drop(guard);
        assert!(rx.recv_timeout(Duration::from_secs(2)).unwrap());
        join.join().unwrap();
    }

    #[test]
    fn pair_access_supports_opposing_order() {
        let storage = Arc::new(Storage::new(true));
        let (task1, task2) = task_pair();
        let barrier = Arc::new(Barrier::new(2));
        let (tx, rx) = mpsc::sync_channel(2);
        let joins: Vec<_> = [(task1, task2), (task2, task1)]
            .into_iter()
            .map(|(first, second)| {
                let storage = storage.clone();
                let barrier = barrier.clone();
                let tx = tx.clone();
                thread::spawn(move || {
                    barrier.wait();
                    let (first_guard, second_guard) = storage.access_pair_mut(first, second);
                    assert_eq!(*first_guard.inner.key(), first);
                    assert_eq!(*second_guard.inner.key(), second);
                    drop((first_guard, second_guard));
                    tx.send(()).unwrap();
                })
            })
            .collect();
        drop(tx);
        rx.recv_timeout(Duration::from_secs(2)).unwrap();
        rx.recv_timeout(Duration::from_secs(2)).unwrap();
        for join in joins {
            join.join().unwrap();
        }
    }

    /// A process fn that returns a non-empty SnapshotItem so the iterator doesn't
    /// silently skip items via the "encoding failed" error path.
    fn dummy_process(
        task_id: TaskId,
        _: &super::TaskStorage,
        _: &mut TurboBincodeBuffer,
    ) -> SnapshotItem {
        SnapshotItem::Put {
            task_id,
            meta: Some(TurboBincodeBuffer::default()),
            data: None,
            task_type_hash: None,
        }
    }

    /// Regression test: a task modified before a snapshot and then modified *again* during
    /// snapshot iteration must serialize the pre-snapshot state and carry the during-snapshot
    /// modification forward to the next cycle.
    ///
    /// Sequence of events:
    /// 1. Task is modified (data_modified = true) → increments modified_count.
    /// 2. `start_snapshot` puts us in snapshot mode.
    /// 3. `take_snapshot` scans the shard: task has `any_modified()=true` → goes into the
    ///    `modified` list.
    /// 4. **Between scan and iteration**: `track_modification` is called on the same category. This
    ///    is the `(true, true)` branch: already modified AND in snapshot mode. A snapshot copy of
    ///    the pre-second-modification state is stored in `snapshots` as `Some(copy)`, and
    ///    `data_modified_during_snapshot` is set.
    /// 5. `SnapshotShardIter::next` processes the task from the `modified` list, detects
    ///    `any_modified_during_snapshot()=true`, finds the `Some(copy)` in `snapshots`, encodes the
    ///    pre-snapshot copy, clears the live modified flags, removes the snapshots entry, and
    ///    promotes `data_modified_during_snapshot → data_modified` for the next cycle.
    // `end_snapshot` uses `parallel::for_each` which calls `block_in_place` internally,
    // requiring a multi-threaded Tokio runtime.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_during_snapshot_clears_live_modified_flags() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        // Step 1: modify the task outside snapshot mode (data_modified = true).
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }

        // Step 2: enter snapshot mode.
        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        // Step 3: `take_snapshot` scans the shard. At this point the task has
        // `any_modified()=true` and `any_modified_during_snapshot()=false`, so it
        // goes into the `modified` list inside the returned `SnapshotShard`.
        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, false);

        // Step 4: now that the scan is done but before we consume the iterator,
        // modify the task again. We're still in snapshot mode, the task is already
        // modified → `(true, true)` branch: creates a snapshot copy (carrying the
        // modified bits) and sets `data_modified_during_snapshot=true`.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            // We should have set a snapshot bit
            assert!(guard.flags.data_modified_during_snapshot())
        }

        // Step 5: consume the iterator. The iterator encodes from the pre-snapshot copy,
        // clears the live modified flags, removes the snapshots entry, and promotes
        // `data_modified_during_snapshot → data_modified` for the next cycle.
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();

        // The pre-snapshot snapshot copy should have been encoded and returned.
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), task_id);

        {
            let guard = storage.access_mut(task_id);
            // The iterator should have promoted modified_during_snapshot → modified.
            assert!(guard.flags.data_modified());
        }

        // The during-snapshot modification must be reflected in modified_count so
        // the next snapshot cycle picks it up. Verify by starting another snapshot.
        let (_guard2, has_modifications) = storage.start_snapshot();
        assert!(
            has_modifications,
            "modified_count must be non-zero after promoting modified_during_snapshot"
        );
    }

    /// Regression test for the `(true, false)` during-snapshot case: a task modified in one
    /// category before a snapshot, then modified in a *different* category during snapshot
    /// iteration, must not panic and must carry both modifications forward correctly.
    ///
    /// Sequence of events:
    /// 1. Task meta is modified (meta_modified = true).
    /// 2. `start_snapshot` puts us in snapshot mode.
    /// 3. `take_snapshot` scans the shard: task goes into the `modified` list.
    /// 4. Task data is modified during snapshot → `(true, false)` branch: data was not previously
    ///    modified, so `snapshots` gets a `None` entry and `data_modified_during_snapshot` is set.
    /// 5. `SnapshotShardIter::next` processes the task: finds `any_modified_during_snapshot()`,
    ///    sees `None` in snapshots, encodes from live data (correct — live data for the
    ///    unmodified-before-snapshot category is still the pre-snapshot state), clears pre-snapshot
    ///    flags, and promotes `data_modified_during_snapshot → data_modified`.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_different_category_during_snapshot() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        // Step 1: modify meta only, outside snapshot mode.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
            assert!(guard.flags.meta_modified());
            assert!(!guard.flags.data_modified());
        }

        // Step 2: enter snapshot mode.
        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        // Step 3: take_snapshot — task goes into modified list (meta_modified = true).
        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, false);

        // Step 4: modify data during snapshot. The `(true, false)` branch fires:
        // data was not previously modified, so snapshots gets a None entry.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(guard.flags.data_modified_during_snapshot());
            assert!(!guard.flags.meta_modified_during_snapshot());
        }

        // Step 5: consume the iterator — must not panic.
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), task_id);

        {
            let guard = storage.access_mut(task_id);
            // meta_modified was cleared by the iterator (it was the pre-snapshot flag).
            assert!(!guard.flags.meta_modified());
            // data_modified_during_snapshot was promoted to data_modified.
            assert!(guard.flags.data_modified());
            assert!(!guard.flags.data_modified_during_snapshot());
        }

        // Next snapshot cycle must pick up the promoted data_modified.
        let (_guard2, has_modifications) = storage.start_snapshot();
        assert!(
            has_modifications,
            "modified_count must be non-zero after promoting data_modified_during_snapshot"
        );
    }

    /// With `drain_entries = true` (shutdown path), the modified entries are moved out of the map
    /// (during the scan) and serialized by the iterator, freeing each task's memory as it is
    /// persisted rather than retaining it until the whole snapshot is written. Either way the
    /// entry must be gone from the map by the time the snapshot is consumed.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_entry_from_map() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        // Modify the task outside snapshot mode so it lands in the modified list.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        assert!(storage.map.contains(task_id));

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        // Take the snapshot in drain mode.
        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, true);

        // Consume the iterator: the task is serialized and then removed from the map.
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), task_id);

        // The entry must be gone from the map now that it has been persisted.
        assert!(
            !storage.map.contains(task_id),
            "task entry should be removed from the map after being persisted in drain mode"
        );
    }

    /// In drain mode, fully consuming the iterators removes every Papaya entry. Reclamation of
    /// retired nodes is deferred until protection guards have advanced.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_all_entries() {
        let storage = Storage::new(true);

        let task_ids: Vec<_> = (1..=256).map(non_transient_task).collect();
        for &task_id in &task_ids {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, true);
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();
        assert_eq!(items.len(), task_ids.len());

        assert_eq!(storage.map.len(), 0);
    }

    /// In drain mode, `take_snapshot` removes unmodified tasks immediately and leaves modified
    /// tasks protected in the map until their snapshot batch serializes and removes the exact
    /// entry.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_unmodified_during_take_snapshot() {
        let storage = Storage::new(true);
        let modified_id = non_transient_task(1);
        let unmodified_id = non_transient_task(2);

        // One modified task (gets serialized) and one unmodified task (e.g. restored from disk but
        // never dirtied) that just occupies memory and must not be serialized.
        {
            let mut guard = storage.access_mut(modified_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        // `access_mut` inserts an entry; leaving it without track_modification keeps it unmodified.
        let _ = storage.access_mut(unmodified_id);
        assert!(storage.map.contains(unmodified_id));

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, true);

        // Unmodified work is removed during the scan; modified work remains until serialized.
        assert!(
            !storage.map.contains(unmodified_id),
            "unmodified entry should be removed during take_snapshot in drain mode"
        );
        assert!(
            storage.map.contains(modified_id),
            "modified entry must remain protected until its snapshot item is serialized"
        );

        // Consuming the iterators yields only the modified task (the unmodified one was never part
        // of the snapshot).
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), modified_id);
        assert!(!storage.map.contains(modified_id));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn clean_snapshot_skips_resident_map_scan() {
        let storage = Storage::new(true);
        drop(storage.access_mut(non_transient_task(1)));
        let scans = storage.map.task_id_scan_count();
        let (guard, has_modifications) = storage.start_snapshot();
        assert!(!has_modifications);
        assert!(
            storage
                .take_snapshot(guard, &dummy_process, false)
                .is_empty()
        );
        assert_eq!(storage.map.task_id_scan_count(), scans);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stale_dirty_queue_entries_are_deduplicated() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);
        {
            let mut task = storage.access_mut(task_id);
            let outcome = task.track_modification(SpecificTaskDataCategory::Data, "first");
            task.undo_track_modification(outcome);
            let _ = task.track_modification(SpecificTaskDataCategory::Data, "second");
        }
        let (guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let items: Vec<_> = storage
            .take_snapshot(guard, &dummy_process, false)
            .into_iter()
            .flat_map(IntoIterator::into_iter)
            .collect();
        assert_eq!(items.len(), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn dirty_queue_overflow_falls_back_to_full_scan() {
        let storage = Storage::new(true);
        for id in 1..=(DIRTY_QUEUE_LIMIT as u32 + 1) {
            let mut task = storage.access_mut(non_transient_task(id));
            let _ = task.track_modification(SpecificTaskDataCategory::Data, "overflow");
        }
        let scans = storage.map.task_id_scan_count();
        let (guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let items: Vec<_> = storage
            .take_snapshot(guard, &dummy_process, false)
            .into_iter()
            .flat_map(IntoIterator::into_iter)
            .collect();
        assert_eq!(items.len(), DIRTY_QUEUE_LIMIT + 1);
        assert_eq!(storage.map.task_id_scan_count(), scans + 1);
    }

    #[test]
    fn dirty_counter_decrement_saturates_at_zero() {
        let storage = Storage::new(true);
        storage.unmark_dirty();
        assert_eq!(storage.modified_count.load(Ordering::Relaxed), 0);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn dropping_keep_iterator_requeues_unconsumed_tasks() {
        let storage = Storage::new(true);
        for id in 1..=2 {
            let mut task = storage.access_mut(non_transient_task(id));
            let _ = task.track_modification(SpecificTaskDataCategory::Data, "drop");
        }
        let (guard, _) = storage.start_snapshot();
        let mut batches = storage.take_snapshot(guard, &dummy_process, false);
        let mut iter = batches.pop().unwrap().into_iter();
        assert!(iter.next().is_some());
        drop(iter);
        drop(batches);

        let (guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let remaining: Vec<_> = storage
            .take_snapshot(guard, &dummy_process, false)
            .into_iter()
            .flat_map(IntoIterator::into_iter)
            .collect();
        assert_eq!(remaining.len(), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn undo_non_snapshot_reverses_flag_and_counter() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        {
            let mut guard = storage.access_mut(task_id);
            let outcome = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(guard.flags.data_modified());
            guard.undo_track_modification(outcome);
            assert!(!guard.flags.data_modified());
            assert!(!guard.flags.any_modified());
        }

        // Counter is back to zero: the next snapshot sees no modifications.
        let (_guard, has_modifications) = storage.start_snapshot();
        assert!(
            !has_modifications,
            "undo must decrement the dirty counter so no modifications remain"
        );
    }

    /// A second track on an already-modified category returns `NoChange`; undoing it is a no-op and
    /// must NOT clear the real modification recorded by the first track.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_nochange_preserves_prior_modification() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        let mut guard = storage.access_mut(task_id);
        // First track is the real modification.
        let _first = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        // Second track on the same category changes nothing.
        let second = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        assert!(matches!(second, TrackOutcome::NoChange));
        // Undoing the no-op must leave the prior modification intact.
        guard.undo_track_modification(second);
        assert!(
            guard.flags.data_modified(),
            "undoing a NoChange outcome must not clear a real prior modification"
        );
    }

    /// Undo only reverses the category it tracked: tracking Data then Meta, undoing only the Meta
    /// outcome must leave Data modified and the shard counter still non-zero.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_only_reverses_its_own_category() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        {
            let mut guard = storage.access_mut(task_id);
            let _data = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            let meta = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
            assert!(guard.flags.meta_modified());
            guard.undo_track_modification(meta);
            assert!(!guard.flags.meta_modified());
            assert!(guard.flags.data_modified());
        }

        // Data is still modified, so the counter is still non-zero.
        let (_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
    }

    /// During-snapshot `(true, false)` arm: a task unmodified-before-snapshot, tracked during
    /// snapshot, inserts a `None` marker into `snapshots` and sets the `_during_snapshot` bit.
    /// Undo must remove the marker and clear the bit.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_during_snapshot_true_false_removes_marker() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);
        // Insert the task (unmodified) so it exists in the map.
        let _ = storage.access_mut(task_id);

        let (_snapshot_guard, _) = storage.start_snapshot();

        let mut guard = storage.access_mut(task_id);
        let outcome = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        assert!(matches!(
            outcome,
            TrackOutcome::TrackedDuringSnapshot {
                inserted_snapshot: true,
                ..
            }
        ));
        assert!(guard.flags.data_modified_during_snapshot());
        assert!(snapshot_value(&storage, task_id).is_some());

        guard.undo_track_modification(outcome);
        assert!(!guard.flags.data_modified_during_snapshot());
        assert!(
            snapshot_value(&storage, task_id).is_none(),
            "undo must remove the snapshots marker it inserted"
        );
    }

    /// During-snapshot `(true, true)` arm: a task modified-before-snapshot, tracked again during
    /// snapshot, stores a pre-mutation copy in `snapshots`. Undo must remove that copy and clear
    /// the `_during_snapshot` bit, while leaving the pre-existing `modified` flag intact (it
    /// belongs to the snapshot, not to this call).
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_during_snapshot_true_true_removes_copy_preserves_modified() {
        let storage = Storage::new(true);
        let task_id = non_transient_task(1);

        // Modify before snapshot so the category is part of the snapshot.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }

        let (_snapshot_guard, _) = storage.start_snapshot();

        let mut guard = storage.access_mut(task_id);
        let outcome = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        assert!(matches!(
            outcome,
            TrackOutcome::TrackedDuringSnapshot {
                inserted_snapshot: true,
                ..
            }
        ));
        assert_eq!(snapshot_value(&storage, task_id), Some(true));

        guard.undo_track_modification(outcome);
        assert!(!guard.flags.data_modified_during_snapshot());
        assert!(
            guard.flags.data_modified(),
            "the pre-snapshot modification belongs to the snapshot and must survive undo"
        );
        assert!(
            snapshot_value(&storage, task_id).is_none(),
            "undo must remove the pre-mutation copy it inserted"
        );
    }
}
