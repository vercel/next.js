use std::{
    cell::Cell,
    fmt::{Display, Formatter},
    hash::{BuildHasher, Hash},
    ops::{Deref, DerefMut},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

use parking_lot::Mutex;
use thread_local::ThreadLocal;
use tracing::span::Id;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{FxDashMap, TaskId, backend::CachedTaskType, event::Event, parallel};

use crate::{
    backend::storage_schema::{
        DropPartialOutcome, KeyEvictability, TaskStorage, UnevictableReason, ValueEvictability,
    },
    backing_storage::SnapshotItem,
    database::key_value_database::KeySpace,
    utils::{
        dash_map_drop_contents::drop_contents,
        dash_map_multi::{RefMut, get_multiple_mut},
        dash_map_raw_entry::{TryLockAndRemove, try_lock_and_remove},
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskDataCategory {
    Meta,
    Data,
    All,
}

/// Whether eviction runs alongside a snapshot.
///
/// `Enabled` drops the value of unmodified evictable tasks during `take_snapshot`
/// (phase 1) and drops persisted-modified tasks during `end_snapshot` (phase 3).
/// `Disabled` behaves like the legacy snapshot path — no in-lifecycle eviction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EvictMode {
    Disabled,
    Enabled,
}

impl EvictMode {
    #[inline]
    pub fn enabled(self) -> bool {
        matches!(self, EvictMode::Enabled)
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
    pub fn into_specific(self) -> SpecificTaskDataCategory {
        match self {
            TaskDataCategory::Meta => SpecificTaskDataCategory::Meta,
            TaskDataCategory::Data => SpecificTaskDataCategory::Data,
            TaskDataCategory::All => unreachable!(),
        }
    }

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

pub struct Storage {
    snapshot_mode: AtomicBool,
    /// Per-shard counts of tasks with modified flags set. Incremented when a task
    /// transitions from unmodified to modified (outside snapshot mode). Reset to zero when
    /// snapshot mode begins, and re-incremented in `end_snapshot` for tasks that still have
    /// modifications (promoted from `modified_during_snapshot`). Used to skip unmodified shards
    /// in `take_snapshot`, avoiding unnecessary iteration and enabling early returns
    ///
    /// Indexed by `map.determine_shard(map.hash_usize(&key))` and guaranteed by construction so
    /// that  `shard_modified_counts.len()==map.shards().len()`
    ///
    /// Should only be modified while holding the corresponding dashmap shard lock.
    shard_modified_counts: Box<[AtomicU64]>,
    /// Stores snapshots of task state for tasks accessed during snapshot mode.
    /// - `Some(snapshot)`: Task was modified before snapshot mode and accessed again during it.
    ///   Contains a copy of the pre-snapshot state that needs to be persisted.
    /// - `None`: Task was first modified during snapshot mode (not part of current snapshot). Will
    ///   be marked as modified at the beginning of the next snapshot cycle.
    ///
    /// Lock Ordering: `snapshots` locks are acquired **after** `map` locks (see the comment on
    /// `map` below). Holding a `snapshots` shard write lock and then trying to take a `map` shard
    /// write lock is forbidden — it would deadlock against `track_modification_internal` /
    /// `SnapshotShardIter::next`, which take map first.
    ///
    /// Shard Invariant: `snapshots` is constructed with the same `shard_amount`, the same key
    /// type (`TaskId`), and the same stateless hasher (`FxBuildHasher`) as `map`. Therefore shard
    /// index `N` in `snapshots` corresponds exactly to shard index `N` in `map`: any `TaskId`
    /// present in `snapshots.shards()[N]` (if present in `map` at all) is in `map.shards()[N]`.
    /// Code that walks both maps in parallel (e.g. `end_snapshot`) relies on this to lock pairs
    /// of shards by index instead of going through the top-level `DashMap` accessors.
    snapshots: FxDashMap<TaskId, Option<Box<TaskStorage>>>,
    /// The main storage map
    ///
    /// Lock Ordering: Task creation acquires a `task_cache` lock and then inserts into this map.
    /// Because both datastructures are sharded on different keys, the locks are not 'strictly'
    /// ordered but we should treat them as such
    /// Acquiring locks in the opposite order should be defensive
    ///
    /// Lock Ordering vs. `snapshots`: `map` locks are acquired **before** `snapshots` locks.
    /// `track_modification_internal` and `SnapshotShardIter::next` both hold a `map` shard write
    /// lock (via `StorageWriteGuard` / `map.get_mut`) and then take a `snapshots` shard lock.
    /// `end_snapshot` must lock in the same order — see the shard-zipping pattern there.
    map: FxDashMap<TaskId, Box<TaskStorage>>,
    /// A shared event notified whenever any task finishes restoring (successfully or not).
    ///
    /// Threads waiting for another thread's in-progress restore subscribe to this event,
    /// then re-check the specific task's `restoring`/`restored` bits after waking.
    pub(crate) restored: Event,
    /// Maps `CachedTaskType` → `TaskId` for deduplication of persistent task creation.
    /// This is backed by the TaskCache table in the database.
    ///
    /// LockOrdering: See the comments on [map].
    pub task_cache: FxDashMap<Arc<CachedTaskType>, TaskId>,
}

impl Storage {
    pub fn new(shard_amount: usize, small_preallocation: bool) -> Self {
        let map_capacity: usize = if small_preallocation {
            1024
        } else {
            1024 * 1024
        };

        let map = FxDashMap::with_capacity_and_hasher_and_shard_amount(
            map_capacity,
            Default::default(),
            shard_amount,
        );
        let shard_modified_counts = (0..shard_amount)
            .map(|_| AtomicU64::new(0))
            .collect::<Vec<_>>()
            .into_boxed_slice();
        Self {
            snapshot_mode: AtomicBool::new(false),
            shard_modified_counts,
            snapshots: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                // We expect very few updates to this map since it will only happen when updates
                // race with snapshots.  This never happens in a build and only rarely happens in
                // dev sessions
                0,
                Default::default(),
                shard_amount,
            ),
            map,
            restored: Event::new(|| || "Storage::restored".to_string()),
            task_cache: FxDashMap::default(),
        }
    }

    /// Returns the shard index for the given key in the `map` DashMap.
    fn shard_index(&self, key: &TaskId) -> usize {
        let hash = self.map.hash_usize(key);
        self.map.determine_shard(hash)
    }

    /// Promote `modified_during_snapshot` → `modified` flags on a task, and increment the
    /// per-shard modified count if the task was not already marked as modified.
    ///
    /// This is used after persisting a snapshot: _during_snapshot flags represent changes
    /// that occurred concurrently and were not included in the persisted snapshot, so they
    /// must be carried forward as `modified` for the next snapshot cycle.
    fn promote_during_snapshot_flags(&self, task: &mut TaskStorage, shard_idx: usize) {
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
            self.shard_modified_counts[shard_idx].fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Mark a newly allocated task as restored (skip DB queries) and new (include in persistence
    /// snapshots). Optionally sets the `persistent_task_type` eagerly so it's available for
    /// persistence snapshots without needing to propagate it through `connect_child`.
    pub fn initialize_new_task(&self, task_id: TaskId, task_type: Option<Arc<CachedTaskType>>) {
        let mut task = self.access_mut(task_id);
        task.flags.set_restored(TaskDataCategory::All);
        task.flags.set_new_task(true);
        if let Some(task_type) = task_type {
            task.set_persistent_task_type(task_type);
            if !task_id.is_transient() {
                task.track_modification(SpecificTaskDataCategory::Data, "persistent_task_type");
            }
        }
    }

    /// Processes every modified item (resp. a snapshot of it) with the given function and returns
    /// the results. Ends snapshot mode when the returned `SnapshotGuard` (held by each shard) is
    /// dropped.
    ///
    /// `process` is called while holding a read lock on the task storage, so it can access
    /// the TaskStorage directly without cloning.
    ///
    /// Both callbacks receive a mutable scratch buffer that can be reused across iterations
    /// to avoid repeated allocations.
    ///
    /// The returned shards implement `IntoIterator`. Empty shards (no modified or snapshot
    /// entries) are filtered out, but shards may still yield no items if all entries produce
    /// empty `SnapshotItem`s (this is rare and only happens under error conditions).
    pub fn take_snapshot<
        'l,
        P: for<'a> Fn(TaskId, &'a TaskStorage, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
    >(
        &'l self,
        guard: Arc<SnapshotGuard<'l>>,
        process: &'l P,
    ) -> Vec<SnapshotShard<'l, P>> {
        let shards: Vec<_> = self.map.shards().iter().enumerate().collect();

        // The number of shards is much larger than the number of threads, so the effect of the
        // locks held is negligible.
        let evict = guard.evict;
        parallel::map_collect::<_, _, Vec<_>>(&shards, |&(shard_idx, shard)| {
            // Check how many modifications there are in this shard, because we have entered
            // snapshot_mode, there are no racing writes
            // So we can safely clear it out now that we are processing the modifications
            let modified_count = self.shard_modified_counts[shard_idx].swap(0, Ordering::Relaxed);
            // Visit this shard if there's modified-task work OR eviction work to do.
            // With `evict.enabled()` we must visit every shard because unmodified-
            // evictable tasks can live in zero-modified shards too.
            if modified_count == 0 && !evict.enabled() {
                return None;
            }
            let mut modified = Vec::with_capacity(modified_count as usize);
            // Phase 1 locals: accumulated once at the end of the closure into the
            // guard-wide mutexes.
            let mut phase1_counts = EvictionCounts::default();
            let mut phase1_deferred: Vec<Arc<CachedTaskType>> = Vec::new();
            {
                // Upgraded to `write()` so phase 1 can drop unmodified evictable tasks
                // in the same pass that collects modified TaskIds. The legacy read-only
                // scan is still correct when `evict.disabled()` but a write lock costs
                // nothing more in practice since each shard holds it briefly.
                let mut shard_guard = shard.write();
                // Safety: shard_guard must outlive the iterator.
                for bucket in unsafe { shard_guard.iter() } {
                    // Safety: the guard guarantees that the bucket is not removed and the ptr
                    // is valid.
                    let (key, shared_value) = unsafe { bucket.as_mut() };
                    let flags = &shared_value.get().flags;
                    // Only check modified flags here — transient tasks never have
                    // modified flags set (track_modification guards against it), so
                    // this naturally excludes them. new_task is always
                    // accompanied by modified flags (set_persistent_task_type calls
                    // track_modification), so any_modified() is sufficient.
                    if flags.any_modified() {
                        if key.is_transient() {
                            debug_assert!(
                                false,
                                "found a modified transient task: {:?}",
                                shared_value.get().get_persistent_task_type()
                            );
                            continue;
                        }

                        modified.push(*key);
                        continue;
                    }

                    // Phase 1: unmodified task. When eviction is enabled, drop the
                    // value-side inline and buffer the key-side removal for phase 3
                    // to drain after `save_snapshot` commits (identity invariant).
                    if !evict.enabled() {
                        continue;
                    }
                    if key.is_transient() {
                        phase1_counts.unevictable_reasons[UnevictableReason::Transient.index()] +=
                            1;
                        continue;
                    }
                    let (key_evictability, value_evictability) = shared_value.get().evictability();
                    apply_key_eviction_deferred(
                        shared_value.get(),
                        key_evictability,
                        &mut phase1_deferred,
                    );
                    if apply_value_eviction(
                        shared_value.get_mut(),
                        value_evictability,
                        &mut phase1_counts,
                    ) {
                        // SAFETY: we hold the shard write lock for the duration of
                        // iteration; the bucket reference is still valid.
                        unsafe {
                            shard_guard.erase(bucket);
                        }
                    }
                }
                // Shrink the shard if it's less than half full, to reclaim slack
                // capacity after phase-1 evictions. Only meaningful when phase 1
                // actually ran (otherwise the shard's population is unchanged from
                // before this closure).
                if evict.enabled() {
                    let len = shard_guard.len();
                    if shard_guard.capacity() > len * 2 {
                        shard_guard.shrink_to(len, |(k, _v)| self.map.hasher().hash_one(k));
                    }
                }
                // Safety: shard_guard must outlive the iterator.
                drop(shard_guard);
            }

            debug_assert!(!modified.is_empty());
            // Flush per-shard phase-1 state into the guard-wide mutexes. One
            // acquire per mutex per shard — cheap vs. per-task atomics.
            if evict.enabled() {
                *guard.phase1_counts.lock() += std::mem::take(&mut phase1_counts);
            }
            if !phase1_deferred.is_empty() {
                guard
                    .deferred_task_cache_removals
                    .lock()
                    .extend(phase1_deferred.drain(..));
            }

            Some(SnapshotShard {
                shard_idx,
                modified,
                storage: self,
                process,
                _guard: guard.clone(),
            })
        })
        .into_iter()
        .flatten()
        .collect()
    }

    /// Enter snapshot mode and return a guard that will call `end_snapshot` on drop.
    ///
    /// Returns whether any shard has modifications. Per-shard counts are reset
    /// in `take_snapshot` as each shard is processed, not here — resetting eagerly
    /// would lose track of modifications for shards that haven't been persisted yet.
    ///
    /// Safety invariant: `start_snapshot` and `end_snapshot` are always called
    /// sequentially within a single `snapshot_and_persist` invocation (the sole
    /// caller). There is no concurrent snapshot lifecycle, so they cannot race.
    pub fn start_snapshot(&self, evict: EvictMode) -> (SnapshotGuard<'_>, bool) {
        // Enter snapshot mode first so concurrent track_modification calls switch
        // to the _during_snapshot path and stop incrementing shard_modified_counts.
        self.snapshot_mode.store(true, Ordering::Release);
        // Check if any shard has modifications. Don't reset counts here —
        // take_snapshot resets per-shard counts as it processes each shard,
        // which avoids losing track of modifications for shards that haven't
        // been persisted yet.
        let has_modifications = self
            .shard_modified_counts
            .iter()
            .any(|c| c.load(Ordering::Relaxed) > 0);
        (SnapshotGuard::new(self, evict), has_modifications)
    }

    /// End snapshot mode, then run phase 3 of eviction if enabled.
    ///
    /// Modified/new flags on tasks are cleared incrementally during snapshot iteration
    /// (in `take_snapshot` for direct_snapshots, and in `SnapshotShardIter::next` for
    /// modified tasks), so no full-map scan is needed here.
    ///
    /// Steps:
    /// 1. Leave snapshot mode so new modifications go to the modified flags directly.
    /// 2. Promote `modified_during_snapshot` → `modified` for tasks that were accessed during
    ///    snapshot mode (tracked in the small `snapshots` map).
    /// 3. If `guard.evict.enabled()` and `guard.persist_succeeded`, sweep the touched-set
    ///    (per-shard `modified` vecs forwarded by `SnapshotShardIter::Drop`) and drain the deferred
    ///    `task_cache` removal list buffered by phase 1.
    fn end_snapshot(&self, guard: &SnapshotGuard<'_>) {
        // Leave snapshot mode first. After this, concurrent track_modification calls
        // will set modified flags directly instead of going through the snapshots map.
        self.snapshot_mode.store(false, Ordering::Release);

        // Promote modified_during_snapshot → modified for tasks that had snapshots.
        // The snapshots map should be small (only tasks concurrently accessed during snapshot
        // mode). Increment the per-shard modified counts for promoted tasks.

        // Lock Ordering: we must acquire `map` shards BEFORE `snapshots` shards, matching the
        // order used by `track_modification_internal` and `SnapshotShardIter::next`. The
        // previous implementation drained `snapshots` first and then called `self.map.get_mut`,
        // which is the opposite order — a concurrent `track_modification` (holding map[N], about
        // to insert into snapshots[N]) could deadlock against it through the
        // `snapshot_mode = false` race window.
        //
        // Shard pairing: `map` and `snapshots` are constructed with the same `shard_amount`,
        // same `TaskId` keys, and the same stateless `FxBuildHasher`. Therefore shard `N` in
        // `snapshots` pairs with shard `N` in `map`: every key drained from `snapshots[N]` (if
        // it still exists in `map`) lives in `map[N]`. We zip them and lock each pair in order.
        let map_shards = self.map.shards();
        let snapshot_shards = self.snapshots.shards();
        debug_assert_eq!(
            map_shards.len(),
            snapshot_shards.len(),
            "map and snapshots must share shard count for zipped locking; see Shard Invariant on \
             `snapshots` field"
        );

        let shard_indices: Vec<usize> = (0..map_shards.len()).collect();
        parallel::for_each(&shard_indices, |&shard_idx| {
            let map_shard = &map_shards[shard_idx];
            let snap_shard = &snapshot_shards[shard_idx];

            // Acquire in documented order: map first, snapshots second.
            let map_guard = map_shard.write();
            let mut snap_guard = snap_shard.write();

            for (key, _) in snap_guard.drain() {
                // The key is in this shard's `map` (or absent entirely), by the shard
                // invariant above. Resolve directly in the held map guard rather than going
                // through `self.map.get_mut`, which would attempt to re-acquire this shard's
                // write lock and would also obscure the pairing.
                let hash = self.map.hasher().hash_one(key);
                if let Some(bucket) = map_guard.find(hash, |(k, _)| *k == key) {
                    // SAFETY: We hold `map_shard`'s write lock for the duration of this
                    // access, so the bucket pointer is valid and no other thread can alias it.
                    let (_, shared_value) = unsafe { bucket.as_mut() };
                    self.promote_during_snapshot_flags(shared_value.get_mut(), shard_idx);
                }
            }
            // If we are saving a non-trivial amount of memory just clear it out.
            if snap_guard.capacity() > 1024 {
                snap_guard.shrink_to(0, |_entry| {
                    unreachable!("nothing is hashed when resizing an empty shard to zero");
                });
            }

            drop(snap_guard);
            drop(map_guard);
        });

        // Phase 3. Gated on `persist_succeeded` so a failed `save_snapshot` never
        // drops tasks whose modifications aren't on disk or causes task_cache
        // removals that would violate the CachedTaskType → TaskId identity invariant.
        if !guard.evict.enabled() || !guard.persist_succeeded.load(Ordering::Acquire) {
            return;
        }

        let mut phase3_counts = EvictionCounts::default();

        // 3a. Touched-set sweep: re-visit each modified task whose flags were
        // cleared by SnapshotShardIter::next. Their bytes are now durable on
        // disk, so dropping the in-memory value is safe.
        let touched_modified = std::mem::take(&mut *guard.touched_modified.lock());
        let mut phase3_deferred: Vec<Arc<CachedTaskType>> = Vec::new();
        for shard_modified in touched_modified {
            for task_id in shard_modified {
                let Some(mut inner) = self.map.get_mut(&task_id) else {
                    // Task was removed by another path between iteration and here —
                    // nothing to do.
                    continue;
                };
                if task_id.is_transient() {
                    // Defense in depth — transient tasks shouldn't appear in the
                    // modified list, but if one does we can't evict it.
                    phase3_counts.unevictable_reasons[UnevictableReason::Transient.index()] += 1;
                    continue;
                }
                let (key_evictability, value_evictability) = inner.evictability();
                apply_key_eviction_inline(
                    &self.task_cache,
                    &inner,
                    key_evictability,
                    &mut phase3_deferred,
                    &mut phase3_counts,
                );
                if apply_value_eviction(&mut inner, value_evictability, &mut phase3_counts) {
                    // Task is now empty; drop the RefMut and remove from the map.
                    drop(inner);
                    self.map.remove(&task_id);
                }
            }
        }

        // 3b. Drain the phase-1 deferred task_cache removals, with the same
        // try-lock-and-defer backoff used elsewhere so we can't deadlock with
        // get_or_create_task's task_cache → map lock order.
        let phase1_deferred = std::mem::take(&mut *guard.deferred_task_cache_removals.lock());
        for task_type in phase1_deferred {
            match try_lock_and_remove(&self.task_cache, task_type.as_ref()) {
                TryLockAndRemove::Removed => phase3_counts.key_evictions += 1,
                TryLockAndRemove::NotFound => {}
                TryLockAndRemove::WouldBlock => phase3_deferred.push(task_type),
            }
        }
        // Second pass: any removals still contended get a blocking remove now
        // that we hold no map shard lock.
        drain_deferred_task_cache_removals(&self.task_cache, phase3_deferred, &mut phase3_counts);

        // 3c. Shrink task_cache when we evicted more entries than remain, so
        // the shard tables give back slack capacity.
        if phase3_counts.key_evictions > self.task_cache.len() {
            self.task_cache.shrink_to_fit();
        }

        *guard.phase3_counts.lock() += phase3_counts;
    }

    /// Returns true if actively snapshotting (modifications should go to snapshots map).
    /// Returns false if inactive (modifications go to modified list).
    fn snapshot_mode(&self) -> bool {
        self.snapshot_mode.load(Ordering::Acquire)
    }

    pub fn access_mut(&self, key: TaskId) -> StorageWriteGuard<'_> {
        let inner = match self.map.entry(key) {
            dashmap::mapref::entry::Entry::Occupied(e) => e.into_ref(),
            dashmap::mapref::entry::Entry::Vacant(e) => e.insert(Box::new(TaskStorage::new())),
        };
        StorageWriteGuard {
            storage: self,
            inner: inner.into(),
        }
    }

    pub fn access_pair_mut(
        &self,
        key1: TaskId,
        key2: TaskId,
    ) -> (StorageWriteGuard<'_>, StorageWriteGuard<'_>) {
        let (a, b) = get_multiple_mut(&self.map, key1, key2, || Box::new(TaskStorage::new()));
        (
            StorageWriteGuard {
                storage: self,
                inner: a,
            },
            StorageWriteGuard {
                storage: self,
                inner: b,
            },
        )
    }

    pub fn drop_contents(&self) {
        drop_contents(&self.map);
        drop_contents(&self.snapshots);
        drop_contents(&self.task_cache);
    }

    /// On-demand full-map eviction pass.
    ///
    /// Iterates all tasks and applies the eviction level returned by
    /// `TaskStorage::evictability()`:
    /// - `Full`: remove from map entirely
    /// - `DataAndMeta`: drop both data and meta fields, keep task in map
    /// - `DataOnly`: drop data fields only
    /// - `MetaOnly`: drop meta fields only
    /// - `No`: skip
    ///
    /// During a normal snapshot cycle, this equivalent work is interleaved
    /// across phase 1 (`take_snapshot`) and phase 3 (`end_snapshot`). This
    /// method exists for callers that need an eviction pass without driving a
    /// snapshot; it must not be called while snapshot mode is active.
    pub fn evict(&self, parent_span: Option<Id>) -> EvictionCounts {
        let span = tracing::trace_span!(
            parent: parent_span,
            "evict",
            total_task_cache_keys = self.task_cache.len(),
            total_map_keys = self.map.len(),
            counts = tracing::field::Empty,
        )
        .entered();
        debug_assert!(
            !self.snapshot_mode(),
            "Storage::evict must not be called during snapshot mode"
        );

        let counts: Vec<EvictionCounts> = parallel::map_collect(self.map.shards(), |shard| {
            let mut shard = shard.write();
            let mut evicted = EvictionCounts::default();
            // task_cache removals that we couldn't perform inline because the target shard
            // was contended. We defer them until after the map shard lock is released to
            // avoid a lock cycle with get_or_create_persistent_task, which takes task_cache
            // before map. Allocated lazily on first conflict.
            let mut deferred_task_cache_removals: Vec<Arc<CachedTaskType>> = Vec::new();
            // SAFETY: We hold the write lock for the duration of iteration.
            for bucket in unsafe { shard.iter() } {
                // SAFETY: The write lock guard outlives the bucket reference.
                let (task_id, task) = unsafe { bucket.as_mut() };
                if task_id.is_transient() {
                    evicted.unevictable_reasons[UnevictableReason::Transient.index()] += 1;
                    continue;
                }
                let (key_evictability, value_evictability) = task.get().evictability();
                apply_key_eviction_inline(
                    &self.task_cache,
                    task.get(),
                    key_evictability,
                    &mut deferred_task_cache_removals,
                    &mut evicted,
                );
                if apply_value_eviction(task.get_mut(), value_evictability, &mut evicted) {
                    // SAFETY: We hold the shard write lock; the bucket reference is still valid.
                    unsafe {
                        shard.erase(bucket);
                    }
                }
            }
            // Shrink the shard if it's less than half full, to reclaim slack capacity
            // after bulk evictions. We already hold the write lock, so this is free
            // from a locking perspective. TaskId hashing is cheap (it's just an integer).
            let len = shard.len();
            if shard.capacity() > len * 2 {
                shard.shrink_to(len, |(k, _v)| self.map.hasher().hash_one(k));
            }
            // Release the map shard lock before draining deferred removals so that a thread
            // holding a task_cache shard lock and waiting on this map shard can make progress.
            drop(shard);
            drain_deferred_task_cache_removals(
                &self.task_cache,
                deferred_task_cache_removals,
                &mut evicted,
            );
            evicted
        });

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

/// Apply the value-side of eviction to a task in-place.
///
/// Returns `true` if the task is now empty and the caller should erase it from
/// the map shard. Returns `false` otherwise (either the task is unevictable, or
/// it still has content after the partial drop).
///
/// Increments the appropriate `counts` field based on the outcome.
fn apply_value_eviction(
    task: &mut TaskStorage,
    value_evictability: ValueEvictability,
    counts: &mut EvictionCounts,
) -> bool {
    match value_evictability {
        ValueEvictability::Evictable { meta, data } => match task.drop_partial(data, meta) {
            DropPartialOutcome::Empty => {
                counts.full += 1;
                true
            }
            DropPartialOutcome::HasResidue => {
                if data && meta {
                    counts.data_and_meta += 1;
                } else if data {
                    counts.data_only += 1;
                } else {
                    debug_assert!(meta);
                    counts.meta_only += 1;
                }
                false
            }
        },
        ValueEvictability::Unevictable(reason) => {
            counts.unevictable_reasons[reason.index()] += 1;
            false
        }
    }
}

/// Record a key-side eviction without touching `task_cache`.
///
/// Used by phase 1 of the interleaved-eviction path: the `save_snapshot` batch
/// has not committed yet, so removing rows from `task_cache` would violate the
/// `CachedTaskType` → `TaskId` identity invariant (a concurrent
/// `get_or_create_task` cache-miss would allocate a fresh `TaskId` and race
/// with the in-flight batch). The caller forwards `deferred` to
/// `SnapshotGuard::deferred_task_cache_removals`, which phase 3 drains with
/// contention-safe `try_lock_and_remove` after the batch commits.
///
/// Does not touch `counts.key_evictions` — that is incremented in phase 3 only
/// after the removal actually lands in `task_cache`.
fn apply_key_eviction_deferred(
    task: &TaskStorage,
    key_evictability: KeyEvictability,
    deferred: &mut Vec<Arc<CachedTaskType>>,
) {
    match key_evictability {
        KeyEvictability::Evictable => {
            let task_type = task.get_persistent_task_type().unwrap();
            deferred.push(task_type.clone());
        }
        KeyEvictability::AlreadyEvicted | KeyEvictability::Unevictable => {}
    }
}

/// Apply the key-side (`task_cache`) eviction for a task, attempting to remove
/// inline and falling back to deferral on contention.
///
/// `get_or_create_task` acquires `task_cache` before the `map` shard, so when we
/// hold a `map` shard lock we must not block on `task_cache`. We try to acquire
/// the relevant `task_cache` shard without blocking; on `WouldBlock` the removal
/// is pushed onto `deferred` and drained after the map shard lock is released
/// (see [`drain_deferred_task_cache_removals`]).
fn apply_key_eviction_inline(
    task_cache: &FxDashMap<Arc<CachedTaskType>, TaskId>,
    task: &TaskStorage,
    key_evictability: KeyEvictability,
    deferred: &mut Vec<Arc<CachedTaskType>>,
    counts: &mut EvictionCounts,
) {
    match key_evictability {
        KeyEvictability::Evictable => {
            // The task type is persisted to backing storage (new_task = false),
            // so task_cache is a pure perf cache. Remove it now; it will be
            // re-populated by task_by_type() on the next cache miss.
            let task_type = task.get_persistent_task_type().unwrap();
            match try_lock_and_remove(task_cache, task_type.as_ref()) {
                TryLockAndRemove::Removed => {
                    counts.key_evictions += 1;
                }
                TryLockAndRemove::NotFound => {
                    // Generally this should be rare, it more or less implies something
                    // else is concurrently holding the Arc
                }
                TryLockAndRemove::WouldBlock => {
                    // Contention, to avoid a deadlock just defer
                    deferred.push(task_type.clone());
                }
            }
        }
        KeyEvictability::AlreadyEvicted | KeyEvictability::Unevictable => {}
    }
}

/// Drain `task_cache` removals that could not be performed inline.
///
/// Must be called AFTER the corresponding map shard lock has been released, to
/// avoid the `task_cache` ↔ `map` lock cycle with `get_or_create_task`.
fn drain_deferred_task_cache_removals(
    task_cache: &FxDashMap<Arc<CachedTaskType>, TaskId>,
    deferred: Vec<Arc<CachedTaskType>>,
    counts: &mut EvictionCounts,
) {
    for task_type in deferred {
        if task_cache.remove(task_type.as_ref()).is_some() {
            counts.key_evictions += 1;
        }
    }
}

pub struct StorageWriteGuard<'a> {
    storage: &'a Storage,
    inner: RefMut<'a, TaskId, Box<TaskStorage>>,
}

impl StorageWriteGuard<'_> {
    /// Tracks mutation of this task
    #[inline(always)]
    pub fn track_modification(
        &mut self,
        category: SpecificTaskDataCategory,
        #[allow(unused_variables)] name: &str,
    ) {
        debug_assert!(
            !self.inner.key().is_transient(),
            "transient task_ids should never be enqueued to be persisted"
        );
        self.track_modification_internal(
            category,
            #[cfg(feature = "trace_task_modification")]
            name,
        );
    }

    fn track_modification_internal(
        &mut self,
        category: SpecificTaskDataCategory,
        #[cfg(feature = "trace_task_modification")] name: &str,
    ) {
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
            return;
        }
        #[cfg(feature = "trace_task_modification")]
        let _span = (!modified).then(|| tracing::trace_span!("mark_modified", name).entered());
        match (self.storage.snapshot_mode(), flags.is_modified(category)) {
            (false, false) => {
                // Not in snapshot mode and item is unmodified
                if !flags.any_modified() {
                    let shard_idx = self.storage.shard_index(self.inner.key());
                    self.storage.shard_modified_counts[shard_idx].fetch_add(1, Ordering::Relaxed);
                }
                self.inner.flags.set_modified(category, true);
            }
            (false, true) => {
                // Not in snapshot mode and item is already modified
                // Do nothing
            }
            (true, false) => {
                // In snapshot mode and item is unmodified (so it's not part of the snapshot)
                // Mark it so it gets re-added as Modified after this snapshot completes.
                // Insert a None entry into snapshots so end_snapshot discovers this task
                // and promotes its _during_snapshot flags.
                if !flags.any_modified_during_snapshot() {
                    self.storage.snapshots.insert(*self.inner.key(), None);
                }
                self.inner
                    .flags
                    .set_modified_during_snapshot(category, true);
            }
            (true, true) => {
                // In snapshot mode and item is modified (so it's part of the snapshot)
                // We need to store the original version that is part of the snapshot
                if !flags.any_modified_during_snapshot() {
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
            }
        }
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
    /// Eviction mode for this snapshot. Threaded through so phases 1/3 can
    /// check it without additional parameters.
    evict: EvictMode,
    /// Counts accumulated by phase 1 (inside `take_snapshot`).
    /// One mutex acquire per shard at the end of its closure.
    phase1_counts: Mutex<EvictionCounts>,
    /// Counts accumulated by phase 3 (inside `end_snapshot`).
    phase3_counts: Mutex<EvictionCounts>,
    /// `task_cache` removals deferred by phase 1 until after `save_snapshot`
    /// commits, to preserve the `CachedTaskType` → `TaskId` identity invariant.
    /// Drained by phase 3 iff `persist_succeeded`.
    deferred_task_cache_removals: Mutex<Vec<Arc<CachedTaskType>>>,
    /// Per-shard `modified` vecs forwarded from `SnapshotShardIter::Drop`, used
    /// by phase 3's touched-set sweep to re-visit just the modified tasks that
    /// were persisted this cycle.
    touched_modified: Mutex<Vec<Vec<TaskId>>>,
    /// Set to `true` by the caller after `save_snapshot` returns Ok. Phase 3
    /// gates map-value evictions and `task_cache` removals on this flag to
    /// avoid dropping tasks whose modifications aren't on disk yet.
    persist_succeeded: AtomicBool,
    /// Set by `finish` so `Drop` knows `end_snapshot` has already run and
    /// avoids double-executing phase 3 work.
    finished: AtomicBool,
}

impl<'l> SnapshotGuard<'l> {
    fn new(storage: &'l Storage, evict: EvictMode) -> Self {
        Self {
            storage,
            scratch_buffers: ThreadLocal::new(),
            evict,
            phase1_counts: Mutex::new(EvictionCounts::default()),
            phase3_counts: Mutex::new(EvictionCounts::default()),
            deferred_task_cache_removals: Mutex::new(Vec::new()),
            touched_modified: Mutex::new(Vec::new()),
            persist_succeeded: AtomicBool::new(false),
            finished: AtomicBool::new(false),
        }
    }

    /// Mark the snapshot as successfully persisted to the backing store.
    ///
    /// Must be called by the caller between a successful `save_snapshot` return
    /// and dropping (or `finish`ing) the guard. Phase 3 will skip the eviction
    /// work that depends on disk durability when this flag is not set.
    pub fn mark_persisted(&self) {
        self.persist_succeeded.store(true, Ordering::Release);
    }

    /// End the snapshot and return the aggregated eviction counts.
    ///
    /// Consumes the guard, so the caller must ensure all `SnapshotShard` /
    /// `SnapshotShardIter` instances (which hold `Arc<SnapshotGuard>`) have been
    /// dropped. Running via this path lets `end_snapshot` emit metrics; the
    /// `Drop` fallback handles panic-safety but does not expose counts.
    pub fn finish(self) -> EvictionCounts {
        self.finished.store(true, Ordering::Release);
        self.storage.end_snapshot(&self);
        let mut totals = std::mem::take(&mut *self.phase1_counts.lock());
        totals += std::mem::take(&mut *self.phase3_counts.lock());
        totals
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
        // If `finish` already ran, phase 3 / end_snapshot work is done.
        // Drop remains to release held resources but must not re-run end_snapshot.
        if self.finished.load(Ordering::Acquire) {
            return;
        }
        self.storage.end_snapshot(self);
    }
}

pub struct SnapshotShard<'l, P> {
    shard_idx: usize,
    modified: Vec<TaskId>,
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
            next_index: 0,
        }
    }
}

/// Iterator over a single shard's snapshot items. Holds a thread-local scratch
/// buffer for the duration of iteration and returns it on drop.
pub struct SnapshotShardIter<'l, P> {
    shard: SnapshotShard<'l, P>,
    buffer: TurboBincodeBuffer,
    /// Cursor into `shard.modified`. Index-based (rather than `pop()`) so the
    /// full `modified` vec is preserved for phase 3's touched-set sweep, which
    /// runs in `Drop` and needs the list of tasks whose flags were just cleared
    /// by iteration.
    next_index: usize,
}

