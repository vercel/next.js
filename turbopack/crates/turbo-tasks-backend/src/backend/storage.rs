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

use thread_local::ThreadLocal;
use tracing::span::Id;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{FxDashMap, TaskId, backend::CachedTaskTypeArc, event::Event, parallel};

use crate::{
    backend::{
        dense_task_map::{TaskMap, TaskMapGuard},
        storage_schema::{
            DropPartialOutcome, KeyEvictability, TaskStorage, UnevictableReason, ValueEvictability,
        },
    },
    backing_storage::SnapshotItem,
    database::key_value_database::KeySpace,
    utils::{
        dash_map_drop_contents::drop_contents,
        dash_map_entry::{TryLockAndRemove, try_lock_and_remove},
    },
};

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
    /// incremented the per-chunk modified counter (i.e. the task had no prior modifications).
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
    /// Number of task writers that observed snapshot mode and may still insert into `snapshots`.
    snapshot_writers: AtomicUsize,
    /// Stores snapshots of task state for tasks accessed during snapshot mode.
    /// - `Some(snapshot)`: Task was modified before snapshot mode and accessed again during it.
    ///   Contains a copy of the pre-snapshot state that needs to be persisted.
    /// - `None`: Task was first modified during snapshot mode (not part of current snapshot). Will
    ///   be marked as modified at the beginning of the next snapshot cycle.
    ///
    /// Task locks are acquired before snapshot-map locks. `end_snapshot` first waits for writers
    /// that observed snapshot mode, then drains this map without task locks, and only afterward
    /// reacquires affected task locks; it never inverts that ordering.
    snapshots: FxDashMap<TaskId, Option<Box<TaskStorage>>>,
    /// The main storage map
    ///
    /// Lock Ordering: task creation acquires a `task_cache` lock before an individual task lock.
    /// Code that starts from a task lock must use non-blocking task-cache access or defer it.
    ///
    /// Lock Ordering vs. `snapshots`: an individual task lock is acquired before a `snapshots`
    /// shard lock. Pair access acquires task locks in ascending raw `TaskId` order.
    map: TaskMap<TaskStorage>,
    /// A shared event notified whenever any task finishes restoring (successfully or not).
    ///
    /// Threads waiting for another thread's in-progress restore subscribe to this event,
    /// then re-check the specific task's `restoring`/`restored` bits after waking.
    pub(crate) restored: Event,
    /// Maps `CachedTaskType` → `TaskId` for deduplication of persistent task creation.
    /// This is backed by the TaskCache table in the database.
    ///
    /// LockOrdering: See the comments on [map].
    pub task_cache: FxDashMap<CachedTaskTypeArc, TaskId>,
}