impl<'l, P> Iterator for SnapshotShardIter<'l, P>
where
    P: Fn(TaskId, &TaskStorage, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
{
    type Item = SnapshotItem;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some(&task_id) = self.shard.modified.get(self.next_index) {
            self.next_index += 1;
            let mut inner = self.shard.storage.map.get_mut(&task_id).unwrap();
            // If the task was re-modified during snapshot, the snapshots map may
            // hold a pre-modification copy we must serialize instead of the live
            // data. Remove the entry so end_snapshot doesn't double-promote it;
            // we promote manually below.
            let item = if inner.flags.any_modified_during_snapshot() {
                match self.shard.storage.snapshots.remove(&task_id) {
                    Some((_, Some(snapshot))) => {
                        (self.shard.process)(task_id, &snapshot, &mut self.buffer)
                    }
                    Some((_, None)) | None => {
                        (self.shard.process)(task_id, &inner, &mut self.buffer)
                    }
                }
            } else {
                (self.shard.process)(task_id, &inner, &mut self.buffer)
            };
            // Clear the modified flags that were captured into the snapshot copy,
            // then promote modified_during_snapshot → modified so the task stays
            // dirty for the next snapshot cycle.
            inner.flags.set_data_modified(false);
            inner.flags.set_meta_modified(false);
            inner.flags.set_new_task(false);
            self.shard
                .storage
                .promote_during_snapshot_flags(&mut inner, self.shard.shard_idx);
            return Some(item);
        }
        None
    }
}