impl Storage {
    pub fn new(snapshot_shard_amount: usize, small_preallocation: bool) -> Self {
        Self {
            snapshot_mode: AtomicBool::new(false),
            snapshot_writers: AtomicUsize::new(0),
            snapshots: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                // We expect very few updates to this map since it will only happen when updates
                // race with snapshots.  This never happens in a build and only rarely happens in
                // dev sessions
                0,
                Default::default(),
                snapshot_shard_amount,
            ),
            map: TaskMap::new(small_preallocation),
            restored: Event::new(|| || "Storage::restored".to_string()),
            task_cache: FxDashMap::default(),
        }
    }

    /// Promote `modified_during_snapshot` → `modified` flags on a task, and increment the
    /// per-chunk modified count if the task was not already marked as modified.
    ///
    /// This is used after persisting a snapshot: _during_snapshot flags represent changes
    /// that occurred concurrently and were not included in the persisted snapshot, so they
    /// must be carried forward as `modified` for the next snapshot cycle.
    fn promote_during_snapshot_flags(&self, task: &mut TaskStorage, modified_count: &AtomicU64) {
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
            modified_count.fetch_add(1, Ordering::Relaxed);
        }
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
    /// the results. Ends snapshot mode when the returned `SnapshotGuard` (held by each chunk) is
    /// dropped.
    ///
    /// `process` is called while holding a read lock on the task storage, so it can access
    /// the TaskStorage directly without cloning.
    ///
    /// Both callbacks receive a mutable scratch buffer that can be reused across iterations
    /// to avoid repeated allocations.
    ///
    /// The returned chunk workers implement `IntoIterator`. Empty chunks are filtered out, but a
    /// worker may still yield no items if all entries produce
    /// empty `SnapshotItem`s (this is rare and only happens under error conditions).
    ///
    /// When `drain_entries` is true (shutdown only), the scan drains the map: unmodified entries
    /// are erased and freed immediately, and the modified entries are moved out into the
    /// returned chunk iterators, which free each task's memory as it is serialized rather than
    /// after the whole batch is written.
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

        let shards: Vec<Option<SnapshotShard<'l, P>>> = self.map.parallel_collect(|chunk| {
            // Once snapshot mode is active, new writes use the during-snapshot flags and do not
            // increment this counter. Each chunk can therefore be claimed independently.
            let modified_count = chunk.swap_modified_count().unwrap_or(0);
            if modified_count == 0 && !drain_entries {
                return None;
            }

            let work = if drain_entries {
                let mut entries = Vec::with_capacity(modified_count as usize);
                chunk.for_each_mut(|task| {
                    if task.flags.any_modified() {
                        let task_id = *task.key();
                        debug_assert!(
                            !task_id.is_transient(),
                            "found a modified transient task: {task_id:?}"
                        );
                        entries.push((task_id, task.take_and_vacate()));
                    } else {
                        // Unmodified tasks, including all transient tasks, can reset in place;
                        // only modified tasks need a detached value for persistence.
                        task.vacate();
                    }
                });
                if entries.is_empty() {
                    return None;
                }
                ShardWork::Drain(entries.into_iter())
            } else {
                let mut modified = Vec::with_capacity(modified_count as usize);
                chunk.for_each_mut(|task| {
                    if task.flags.any_modified() {
                        let task_id = *task.key();
                        debug_assert!(
                            !task_id.is_transient(),
                            "found a modified transient task: {task_id:?}"
                        );
                        modified.push(task_id);
                    }
                });
                debug_assert!(!modified.is_empty());
                ShardWork::Keep(modified)
            };

            Some(SnapshotShard {
                work,
                storage: self,
                process,
                _guard: guard.clone(),
            })
        });
        shards.into_iter().flatten().collect()
    }

    /// Enter snapshot mode and return a guard that will call `end_snapshot` on drop.
    ///
    /// Returns whether any chunk has modifications. Per-chunk counts are reset
    /// in `take_snapshot` as each chunk is processed, not here — resetting eagerly
    /// would lose track of modifications for chunks that haven't been persisted yet.
    ///
    /// Safety invariant: `start_snapshot` and `end_snapshot` are always called
    /// sequentially within a single `snapshot_and_persist` invocation (the sole
    /// caller). There is no concurrent snapshot lifecycle, so they cannot race.
    pub fn start_snapshot(&self) -> (SnapshotGuard<'_>, bool) {
        // Enter snapshot mode first so concurrent track_modification calls switch
        // to the _during_snapshot path and stop incrementing per-chunk counts.
        self.snapshot_mode.store(true, Ordering::SeqCst);
        // Don't reset counts here: take_snapshot claims them chunk by chunk.
        let has_modifications = self
            .map
            .chunks()
            .iter()
            .any(|chunk| chunk.modified_count() > 0);
        (SnapshotGuard::new(self), has_modifications)
    }

    /// End snapshot mode.
    ///
    /// Modified/new flags on tasks are cleared incrementally during snapshot iteration
    /// (in `take_snapshot` for direct_snapshots, and in `SnapshotShardIter::next` for
    /// modified tasks), so no full-map scan is needed here.
    ///
    /// This method only needs to:
    /// 1. Leave snapshot mode so new modifications go to the modified flags directly.
    /// 2. Promote `modified_during_snapshot` → `modified` for tasks that were accessed during
    ///    snapshot mode (tracked in the small `snapshots` map).
    fn end_snapshot(&self) {
        // Leave snapshot mode first. After this, concurrent track_modification calls
        // will set modified flags directly instead of going through the snapshots map.
        self.snapshot_mode.store(false, Ordering::SeqCst);

        // A writer that observed the old `true` value registers before checking it a second time.
        // Once this reaches zero, no later insertion into `snapshots` is possible.
        while self.snapshot_writers.load(Ordering::SeqCst) != 0 {
            std::hint::spin_loop();
        }

        // Drain snapshot shards without holding any task locks. This deliberately breaks the old
        // DashMap shard-pairing dependency: after the writer quiescence above, each task can be
        // locked independently while no snapshots lock is held.
        let snapshot_shards = self.snapshots.shards();
        let pending: Vec<Vec<TaskId>> = parallel::map_collect(snapshot_shards, |shard| {
            let mut shard = shard.write();
            let keys = shard.drain().map(|(key, _)| key).collect();
            if shard.capacity() > 1024 {
                shard.shrink_to(0, |_entry| {
                    unreachable!("nothing is hashed when resizing an empty shard to zero");
                });
            }
            keys
        });
        let pending: Vec<TaskId> = pending.into_iter().flatten().collect();
        parallel::for_each(&pending, |&key| {
            if let Some(mut task) = self.map.get(key) {
                let modified_count = task.modified_count_ptr();
                // SAFETY: `task` holds a guard that keeps its chunk alive through this call.
                self.promote_during_snapshot_flags(&mut task, unsafe { &*modified_count });
            }
        });

        // Shutdown drain may have vacated every slot. All snapshot iterators and their task guards
        // are gone before the shared SnapshotGuard calls this method.
        self.map.retire_empty_chunks();
    }

    /// Returns true if actively snapshotting (modifications should go to snapshots map).
    /// Returns false if inactive (modifications go to modified list).
    fn snapshot_mode(&self) -> bool {
        self.snapshot_mode.load(Ordering::SeqCst)
    }

    pub fn access_mut(&self, key: TaskId) -> StorageWriteGuard<'_> {
        let inner = self
            .map
            .get(key)
            .unwrap_or_else(|| self.map.get_or_insert(key));
        StorageWriteGuard {
            storage: self,
            inner,
        }
    }

    /// Read-only access to an already resident task. The closure runs while that task's lock is
    /// held, so it must be cheap and must not re-enter the same task.
    pub fn with_task<R>(&self, key: TaskId, f: impl FnOnce(&TaskStorage) -> R) -> Option<R> {
        let task = self.map.get(key)?;
        Some(f(&task))
    }

    /// The number of **persistent** (non-transient) tasks resident in the map. Use this to assert
    /// GC returns to a flat baseline across re-rooting: GC never collects transient tasks (e.g.
    /// `run_once`/Once roots), so their count is not expected to settle.
    #[doc(hidden)]
    pub fn resident_persistent_task_count_for_testing(&self) -> usize {
        self.map
            .persistent_chunks()
            .into_iter()
            .map(|chunk| {
                let mut persistent = 0;
                chunk.for_each_mut(|task| {
                    if !task.key().is_transient() {
                        persistent += 1;
                    }
                });
                persistent
            })
            .sum()
    }

    /// The number of permanent persistent chunk-directory entries. GC seeds one scan job per
    /// entry; detached entries are cheap no-ops and can later publish a replacement chunk.
    pub fn shard_count(&self) -> usize {
        self.map.persistent_chunks().len()
    }

    /// Scans one dense chunk, invoking `on_candidate` for each persistent task that passes the
    /// cheap resident-only pre-filter.
    pub fn gc_scan_shard(&self, index: usize, mut on_candidate: impl FnMut(TaskId)) {
        let chunks = self.map.persistent_chunks();
        chunks[index].for_each_mut(|task| {
            if !task.key().is_transient() && task.gc_maybe_collectible() {
                on_candidate(*task.key());
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
            let value1 = self.access_mut(key1);
            let value2 = self.access_mut(key2);
            (value1, value2)
        } else {
            let value2 = self.access_mut(key2);
            let value1 = self.access_mut(key1);
            (value1, value2)
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

        let counts: Vec<EvictionCounts> = self.map.parallel_collect(|chunk| {
            let mut evicted = EvictionCounts::default();
            // Removals that would invert task_cache -> task lock ordering are deferred until no
            // task lock is held.
            let mut deferred_task_cache_removals: Vec<CachedTaskTypeArc> = Vec::new();
            // Remove a task type from `task_cache`, deferring on contention until no task lock is
            // held. Shared by the GC-deleted and ordinary key-eviction paths.
            let remove_from_task_cache =
                |evicted: &mut EvictionCounts,
                 deferred: &mut Vec<CachedTaskTypeArc>,
                 task_type: &CachedTaskTypeArc| {
                    match try_lock_and_remove(&self.task_cache, task_type.as_ref()) {
                        TryLockAndRemove::Removed => evicted.key_evictions += 1,
                        TryLockAndRemove::NotFound => {}
                        TryLockAndRemove::WouldBlock => deferred.push(task_type.clone()),
                    }
                };
            chunk.for_each_mut(|mut task| {
                let task_id = *task.key();
                if task_id.is_transient() {
                    evicted.unevictable_reasons[UnevictableReason::Transient.index()] += 1;
                    return;
                }
                // GC'd tasks were tombstoned during the snapshot so we can drop them fully now.
                if task.flags.deleted() {
                    let task_type = task
                        .get_persistent_task_type()
                        .expect("GC deleted tasks must have a task type");
                    remove_from_task_cache(
                        &mut evicted,
                        &mut deferred_task_cache_removals,
                        task_type,
                    );
                    evicted.full += 1;
                    task.vacate();
                    return;
                }
                let (key_evictability, value_evictability) = task.evictability();
                match key_evictability {
                    KeyEvictability::Evictable => {
                        let task_type = task.get_persistent_task_type().unwrap();
                        remove_from_task_cache(
                            &mut evicted,
                            &mut deferred_task_cache_removals,
                            task_type,
                        );
                    }
                    KeyEvictability::AlreadyEvicted | KeyEvictability::Unevictable => {}
                }
                match value_evictability {
                    ValueEvictability::Evictable { meta, data } => {
                        match task.drop_partial(data, meta) {
                            DropPartialOutcome::Empty => {
                                evicted.full += 1;
                                task.vacate();
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
            });
            for task_type in deferred_task_cache_removals {
                if self.task_cache.remove(task_type.as_ref()).is_some() {
                    evicted.key_evictions += 1;
                }
            }
            evicted
        });

        // All parallel task guards are gone; detach and flush chunks whose last slot was vacated.
        self.map.retire_empty_chunks();

        let mut totals = EvictionCounts::default();
        for evicted in counts {
            totals += evicted;
        }
        // Shrink task_cache only when we evicted more entries than remain — i.e. the map
        // is less than half full. Rehashing each surviving CachedTaskType isn't free, so
        // we gate it on meaningful slack. Within that, walk shards in parallel and shrink
        // each one independently if it is itself less than half full.
        if totals.key_evictions > self.task_cache.len() {
            parallel::for_each(self.task_cache.shards(), |shard| {
                let mut shard = shard.write();
                let len = shard.len();
                if shard.capacity() > len * 2 {
                    shard.shrink_to(len, |(k, _v)| self.task_cache.hasher().hash_one(k));
                }
            });
        }
        span.record("counts", tracing::field::display(&totals));

        totals
    }
}

/// Exclusive access to one resident task.
pub struct StorageWriteGuard<'a> {
    storage: &'a Storage,
    inner: TaskMapGuard<'a, TaskStorage>,
}

struct SnapshotWriterRegistration<'a>(&'a AtomicUsize);

impl Drop for SnapshotWriterRegistration<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
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
        let flags = &self.inner.flags;
        if flags.is_modified_during_snapshot(category) {
            // We can early return since `end_snapshot` is responsible for reconciling.
            return TrackOutcome::NoChange;
        }
        #[cfg(feature = "trace_task_modification")]
        let _span = tracing::trace_span!("mark_modified", name).entered();

        // Register only on the rare snapshot path. Sequential consistency across the mode and
        // writer atomics makes the second check a closed handshake with `end_snapshot`: either it
        // sees `false`, or end_snapshot must observe this registration before draining snapshots.
        let (in_snapshot, _snapshot_writer) = if self.storage.snapshot_mode() {
            self.storage.snapshot_writers.fetch_add(1, Ordering::SeqCst);
            (
                self.storage.snapshot_mode(),
                Some(SnapshotWriterRegistration(&self.storage.snapshot_writers)),
            )
        } else {
            (false, None)
        };

        match (in_snapshot, flags.is_modified(category)) {
            (false, false) => {
                // Not in snapshot mode and item is unmodified
                let bumped = !flags.any_modified();
                if bumped {
                    self.inner.modified_count().fetch_add(1, Ordering::Relaxed);
                }
                self.inner.flags.set_modified(category, true);
                TrackOutcome::Tracked { category, bumped }
            }
            (false, true) => {
                // Not in snapshot mode and item is already modified
                // Do nothing
                TrackOutcome::NoChange
            }
            (true, false) => {
                // In snapshot mode and item is unmodified (so it's not part of the snapshot)
                // Mark it so it gets re-added as Modified after this snapshot completes.
                // Insert a None entry into snapshots so end_snapshot discovers this task
                // and promotes its _during_snapshot flags.
                let inserted_snapshot = !flags.any_modified_during_snapshot();
                if inserted_snapshot {
                    self.storage.snapshots.insert(*self.inner.key(), None);
                }
                self.inner
                    .flags
                    .set_modified_during_snapshot(category, true);
                TrackOutcome::TrackedDuringSnapshot {
                    category,
                    inserted_snapshot,
                }
            }
            (true, true) => {
                // In snapshot mode and item is modified (so it's part of the snapshot)
                // We need to store the original version that is part of the snapshot
                let inserted_snapshot = !flags.any_modified_during_snapshot();
                if inserted_snapshot {
                    // Snapshot all non-transient fields, carrying the modified bits into
                    // the copy so the iterator knows which categories to persist.
                    let mut snapshot = self.inner.clone_snapshot();
                    snapshot.flags.set_data_modified(flags.data_modified());
                    snapshot.flags.set_meta_modified(flags.meta_modified());
                    snapshot.flags.set_new_task(flags.new_task());
                    self.storage
                        .snapshots
                        .insert(*self.inner.key(), Some(Box::new(snapshot)));
                }
                self.inner
                    .flags
                    .set_modified_during_snapshot(category, true);
                TrackOutcome::TrackedDuringSnapshot {
                    category,
                    inserted_snapshot,
                }
            }
        }
    }

    /// Reverse a [`TrackOutcome`] produced by [`Self::track_modification`] when the mutation it
    /// guarded changed nothing persistable.
    ///
    /// # Correctness
    ///
    /// The `outcome` MUST be applied to the **same `StorageWriteGuard`** that produced it, with the
    /// task lock held continuously in between — i.e. `track_modification`, the mutation, and
    /// `undo_track_modification` all run within one guard's lifetime. This guarantees no other
    /// thread observed the tracked state, and that `bumped` / `inserted_snapshot` still describe
    /// reality. Because those flags record whether
    /// *this* call created the state, undo never clears a flag, counter, or snapshot entry that a
    /// prior modification owns.
    pub fn undo_track_modification(&mut self, outcome: TrackOutcome) {
        match outcome {
            TrackOutcome::NoChange => {}
            TrackOutcome::Tracked { category, bumped } => {
                self.inner.flags.set_modified(category, false);
                if bumped {
                    self.inner.modified_count().fetch_sub(1, Ordering::Relaxed);
                }
            }
            TrackOutcome::TrackedDuringSnapshot {
                category,
                inserted_snapshot,
            } => {
                self.inner
                    .flags
                    .set_modified_during_snapshot(category, false);
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
            self.inner.flags.new_task(),
            "only a never-persisted (new_task) collected task may be discarded this way"
        );
        if self.inner.flags.any_modified() {
            self.inner.modified_count().fetch_sub(1, Ordering::Relaxed);
        }
        self.inner.flags.set_meta_modified(false);
        self.inner.flags.set_data_modified(false);
        self.inner.flags.set_new_task(false);
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

/// The work a single chunk's iterator performs, with the snapshot mode encoded in the data rather
/// than a runtime flag re-checked per item. Built by `take_snapshot`'s scan.
enum ShardWork {
    /// Normal snapshot: look each task up in the map while iterating, serialize it, then clear and
    /// promote its modified flags so it stays dirty for the next snapshot cycle.
    Keep(Vec<TaskId>),
    /// Shutdown drain: the scan already erased the unmodified entries and moved the remaining
    /// modified tasks out of their slots. The iterator owns and drains them directly. No second
    /// lookup or flag bookkeeping is needed because the whole map is being discarded.
    Drain(std::vec::IntoIter<(TaskId, TaskStorage)>),
}

pub struct SnapshotShard<'l, P> {
    work: ShardWork,
    storage: &'l Storage,
    process: &'l P,
    /// Held for its `Drop` impl — ensures snapshot mode ends when all chunk workers are done.
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

/// Iterator over a single chunk's snapshot items. Holds a thread-local scratch
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

        match &mut self.shard.work {
            ShardWork::Keep(modified) => {
                let task_id = modified.pop()?;
                let mut inner = self.shard.storage.map.get(task_id).unwrap();
                let item = serialize_task(task_id, &inner);
                // Clear the modified flags that were captured into the snapshot copy,
                // then promote modified_during_snapshot → modified so the task stays
                // dirty for the next snapshot cycle.
                inner.flags.set_data_modified(false);
                inner.flags.set_meta_modified(false);
                inner.flags.set_new_task(false);
                let modified_count = inner.modified_count_ptr();
                // SAFETY: `inner` holds a guard that keeps its chunk alive through this call.
                self.shard
                    .storage
                    .promote_during_snapshot_flags(&mut inner, unsafe { &*modified_count });
                Some(item)
            }
            ShardWork::Drain(entries) => {
                // Shutdown only: the scan moved this chunk's modified entries out of the map.
                // Serialize each owned task and then free it immediately. Flag bookkeeping is
                // unnecessary because the entire map is discarded after this snapshot.
                let (task_id, inner) = entries.next()?;
                Some(serialize_task(task_id, &inner))
                // we don't need to update any bits because everything is getting dropped.
            }
        }
    }
}

impl<P> Drop for SnapshotShardIter<'_, P> {
    fn drop(&mut self) {
        self.shard
            ._guard
            .return_scratch_buffer(std::mem::take(&mut self.buffer));
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Barrier, mpsc},
        thread,
        time::Duration,
    };

    use turbo_bincode::TurboBincodeBuffer;
    use turbo_tasks::TaskId;

    use super::{SpecificTaskDataCategory, Storage, TrackOutcome};
    use crate::backing_storage::SnapshotItem;

    fn non_transient_task(id: u32) -> TaskId {
        // TRANSIENT_TASK_BIT is 0x4000_0000; any id without that bit is non-transient.
        TaskId::new(id).expect("id must be non-zero")
    }

    #[test]
    fn unrelated_task_locks_do_not_block_each_other() {
        let storage = Arc::new(Storage::new(2, true));
        let barrier = Arc::new(Barrier::new(3));
        let (done_tx, done_rx) = mpsc::channel();
        for id in [1, 2] {
            let storage = storage.clone();
            let barrier = barrier.clone();
            let done_tx = done_tx.clone();
            thread::spawn(move || {
                let _guard = storage.access_mut(non_transient_task(id));
                barrier.wait();
                done_tx.send(()).unwrap();
            });
        }
        barrier.wait();
        done_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        done_rx.recv_timeout(Duration::from_secs(5)).unwrap();
    }

    #[test]
    fn pair_access_locks_in_task_id_order() {
        let storage = Arc::new(Storage::new(2, true));
        let barrier = Arc::new(Barrier::new(3));
        let (done_tx, done_rx) = mpsc::channel();
        for (first, second) in [(1, 2), (2, 1)] {
            let storage = storage.clone();
            let barrier = barrier.clone();
            let done_tx = done_tx.clone();
            thread::spawn(move || {
                barrier.wait();
                for _ in 0..10_000 {
                    let guards = storage
                        .access_pair_mut(non_transient_task(first), non_transient_task(second));
                    drop(guards);
                }
                done_tx.send(()).unwrap();
            });
        }
        barrier.wait();
        done_rx.recv_timeout(Duration::from_secs(5)).unwrap();
        done_rx.recv_timeout(Duration::from_secs(5)).unwrap();
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

    #[tokio::test(flavor = "multi_thread")]
    async fn task_first_modified_during_snapshot_is_carried_forward() {
        let storage = Storage::new(2, true);
        let task_id = non_transient_task(1);
        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(!has_modifications);

        {
            let mut task = storage.access_mut(task_id);
            let _ = task.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(task.flags.data_modified_during_snapshot());
            assert!(!task.flags.data_modified());
        }

        drop(snapshot_guard);
        let (_next_snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let task = storage.access_mut(task_id);
        assert!(task.flags.data_modified());
        assert!(!task.flags.data_modified_during_snapshot());
    }

    /// Regression test: a task modified before a snapshot and then modified *again* during
    /// snapshot iteration must serialize the pre-snapshot state and carry the during-snapshot
    /// modification forward to the next cycle.
    ///
    /// Sequence of events:
    /// 1. Task is modified (data_modified = true) → added to per-chunk modified counts.
    /// 2. `start_snapshot` puts us in snapshot mode.
    /// 3. `take_snapshot` scans the chunk: task has `any_modified()=true` → goes into the
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
        let storage = Storage::new(2, true);
        let task_id = non_transient_task(1);

        // Step 1: modify the task outside snapshot mode (data_modified = true).
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }

        // Step 2: enter snapshot mode.
        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        // Step 3: `take_snapshot` scans the chunk. At this point the task has
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

        // The during-snapshot modification must be reflected in per-chunk modified counts so
        // the next snapshot cycle picks it up. Verify by starting another snapshot.
        let (_guard2, has_modifications) = storage.start_snapshot();
        assert!(
            has_modifications,
            "per-chunk modified counts must be non-zero after promoting modified_during_snapshot"
        );
    }

    /// Regression test for the `(true, false)` during-snapshot case: a task modified in one
    /// category before a snapshot, then modified in a *different* category during snapshot
    /// iteration, must not panic and must carry both modifications forward correctly.
    ///
    /// Sequence of events:
    /// 1. Task meta is modified (meta_modified = true).
    /// 2. `start_snapshot` puts us in snapshot mode.
    /// 3. `take_snapshot` scans the chunk: task goes into the `modified` list.
    /// 4. Task data is modified during snapshot → `(true, false)` branch: data was not previously
    ///    modified, so `snapshots` gets a `None` entry and `data_modified_during_snapshot` is set.
    /// 5. `SnapshotShardIter::next` processes the task: finds `any_modified_during_snapshot()`,
    ///    sees `None` in snapshots, encodes from live data (correct — live data for the
    ///    unmodified-before-snapshot category is still the pre-snapshot state), clears pre-snapshot
    ///    flags, and promotes `data_modified_during_snapshot → data_modified`.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_different_category_during_snapshot() {
        let storage = Storage::new(2, true);
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
            "per-chunk modified counts must be non-zero after promoting \
             data_modified_during_snapshot"
        );
    }

    /// With `drain_entries = true` (shutdown path), the modified entries are moved out of the map
    /// (during the scan) and serialized by the iterator, freeing each task's memory as it is
    /// persisted rather than retaining it until the whole snapshot is written. Either way the
    /// entry must be gone from the map by the time the snapshot is consumed.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_entry_from_map() {
        let storage = Storage::new(2, true);
        let task_id = non_transient_task(1);

        // Modify the task outside snapshot mode so it lands in the modified list.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        assert!(storage.map.get(task_id).is_some());

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
            storage.map.get(task_id).is_none(),
            "task entry should be removed from the map after being persisted in drain mode"
        );
    }

    /// In drain mode, fully consuming the iterators empties every occupied slot. Chunk allocations
    /// remain stable until `Storage` itself is dropped, but no `TaskStorage` value is retained.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_clears_dense_slots() {
        let storage = Storage::new(2, true);
        let task_ids: Vec<_> = (1..=256).map(non_transient_task).collect();
        for &task_id in &task_ids {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        assert_eq!(storage.map.len(), task_ids.len());

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, true);
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();
        assert_eq!(items.len(), task_ids.len());
        assert_eq!(storage.map.len(), 0);
        for chunk in storage.map.chunks() {
            for offset in chunk.probably_occupied_offsets() {
                assert!(chunk.get(offset).is_none());
            }
            assert!(chunk.probably_occupied_offsets().is_empty());
        }
    }

    /// In drain mode, `take_snapshot`'s scan removes *both* kinds of entry from the map: unmodified
    /// entries are erased and freed (never serialized), and the remaining modified-only table is
    /// moved out into the chunk iterators (to be serialized, then freed as each is consumed). So
    /// the map is already empty when `take_snapshot` returns, and only the modified task is
    /// yielded.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_unmodified_during_take_snapshot() {
        let storage = Storage::new(2, true);
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
        assert!(storage.map.get(unmodified_id).is_some());

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        let shards = storage.take_snapshot(snapshot_guard, &dummy_process, true);

        // The scan moved the modified table out and freed the unmodified entry, so both ids are
        // already absent from the map before any iterator is consumed.
        assert!(
            storage.map.get(unmodified_id).is_none(),
            "unmodified entry should be removed during take_snapshot in drain mode"
        );
        assert!(
            storage.map.get(modified_id).is_none(),
            "modified entry should be moved out of the map during take_snapshot in drain mode"
        );

        // Consuming the iterators yields only the modified task (the unmodified one was never part
        // of the snapshot).
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), modified_id);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn undo_non_snapshot_reverses_flag_and_counter() {
        let storage = Storage::new(2, true);
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
            "undo must decrement the chunk counter so no modifications remain"
        );
    }

    /// A second track on an already-modified category returns `NoChange`; undoing it is a no-op and
    /// must NOT clear the real modification recorded by the first track.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_nochange_preserves_prior_modification() {
        let storage = Storage::new(2, true);
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
    /// outcome must leave Data modified and the chunk counter still non-zero.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_only_reverses_its_own_category() {
        let storage = Storage::new(2, true);
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
        let storage = Storage::new(2, true);
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
        assert!(storage.snapshots.get(&task_id).is_some());

        guard.undo_track_modification(outcome);
        assert!(!guard.flags.data_modified_during_snapshot());
        assert!(
            storage.snapshots.get(&task_id).is_none(),
            "undo must remove the snapshots marker it inserted"
        );
    }

    /// During-snapshot `(true, true)` arm: a task modified-before-snapshot, tracked again during
    /// snapshot, stores a pre-mutation copy in `snapshots`. Undo must remove that copy and clear
    /// the `_during_snapshot` bit, while leaving the pre-existing `modified` flag intact (it
    /// belongs to the snapshot, not to this call).
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_during_snapshot_true_true_removes_copy_preserves_modified() {
        let storage = Storage::new(2, true);
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
        assert!(matches!(
            storage.snapshots.get(&task_id).as_deref(),
            Some(Some(_))
        ));

        guard.undo_track_modification(outcome);
        assert!(!guard.flags.data_modified_during_snapshot());
        assert!(
            guard.flags.data_modified(),
            "the pre-snapshot modification belongs to the snapshot and must survive undo"
        );
        assert!(
            storage.snapshots.get(&task_id).is_none(),
            "undo must remove the pre-mutation copy it inserted"
        );
    }
}