impl<P> Drop for SnapshotShardIter<'_, P> {
    fn drop(&mut self) {
        self.shard
            ._guard
            .return_scratch_buffer(std::mem::take(&mut self.buffer));
        // Forward this shard's `modified` vec to the guard so phase 3's
        // touched-set sweep in `end_snapshot` can re-visit just the tasks whose
        // flags were cleared by iteration. Only when eviction is enabled —
        // otherwise the list is useless and we avoid a pointless mutex acquire.
        if self.shard._guard.evict.enabled() {
            let modified = std::mem::take(&mut self.shard.modified);
            if !modified.is_empty() {
                self.shard._guard.touched_modified.lock().push(modified);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use turbo_bincode::TurboBincodeBuffer;
    use turbo_tasks::TaskId;

    use super::{EvictMode, SpecificTaskDataCategory, Storage};
    use crate::backing_storage::SnapshotItem;

    fn non_transient_task(id: u32) -> TaskId {
        // TRANSIENT_TASK_BIT is 0x8000_0000; any id without that bit is non-transient.
        TaskId::new(id).expect("id must be non-zero")
    }

    /// A process fn that returns a non-empty SnapshotItem so the iterator doesn't
    /// silently skip items via the "encoding failed" error path.
    fn dummy_process(
        task_id: TaskId,
        _: &super::TaskStorage,
        _: &mut TurboBincodeBuffer,
    ) -> SnapshotItem {
        SnapshotItem {
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
    /// 1. Task is modified (data_modified = true) → added to shard_modified_counts.
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
        let storage = Storage::new(2, true);
        let task_id = non_transient_task(1);

        // Step 1: modify the task outside snapshot mode (data_modified = true).
        {
            let mut guard = storage.access_mut(task_id);
            guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }

        // Step 2: enter snapshot mode.
        let (snapshot_guard, has_modifications) = storage.start_snapshot(EvictMode::Disabled);
        assert!(has_modifications);

        // Step 3: `take_snapshot` scans the shard. At this point the task has
        // `any_modified()=true` and `any_modified_during_snapshot()=false`, so it
        // goes into the `modified` list inside the returned `SnapshotShard`.
        let shards = storage.take_snapshot(Arc::new(snapshot_guard), &dummy_process);

        // Step 4: now that the scan is done but before we consume the iterator,
        // modify the task again. We're still in snapshot mode, the task is already
        // modified → `(true, true)` branch: creates a snapshot copy (carrying the
        // modified bits) and sets `data_modified_during_snapshot=true`.
        {
            let mut guard = storage.access_mut(task_id);
            guard.track_modification(SpecificTaskDataCategory::Data, "test");
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
        assert_eq!(items[0].task_id, task_id);

        {
            let guard = storage.access_mut(task_id);
            // The iterator should have promoted modified_during_snapshot → modified.
            assert!(guard.flags.data_modified());
        }

        // The during-snapshot modification must be reflected in shard_modified_counts so
        // the next snapshot cycle picks it up. Verify by starting another snapshot.
        let (_guard2, has_modifications) = storage.start_snapshot(EvictMode::Disabled);
        assert!(
            has_modifications,
            "shard_modified_counts must be non-zero after promoting modified_during_snapshot"
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
        let storage = Storage::new(2, true);
        let task_id = non_transient_task(1);

        // Step 1: modify meta only, outside snapshot mode.
        {
            let mut guard = storage.access_mut(task_id);
            guard.track_modification(SpecificTaskDataCategory::Meta, "test");
            assert!(guard.flags.meta_modified());
            assert!(!guard.flags.data_modified());
        }

        // Step 2: enter snapshot mode.
        let (snapshot_guard, has_modifications) = storage.start_snapshot(EvictMode::Disabled);
        assert!(has_modifications);

        // Step 3: take_snapshot — task goes into modified list (meta_modified = true).
        let shards = storage.take_snapshot(Arc::new(snapshot_guard), &dummy_process);

        // Step 4: modify data during snapshot. The `(true, false)` branch fires:
        // data was not previously modified, so snapshots gets a None entry.
        {
            let mut guard = storage.access_mut(task_id);
            guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(guard.flags.data_modified_during_snapshot());
            assert!(!guard.flags.meta_modified_during_snapshot());
        }

        // Step 5: consume the iterator — must not panic.
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id, task_id);

        {
            let guard = storage.access_mut(task_id);
            // meta_modified was cleared by the iterator (it was the pre-snapshot flag).
            assert!(!guard.flags.meta_modified());
            // data_modified_during_snapshot was promoted to data_modified.
            assert!(guard.flags.data_modified());
            assert!(!guard.flags.data_modified_during_snapshot());
        }

        // Next snapshot cycle must pick up the promoted data_modified.
        let (_guard2, has_modifications) = storage.start_snapshot(EvictMode::Disabled);
        assert!(
            has_modifications,
            "shard_modified_counts must be non-zero after promoting data_modified_during_snapshot"
        );
    }
}
