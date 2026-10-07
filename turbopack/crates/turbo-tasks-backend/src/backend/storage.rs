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

use anyhow::{Context, Result};
use crossbeam_utils::CachePadded;
use hashbrown::hash_table;
use smallvec::SmallVec;
use thread_local::ThreadLocal;
use tracing::span::Id;
use turbo_bincode::{TurboBincodeBuffer, new_turbo_bincode_decoder, new_turbo_bincode_encoder};
use turbo_tasks::{FxDashMap, TaskId, backend::CachedTaskTypeArc, event::Event, parallel};

use crate::{
    backend::{
        snapshot_coordinator::SnapshotPhase,
        storage_schema::{
            DropPartialOutcome, KeyEvictability, TaskStorage, UnevictableReason, ValueEvictability,
        },
    },
    backing_storage::{SnapshotItem, compute_task_type_hash},
    database::key_value_database::KeySpace,
    utils::{
        dash_map_drop_contents::drop_contents,
        dash_map_entry::{TryLockAndRemove, try_lock_and_remove},
        dash_map_multi::{RefMut, get_disjoint_mut},
        shard_amount::compute_shard_amount,
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
    /// Nothing was tracked: the category was already modified. Undo is a no-op.
    NoChange,
    /// `modified(category)` was set. `bumped` is true if this call also incremented the per-shard
    /// modified counter (i.e. the task had no prior modifications). `inserted_snapshot` is true if
    /// this call also inserted the task's pre-mutation encoded state into the `snapshots` map
    /// (the task was captured by the in-progress snapshot and not persisted yet).
    Tracked {
        category: SpecificTaskDataCategory,
        bumped: bool,
        inserted_snapshot: bool,
    },
}

impl TaskDataCategory {
    /// The categories captured by the in-progress snapshot that are not persisted yet.
    fn from_snapshot_pending(task: &TaskStorage) -> Self {
        Self::from_flags(
            task.flags.meta_snapshot_pending(),
            task.flags.data_snapshot_pending(),
        )
    }

    /// The task's unpersisted modifications (used in drain mode, where nothing is captured
    /// because the map is discarded right after the snapshot).
    fn from_modified(task: &TaskStorage) -> Self {
        Self::from_flags(task.flags.meta_modified(), task.flags.data_modified())
    }

    fn from_flags(meta: bool, data: bool) -> Self {
        match (meta, data) {
            (true, true) => Self::All,
            (true, false) => Self::Meta,
            (false, true) => Self::Data,
            (false, false) => unreachable!(
                "snapshots only persist modified tasks, so at least one category is set"
            ),
        }
    }
}

/// Encodes task data, using the provided buffer as a scratch space.  Returns a new exactly sized
/// buffer.
/// This allows reusing the buffer across multiple encode calls to optimize allocations and
/// resulting buffer sizes.
///
/// TODO: The `Result` return type is an artifact of the bincode `Encode` trait requiring
/// fallible encoding. In practice, encoding to a `SmallVec` is infallible (no I/O), and the only
/// real failure mode — a `TypedSharedReference` whose value type has no bincode impl — is a
/// programmer error caught by the panic in the caller. Consider making the bincode encoding trait
/// infallible (i.e. returning `()` instead of `Result<(), EncodeError>`) to eliminate the
/// spurious `Result` threading throughout the encode path.
pub(crate) fn encode_task_contents(
    task: TaskId,
    data: &TaskStorage,
    category: SpecificTaskDataCategory,
    scratch_buffer: &mut TurboBincodeBuffer,
) -> Result<TurboBincodeBuffer> {
    scratch_buffer.clear();
    let mut encoder = new_turbo_bincode_encoder(scratch_buffer);
    data.encode(category, &mut encoder)?;

    if cfg!(feature = "verify_serialization") {
        TaskStorage::new()
            .decode(
                category,
                &mut new_turbo_bincode_decoder(&scratch_buffer[..]),
            )
            .with_context(|| {
                format!(
                    "expected to be able to decode serialized data for '{category:?}' information \
                     for {task}"
                )
            })?;
    }
    Ok(SmallVec::from_slice(scratch_buffer))
}

/// Converts a task's current state into the [`SnapshotItem`] that persistence writes for it.
///
/// Only the categories in `category` are encoded. A `new_task` (per the task's flag) additionally
/// carries its task type hash so it can be added to the task cache. A GC-deleted task becomes a
/// [`SnapshotItem::Delete`] tombstone.
///
/// This is shared by the regular snapshot path and by [`StorageWriteGuard::track_modification`],
/// which encodes a task eagerly when it is about to be mutated while a snapshot that captured it
/// has not persisted it yet. Consistency checks run where items are yielded instead (see
/// `SnapshotShardIter`), since this may run in the middle of an operation.
pub(crate) fn encode_snapshot_item(
    task_id: TaskId,
    inner: &TaskStorage,
    category: TaskDataCategory,
    buffer: &mut TurboBincodeBuffer,
) -> Result<SnapshotItem> {
    if task_id.is_transient() {
        unreachable!("transient task_ids should never be enqueued to be persisted");
    }

    if inner.flags.deleted() {
        let task_type_hash = compute_task_type_hash(
            inner
                .get_persistent_task_type()
                .expect("a GC-deleted task must have a task type"),
        );
        return Ok(SnapshotItem::Delete {
            task_id,
            task_type_hash,
        });
    }

    let meta = if category.includes_meta() {
        Some(
            encode_task_contents(task_id, inner, SpecificTaskDataCategory::Meta, buffer)
                .context("failed to encode task meta data")?,
        )
    } else {
        None
    };

    let data = if category.includes_data() {
        Some(
            encode_task_contents(task_id, inner, SpecificTaskDataCategory::Data, buffer)
                .context("failed to encode task data")?,
        )
    } else {
        None
    };

    let task_type_hash = if inner.flags.new_task() {
        let task_type = inner.get_persistent_task_type().expect(
            "It is not possible for a new_task to not have a persistent_task_type.  Task creation \
             for persistent tasks uses a single ExecutionContextImpl for creating the task (which \
             sets new_task) and connect_child (which sets persistent_task_type) and take_snapshot \
             waits for all operations to complete before we start snapshotting.  So task creation \
             will always set the task_type.",
        );
        Some(compute_task_type_hash(task_type))
    } else {
        None
    };

    Ok(SnapshotItem::Put {
        task_id,
        meta,
        data,
        task_type_hash,
        #[cfg(feature = "print_cache_item_size")]
        stats: Box::new(snapshot_item_stats(inner)),
    })
}

/// Captures the cache size statistics of the task state being encoded.
#[cfg(feature = "print_cache_item_size")]
fn snapshot_item_stats(inner: &TaskStorage) -> crate::backing_storage::SnapshotItemStats {
    crate::backing_storage::SnapshotItemStats {
        task_name: inner
            .get_persistent_task_type()
            .map(|t| t.to_string())
            .unwrap_or_else(|| "<unknown>".to_string()),
        counts: inner.meta_counts(),
        output_size: inner.get_output().map_or(0, |output| {
            turbo_bincode::turbo_bincode_encode(&output).map_or(0, |data| data.len())
        }),
    }
}

pub struct Storage {
    snapshot_mode: AtomicBool,
    /// Per-shard counts of tasks with modified flags set. Incremented when a task
    /// transitions from unmodified to modified. Reset to zero when `take_snapshot` captures the
    /// shard's modified tasks (clearing their modified flags). Used to skip unmodified
    /// shards in `take_snapshot`, avoiding unnecessary iteration and enabling early returns
    ///
    /// Indexed by `map.determine_shard(map.hash_usize(&key))` and guaranteed by construction so
    /// that  `shard_modified_counts.len()==map.shards().len()`
    ///
    /// Should only be modified while holding the corresponding dashmap shard lock.
    shard_modified_counts: Box<[CachePadded<AtomicU64>]>,
    /// Copy-on-write snapshots of tasks that are currently enqueued for persistence (they have
    /// `*_snapshot_pending` flags) and then modified.
    /// Captured as `SnapshotItem` to defend against interior mutability in tasks carrying `State`.
    /// Entries are removed when the iterator persists the task, and any left over (persisting
    /// failed) are cleared when the snapshot ends, so the map is empty outside of snapshots.
    ///
    /// Lock Ordering: `snapshots` locks are acquired **after** `map` locks (see the comment on
    /// `map` below). Holding a `snapshots` shard write lock and then trying to take a `map` shard
    /// write lock is forbidden — it would deadlock against `track_modification_internal` /
    /// `SnapshotShardIter::next`, which take map first.
    snapshots: FxDashMap<TaskId, Box<SnapshotItem>>,
    /// The main storage map
    ///
    /// Lock Ordering: Task creation acquires a `task_cache` lock and then inserts into this map.
    /// Because both datastructures are sharded on different keys, the locks are not 'strictly'
    /// ordered but we should treat them as such
    /// Acquiring locks in the opposite order should be defensive
    ///
    /// Lock Ordering vs. `snapshots`: `map` locks are acquired **before** `snapshots` locks.
    /// `track_modification_internal` and `SnapshotShardIter::next` both
    /// hold a `map` shard write lock (via `StorageWriteGuard` / `map.get_mut`) and then take a
    /// `snapshots` shard lock.
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
    pub task_cache: FxDashMap<CachedTaskTypeArc, TaskId>,
}

/// Options for [`Storage::new`].
#[derive(Debug, Clone, Copy)]
pub struct StorageOptions {
    /// Number of shards of the task map (and of the per-shard modified counters).
    pub shard_amount: usize,
    /// Preallocate a small task map instead of a large one (e.g. for tests or short-lived
    /// instances).
    pub small_preallocation: bool,
}

impl Default for StorageOptions {
    fn default() -> Self {
        Self {
            shard_amount: compute_shard_amount(None, false),
            small_preallocation: false,
        }
    }
}

#[cfg(test)]
impl StorageOptions {
    /// Small storage for unit tests.
    pub(crate) fn for_tests() -> Self {
        Self {
            shard_amount: 2,
            small_preallocation: true,
        }
    }
}

impl Storage {
    pub fn new(options: StorageOptions) -> Self {
        let StorageOptions {
            shard_amount,
            small_preallocation,
        } = options;
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
            .map(|_| CachePadded::new(AtomicU64::new(0)))
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

    /// Mark a newly allocated task as restored (skip DB queries) and new (include in persistence
    /// snapshots). Optionally sets the `persistent_task_type` eagerly so it's available for
    /// persistence snapshots without needing to propagate it through `connect_child`.
    pub fn initialize_new_task(&self, task_id: TaskId, task_type: Option<CachedTaskTypeArc>) {
        let mut task = self.access_mut(task_id);
        task.flags.set_restored(TaskDataCategory::All);
        task.flags.set_new_task(true);
        task.gc_pin_for_construction();
        if let Some(task_type) = task_type {
            task.set_persistent_task_type(task_type);
            if !task_id.is_transient() {
                // Unconditional track: a new task's type is always a real persistable change.
                let _ =
                    task.track_modification(SpecificTaskDataCategory::Data, "persistent_task_type");
            }
        }
    }

    /// Captures every modified task and returns iterators that persist them. Ends snapshot mode
    /// when the returned `SnapshotGuard` (held by each shard) is dropped.
    ///
    /// Requiring the `SnapshotPhase` ensures the capture runs while operations are excluded, so it
    /// is consistent: for each modified task it records the modified categories as
    /// `*_snapshot_pending` and clears the live `modified` flags. Modifications after the
    /// exclusion then land on the task as normal modifications for the next snapshot, and only
    /// captured tasks that are modified before they are persisted need a copy-on-write snapshot
    /// (see `Storage::snapshots`). Encoding happens later, in the returned iterators, which may
    /// outlive the phase.
    ///
    /// `process` is called with the task storage and the categories to encode. It receives a
    /// mutable scratch buffer that can be reused across iterations to avoid repeated allocations.
    ///
    /// `inspect_snapshot_item` allows gathering statistics about encoded items
    ///
    /// The returned iterators are guaranteed to be non-empty. If persisting stops before a
    /// captured task is yielded (it failed), dropping the shard clears the task's
    /// `*_snapshot_pending` flags: a failed persist disables persistence for the session.
    ///
    /// When `drain_entries` is true (shutdown only), the scan drains the map: unmodified entries
    /// are erased and freed immediately, and the modified entries are moved out into the
    /// returned shard iterators, which free each task's memory as it is serialized rather than
    /// after the whole batch is written.
    pub fn take_snapshot<
        'l,
        P: for<'a> Fn(
                TaskId,
                &'a TaskStorage,
                TaskDataCategory,
                &mut TurboBincodeBuffer,
            ) -> SnapshotItem
            + Sync,
        I: Fn(&SnapshotItem) + Sync,
    >(
        &'l self,
        _phase: &SnapshotPhase<'_>,
        guard: SnapshotGuard<'l>,
        process: &'l P,
        inspect_snapshot_item: &'l I,
        drain_entries: bool,
    ) -> Vec<SnapshotShard<'l, P, I>> {
        let guard = Arc::new(guard);

        let shards: Vec<_> = self.map.shards().iter().enumerate().collect();

        // The number of shards is much larger than the number of threads, so the effect of the
        // locks held is negligible.
        parallel::map_collect::<_, _, Vec<_>>(&shards, |&(shard_idx, shard)| {
            // Check how many modifications there are in this shard. Operations are excluded, so
            // there are no racing writes and we can reset the count: every modified task in the
            // shard is captured (and its modified flags cleared) below.
            let modified_count = self.shard_modified_counts[shard_idx].swap(0, Ordering::Relaxed);

            if modified_count == 0 && !drain_entries {
                // Nothing to persist in this shard and we're keeping the map, so skip the scan.
                // TODO: when not draining but eviction is enabled we should run that logic here as
                // well
                return None;
            }

            // Scan the shard once, building the work this shard's iterator will perform. The two
            // modes carry different data so that `next` has no per-item `drain` branch:
            // - keep mode collects the modified `TaskId`s and looks them up again while iterating.
            // - drain mode erases the unmodified entries here and then moves the remaining
            //   (modified-only) table out of the map, so the iterator owns and drains it directly.
            let work = {
                let mut shard_guard = shard.write();
                if drain_entries {
                    shard_guard.retain(|(key, task)| {
                        let modified_task = task.flags.any_modified();
                        if modified_task {
                            debug_assert!(
                                !key.is_transient(),
                                "found a modified transient task: {key:?}"
                            );
                        }
                        // Unmodified entries are not part of the snapshot. Remove and free them
                        // now so the table we move out below holds only modified entries.
                        modified_task
                    });
                    if shard_guard.is_empty() {
                        // The shard held only unmodified entries, which we've now erased and freed.
                        // No iterator is created for an empty shard.
                        return None;
                    }
                    // Move the modified-only table out of the map. Iterating it frees each task box
                    // as it is serialized, and the shard's table allocation is released here.
                    ShardWork::Drain(std::mem::take(&mut *shard_guard).into_iter())
                } else {
                    let mut modified = Vec::with_capacity(modified_count as usize);
                    for (key, task) in shard_guard.iter_mut() {
                        // Only check modified flags — transient tasks never have modified flags set
                        // (track_modification guards against it), so this naturally excludes them.
                        // new_task always comes with modified flags (set_persistent_task_type calls
                        // track_modification), so any_modified() is sufficient.
                        if task.flags.any_modified() {
                            debug_assert!(
                                !key.is_transient(),
                                "found a modified transient task: {key:?}"
                            );
                            debug_assert!(!task.flags.any_snapshot_pending());
                            // Capture: move the modified categories to `*_snapshot_pending`.
                            // `new_task` stays set until the task is persisted; it can't be set
                            // again on an existing task, so it still reflects the capture.
                            let flags = &mut task.flags;
                            flags.set_meta_snapshot_pending(flags.meta_modified());
                            flags.set_data_snapshot_pending(flags.data_modified());
                            flags.set_meta_modified(false);
                            flags.set_data_modified(false);
                            modified.push(*key);
                        }
                    }
                    // modified_count > 0 (we returned early otherwise), so this is never empty.
                    debug_assert!(!modified.is_empty());
                    ShardWork::Keep(modified)
                }
            };

            Some(SnapshotShard {
                work,
                storage: self,
                process,
                inspect_snapshot_item,
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
    /// in `take_snapshot` as each shard is captured, not here — resetting eagerly
    /// would lose the counts `take_snapshot` uses to skip unmodified shards.
    ///
    /// Safety invariant: `start_snapshot` and `end_snapshot` are always called
    /// sequentially within a single `snapshot_and_persist` invocation (the sole
    /// caller). There is no concurrent snapshot lifecycle, so they cannot race.
    pub fn start_snapshot(&self) -> (SnapshotGuard<'_>, bool) {
        // Enter snapshot mode so track_modification copies captured tasks
        // (copy-on-write) before mutating them.
        self.snapshot_mode.store(true, Ordering::Release);
        // Check if any shard has modifications. Don't reset counts here —
        // take_snapshot resets per-shard counts as it captures each shard,
        // and uses them to skip shards without modifications.
        let has_modifications = self
            .shard_modified_counts
            .iter()
            .any(|c| c.load(Ordering::Relaxed) > 0);
        (SnapshotGuard::new(self), has_modifications)
    }

    /// End snapshot mode.
    ///
    /// Captured tasks are persisted by the shard iterators, which also remove their `snapshots`
    /// entries. If persisting failed, the dropped shards already cleared the pending flags of
    /// unyielded tasks, so no new entries can appear; the ones left behind are dropped here
    /// (persistence is disabled for the session after a failure).
    fn end_snapshot(&self) {
        self.snapshot_mode.store(false, Ordering::Release);
        self.snapshots.clear();
        // If we are saving a non-trivial amount of memory just clear it out.
        if self.snapshots.capacity() > 1024 {
            self.snapshots.shrink_to_fit();
        }
    }

    /// Returns true if actively snapshotting.
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

    /// Like [`Self::access_mut`], but keeps the map entry so the caller can still remove it.
    pub fn access_entry_mut(&self, key: TaskId) -> TaskEntryGuard<'_> {
        let entry = match self.map.entry(key) {
            dashmap::mapref::entry::Entry::Occupied(e) => e,
            dashmap::mapref::entry::Entry::Vacant(e) => {
                e.insert_entry(Box::new(TaskStorage::new()))
            }
        };
        TaskEntryGuard {
            storage: self,
            entry,
        }
    }

    /// Read-only access to an already resident task. Returns `None` if the task isnt in memory
    /// resident. The closure runs while a shard read lock is held, so it must be cheap and must
    /// not re-enter the map.
    pub fn with_task<R>(&self, key: TaskId, f: impl FnOnce(&TaskStorage) -> R) -> Option<R> {
        let task = self.map.get(&key)?;
        Some(f(task.value()))
    }

    /// The number of tasks resident in the map.
    #[doc(hidden)]
    pub fn resident_task_count_for_testing(&self) -> usize {
        self.map.len()
    }

    /// The number of shards in the resident map. GC seeds one `ScanShard` job per index; the slice
    /// returned by `map.shards()` is fixed for the map's lifetime, so an index is a stable handle
    /// to one shard.
    pub fn shard_count(&self) -> usize {
        self.map.shards().len()
    }

    /// Scans a **single** shard by index, invoking `on_candidate` for each resident task whose
    /// storage passes [`TaskStorage::gc_collectible`].
    pub fn gc_scan_shard(&self, index: usize, mut on_candidate: impl FnMut(TaskId)) {
        let shard = self.map.shards()[index].read();
        for (task_id, task) in shard.iter() {
            if task.gc_collectible() {
                on_candidate(*task_id);
            }
        }
    }

    /// Return the set of all known live roots.
    pub fn gc_scan_roots(&self) -> impl Iterator<Item = TaskId> {
        let per_shard: Vec<Vec<TaskId>> =
            parallel::map_collect(&(0..self.shard_count()).collect::<Vec<_>>(), |&index| {
                let mut roots = Vec::new();
                let shard = self.map.shards()[index].read();
                for (task_id, task) in shard.iter() {
                    if !task_id.is_transient() && task.gc_is_root() {
                        roots.push(*task_id);
                    }
                }
                roots
            });

        per_shard.into_iter().flatten()
    }

    pub fn access_pair_mut(
        &self,
        key1: TaskId,
        key2: TaskId,
    ) -> (StorageWriteGuard<'_>, StorageWriteGuard<'_>) {
        let (a, b) = get_disjoint_mut(&self.map, key1, key2, || Box::new(TaskStorage::new()));
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

        let counts: Vec<EvictionCounts> = parallel::map_collect(self.map.shards(), |shard| {
            let mut shard = shard.write();
            let mut evicted = EvictionCounts::default();
            // task_cache removals that we couldn't perform inline because the target shard
            // was contended. We defer them until after the map shard lock is released to
            // avoid a lock cycle with get_or_create_persistent_task, which takes task_cache
            // before map. Allocated lazily on first conflict.
            let mut deferred_task_cache_removals: Vec<CachedTaskTypeArc> = Vec::new();
            // Remove a task type from `task_cache`, deferring on contention. Shared by the
            // GC-deleted path below and the ordinary key eviction.
            let remove_from_task_cache =
                |evicted: &mut EvictionCounts,
                 deferred: &mut Vec<CachedTaskTypeArc>,
                 task_type: &CachedTaskTypeArc| {
                    match try_lock_and_remove(&self.task_cache, task_type.as_ref()) {
                        TryLockAndRemove::Removed => {
                            evicted.key_evictions += 1;
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
                };
            shard.retain(|(task_id, task)| {
                // Transient tasks can not be evicted at all, unless they are fully
                // delete by the GC.
                if task_id.is_transient() && !task.flags.deleted() {
                    evicted.unevictable_reasons[UnevictableReason::Transient.index()] += 1;
                    return true;
                }
                // All GC'd tasks were tombstoned during the snapshot (or are not persisted) so we
                // can drop them fully now.
                if task.flags.deleted() {
                    if let Some(task_type) = task.get_persistent_task_type() {
                        remove_from_task_cache(
                            &mut evicted,
                            &mut deferred_task_cache_removals,
                            task_type,
                        );
                    }
                    evicted.full += 1;
                    return false;
                }
                let (key_evictability, value_evictability) = task.evictability();
                match key_evictability {
                    KeyEvictability::Evictable => {
                        // The task type is persisted to backing storage (new_task = false),
                        // so task_cache is a pure perf cache. Remove it now; it will be
                        // re-populated by task_by_type() on the next cache miss.
                        let task_type = task.get_persistent_task_type().unwrap();
                        // Only try to acquire the lock, if we cannot just remove at the end
                        // Because `get_or_create_task` acquires 'task_cache' then `storage.map` and
                        // we do the opposite we need to be defensive here.  Attempting here is just
                        // an optimization to avoid pushing into `deferred_task_cache_removals`
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
                                return false;
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
                true
            });
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
            for task_type in deferred_task_cache_removals {
                if self.task_cache.remove(task_type.as_ref()).is_some() {
                    evicted.key_evictions += 1;
                }
            }
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

/// A write guard that still owns its map entry, so the task can be removed under the lock that is
/// already held.
///
/// Use [`Storage::access_entry_mut`] to obtain one. Convert it with [`Self::into_write_guard`] once
/// removal is no longer a possibility, or call [`Self::discard`] to drop the entry outright.
pub struct TaskEntryGuard<'a> {
    storage: &'a Storage,
    entry: dashmap::mapref::entry::OccupiedEntry<'a, TaskId, Box<TaskStorage>>,
}

impl<'a> TaskEntryGuard<'a> {
    /// Removes this task's entry.
    pub fn discard(self) {
        self.entry.remove();
    }

    /// Gives up the ability to remove the entry, yielding an ordinary write guard.
    pub fn into_write_guard(self) -> StorageWriteGuard<'a> {
        StorageWriteGuard {
            storage: self.storage,
            inner: self.entry.into_ref().into(),
        }
    }
}

impl Deref for TaskEntryGuard<'_> {
    type Target = TaskStorage;
    fn deref(&self) -> &Self::Target {
        self.entry.get()
    }
}

impl DerefMut for TaskEntryGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.entry.get_mut()
    }
}

pub struct StorageWriteGuard<'a> {
    storage: &'a Storage,
    inner: RefMut<'a, TaskId, Box<TaskStorage>>,
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
        // All callers (TaskGuard, initialize_new_task) already
        // guard against this, but we enforce it here as defense-in-depth.
        debug_assert!(
            !self.inner.key().is_transient(),
            "track_modification called on transient task {:?}",
            self.inner.key()
        );
        if self.inner.flags.is_modified(category) {
            return TrackOutcome::NoChange;
        }
        #[cfg(feature = "trace_task_modification")]
        let _span = tracing::trace_span!("mark_modified", name).entered();
        // If the in-progress snapshot captured this task and hasn't persisted it yet, freeze the
        // captured categories before this mutation lands (copy-on-write). Only the first
        // modification after the capture needs to do this; later ones find the entry. Pending
        // flags only exist during snapshot mode: tasks a failed persist didn't reach are cleared
        // when their shard drops, before the snapshot ends.
        let inserted_snapshot =
            self.inner.flags.any_snapshot_pending() && self.maybe_encode_for_snapshot();
        let bumped = !self.inner.flags.any_modified();
        if bumped {
            let shard_idx = self.storage.shard_index(self.inner.key());
            self.storage.shard_modified_counts[shard_idx].fetch_add(1, Ordering::Relaxed);
        }
        self.inner.flags.set_modified(category, true);
        TrackOutcome::Tracked {
            category,
            bumped,
            inserted_snapshot,
        }
    }

    /// Stores a copy-on-write snapshot of the task's captured, not yet persisted
    /// (`*_snapshot_pending`) categories in `snapshots`, for the racing persistence to write
    /// instead of the live data. Returns whether it inserted one: `false` if the task already
    /// has an entry (an earlier modification after the capture made it).
    #[cold]
    fn maybe_encode_for_snapshot(&self) -> bool {
        let task_id = *self.inner.key();
        if self.storage.snapshots.contains_key(&task_id) {
            return false;
        }
        let mut buffer = TurboBincodeBuffer::new();
        let item = encode_snapshot_item(
            task_id,
            &self.inner,
            TaskDataCategory::from_snapshot_pending(&self.inner),
            &mut buffer,
        )
        .unwrap_or_else(|err| panic!("Serializing task {task_id} for a snapshot failed: {err:?}"));
        self.storage.snapshots.insert(task_id, Box::new(item));
        true
    }

    /// Reverse a [`TrackOutcome`] produced by [`Self::track_modification`] when the mutation it
    /// guarded changed nothing persistable.
    ///
    /// # Correctness
    ///
    /// The `outcome` MUST be applied to the **same `StorageWriteGuard`** that produced it, with the
    /// map shard write lock held continuously in between — i.e. `track_modification`, the mutation,
    /// and `undo_track_modification` all run within one guard's lifetime. The guard holds its shard
    /// write lock for its whole lifetime, so this guarantees no other thread observed the tracked
    /// state, and that `bumped` / `inserted_snapshot` still describe reality (the counter and
    /// `snapshots` entry are only mutated under that lock). Because those flags record whether
    /// *this* call created the state, undo never clears a flag, counter, or snapshot entry that a
    /// prior modification owns.
    pub fn undo_track_modification(&mut self, outcome: TrackOutcome) {
        match outcome {
            TrackOutcome::NoChange => {}
            TrackOutcome::Tracked {
                category,
                bumped,
                inserted_snapshot,
            } => {
                self.inner.flags.set_modified(category, false);
                if bumped {
                    let shard_idx = self.storage.shard_index(self.inner.key());
                    self.storage.shard_modified_counts[shard_idx].fetch_sub(1, Ordering::Relaxed);
                }
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
            let shard_idx = self.storage.shard_index(self.inner.key());
            self.storage.shard_modified_counts[shard_idx].fetch_sub(1, Ordering::Relaxed);
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

/// The work a single shard's iterator performs, with the snapshot mode encoded in the data rather
/// than a runtime flag re-checked per item. Built by `take_snapshot`'s scan.
enum ShardWork {
    /// Normal snapshot: the tasks captured by the scan. Each is looked up in the map while
    /// iterating and persisted from its copy-on-write snapshot (if it was modified since the
    /// capture) or from its live state, then its `*_snapshot_pending` flags are cleared.
    Keep(Vec<TaskId>),
    /// Shutdown drain: the scan already erased the unmodified entries and moved the remaining
    /// (modified-only) shard table out of the map. The iterator owns that table and drains it
    /// directly, freeing each task box as it is serialized. No second map lookup, no flag
    /// bookkeeping (the whole map is discarded right after this snapshot).
    Drain(hash_table::IntoIter<(TaskId, Box<TaskStorage>)>),
}

pub struct SnapshotShard<'l, P, I> {
    work: ShardWork,
    storage: &'l Storage,
    process: &'l P,
    inspect_snapshot_item: &'l I,
    /// Held for its `Drop` impl — ensures snapshot mode ends when all shards are done.
    _guard: Arc<SnapshotGuard<'l>>,
}

impl<'l, P, I> IntoIterator for SnapshotShard<'l, P, I>
where
    P: Fn(TaskId, &TaskStorage, TaskDataCategory, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
    I: Fn(&SnapshotItem) + Sync,
{
    type Item = SnapshotItem;
    type IntoIter = SnapshotShardIter<'l, P, I>;

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
pub struct SnapshotShardIter<'l, P, I> {
    shard: SnapshotShard<'l, P, I>,
    buffer: TurboBincodeBuffer,
}

impl<'l, P, I> Iterator for SnapshotShardIter<'l, P, I>
where
    P: Fn(TaskId, &TaskStorage, TaskDataCategory, &mut TurboBincodeBuffer) -> SnapshotItem + Sync,
    I: Fn(&SnapshotItem) + Sync,
{
    type Item = SnapshotItem;

    fn next(&mut self) -> Option<Self::Item> {
        let process = self.shard.process;
        let inspect_snapshot_item = self.shard.inspect_snapshot_item;
        let buffer = &mut self.buffer;
        match &mut self.shard.work {
            ShardWork::Keep(captured) => {
                // Pop only once the task is done: if encoding or inspection panics, the task
                // stays in `captured` so dropping the shard clears its pending flags.
                let &task_id = captured.last()?;
                let storage = self.shard.storage;
                let mut inner = storage.map.get_mut(&task_id).unwrap();
                debug_assert_persistable(&inner);
                // If the task was modified since the capture, `track_modification` already encoded
                // its captured state; persist that instead of the (newer) live data.
                let item = match storage.snapshots.remove(&task_id) {
                    Some((_, item)) => *item,
                    None => process(
                        task_id,
                        &inner,
                        TaskDataCategory::from_snapshot_pending(&inner),
                        buffer,
                    ),
                };
                inspect_snapshot_item(&item);
                // The captured state is persisted. Modifications since the capture (if any) are
                // already tracked by the live `modified` flags.
                inner.flags.set_meta_snapshot_pending(false);
                inner.flags.set_data_snapshot_pending(false);
                inner.flags.set_new_task(false);
                captured.pop();
                Some(item)
            }
            ShardWork::Drain(entries) => {
                // Shutdown only: the scan already moved this shard's modified entries out of the
                // map, so we own each `Box<TaskStorage>` here. Serialize from a borrow of the owned
                // box and let it drop at the end of this branch — freeing the task's memory as it
                // is persisted rather than after the whole batch is written. We skip the flag
                // bookkeeping the normal path does, since the entire map is discarded right after
                // this snapshot.
                let (task_id, inner) = entries.next()?;
                debug_assert_persistable(&inner);
                let item = process(
                    task_id,
                    &inner,
                    TaskDataCategory::from_modified(&inner),
                    buffer,
                );
                inspect_snapshot_item(&item);
                Some(item)
            }
        }
    }
}

/// Consistency check for a task the snapshot iterators are about to yield. Runs here rather than
/// in `encode_snapshot_item`, which copy-on-write may call in the middle of an operation.
fn debug_assert_persistable(inner: &TaskStorage) {
    debug_assert!(
        !(inner.flags.deleted() && inner.flags.new_task()),
        "a scanned GC-deleted task must be persisted; new tasks are discarded by GC"
    );
}

impl<P, I> Drop for SnapshotShardIter<'_, P, I> {
    fn drop(&mut self) {
        self.shard
            ._guard
            .return_scratch_buffer(std::mem::take(&mut self.buffer));
    }
}

impl<P, I> Drop for SnapshotShard<'_, P, I> {
    /// Tasks still in a `Keep` list were captured but not persisted: persisting stopped early
    /// (it failed or panicked). Persisting is disabled for the session after that, so clear their
    /// pending flags now. This runs before `end_snapshot` (each shard holds a guard reference), so
    /// pending flags never outlive snapshot mode and copy-on-write doesn't need to check it.
    fn drop(&mut self) {
        if let ShardWork::Keep(captured) = &self.work {
            for task_id in captured {
                if let Some(mut inner) = self.storage.map.get_mut(task_id) {
                    inner.flags.set_meta_snapshot_pending(false);
                    inner.flags.set_data_snapshot_pending(false);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::Ordering;

    use turbo_bincode::TurboBincodeBuffer;
    use turbo_tasks::TaskId;

    use super::{
        SnapshotGuard, SnapshotShard, SpecificTaskDataCategory, Storage, StorageOptions,
        TaskDataCategory, TaskStorage, TrackOutcome, encode_task_contents,
    };
    use crate::{
        backend::snapshot_coordinator::SnapshotCoordinator, backing_storage::SnapshotItem,
        data::OutputValue,
    };

    fn non_transient_task(id: u32) -> TaskId {
        // TRANSIENT_TASK_BIT is 0x2000_0000; any id without that bit is non-transient.
        TaskId::new(id).expect("id must be non-zero")
    }

    #[test]
    fn new_task_is_pinned_during_construction() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = non_transient_task(1);

        storage.initialize_new_task(task_id, None);

        let task = storage.access_mut(task_id);
        assert_eq!(task.gc_transient_ref_count(), 1);
        assert!(!task.gc_collectible());
    }

    /// A process fn that returns a non-empty SnapshotItem so the iterator doesn't
    /// silently skip items via the "encoding failed" error path.
    fn dummy_process(
        task_id: TaskId,
        _: &super::TaskStorage,
        _: TaskDataCategory,
        _: &mut TurboBincodeBuffer,
    ) -> SnapshotItem {
        SnapshotItem::Put {
            task_id,
            meta: Some(TurboBincodeBuffer::default()),
            data: None,
            task_type_hash: None,
            #[cfg(feature = "print_cache_item_size")]
            stats: Default::default(),
        }
    }

    /// An `inspect_snapshot_item` callback that ignores the items.
    fn noop_inspect(_: &SnapshotItem) {}

    /// Calls `Storage::take_snapshot` inside a snapshot phase of a local coordinator, standing in
    /// for the backend's operation exclusion.
    fn take_snapshot<'l, P, I>(
        storage: &'l Storage,
        guard: SnapshotGuard<'l>,
        process: &'l P,
        inspect_snapshot_item: &'l I,
        drain_entries: bool,
    ) -> Vec<SnapshotShard<'l, P, I>>
    where
        P: Fn(TaskId, &TaskStorage, TaskDataCategory, &mut TurboBincodeBuffer) -> SnapshotItem
            + Sync,
        I: Fn(&SnapshotItem) + Sync,
    {
        let coordinator = SnapshotCoordinator::new();
        let phase = coordinator
            .try_begin_snapshot()
            .expect("no operations are running");
        storage.take_snapshot(&phase, guard, process, inspect_snapshot_item, drain_entries)
    }

    /// Regression test: a task modified before a snapshot and then modified *again* during
    /// snapshot iteration must serialize the captured state and carry the new modification
    /// forward to the next cycle.
    ///
    /// Sequence of events:
    /// 1. Task is modified (data_modified = true) → added to shard_modified_counts.
    /// 2. `start_snapshot` puts us in snapshot mode.
    /// 3. `take_snapshot` captures the task: `data_modified` moves to `data_snapshot_pending`.
    /// 4. **Between capture and iteration**: `track_modification` is called on the same category.
    ///    The task is pending and has no copy-on-write snapshot yet, so its captured state is
    ///    encoded into `snapshots`, and `data_modified` is set again.
    /// 5. `SnapshotShardIter::next` yields the pre-encoded item, removes the snapshots entry, and
    ///    clears the pending flag. `data_modified` stays set for the next cycle.
    // `take_snapshot` uses `parallel::map_collect` which calls `block_in_place` internally,
    // requiring a multi-threaded Tokio runtime.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_during_snapshot_clears_live_modified_flags() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = non_transient_task(1);

        // Step 1: modify the task outside snapshot mode (data_modified = true).
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }

        // Step 2: enter snapshot mode.
        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        // Step 3: `take_snapshot` captures the task.
        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            false,
        );
        {
            let guard = storage.access_mut(task_id);
            assert!(!guard.flags.data_modified());
            assert!(guard.flags.data_snapshot_pending());
        }

        // Step 4: now that the capture is done but before we consume the iterator,
        // modify the task again: the captured state is frozen into `snapshots`.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(guard.flags.data_modified());
            assert!(storage.snapshots.contains_key(&task_id));
        }

        // Step 5: consume the iterator.
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();

        // The pre-encoded snapshot item should have been returned.
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), task_id);

        {
            let guard = storage.access_mut(task_id);
            assert!(guard.flags.data_modified());
            assert!(!guard.flags.any_snapshot_pending());
        }

        // The new modification must be reflected in shard_modified_counts so the next
        // snapshot cycle picks it up. Verify by starting another snapshot.
        let (_guard2, has_modifications) = storage.start_snapshot();
        assert!(
            has_modifications,
            "shard_modified_counts must count the modification made after the capture"
        );
    }

    /// A task modified in one category before a snapshot, then modified in a *different* category
    /// during snapshot iteration, must not panic and must carry the new modification forward.
    ///
    /// Sequence of events:
    /// 1. Task meta is modified (meta_modified = true).
    /// 2. `start_snapshot` puts us in snapshot mode.
    /// 3. `take_snapshot` captures the task (meta pending).
    /// 4. Task data is modified → the captured meta is frozen into `snapshots` and `data_modified`
    ///    is set as a normal modification.
    /// 5. `SnapshotShardIter::next` yields the pre-encoded item (meta only; data stays live) and
    ///    clears the pending flag.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_different_category_during_snapshot() {
        let storage = Storage::new(StorageOptions::for_tests());
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

        // Step 3: take_snapshot captures the task.
        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            false,
        );

        // Step 4: modify data during snapshot.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(guard.flags.data_modified());
            assert!(!guard.flags.meta_modified());
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
            // meta was persisted by this snapshot.
            assert!(!guard.flags.meta_modified());
            // data is dirty for the next cycle.
            assert!(guard.flags.data_modified());
            assert!(!guard.flags.any_snapshot_pending());
        }

        // Next snapshot cycle must pick up data_modified.
        let (_guard2, has_modifications) = storage.start_snapshot();
        assert!(
            has_modifications,
            "shard_modified_counts must count the data modification made after the capture"
        );
    }

    /// With `drain_entries = true` (shutdown path), the modified entries are moved out of the map
    /// (during the scan) and serialized by the iterator, freeing each task's memory as it is
    /// persisted rather than retaining it until the whole snapshot is written. Either way the
    /// entry must be gone from the map by the time the snapshot is consumed.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_entry_from_map() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = non_transient_task(1);

        // Modify the task outside snapshot mode so it lands in the modified list.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        assert!(storage.map.get(&task_id).is_some());

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        // Take the snapshot in drain mode.
        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            true,
        );

        // Consume the iterator: the task is serialized and then removed from the map.
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].task_id(), task_id);

        // The entry must be gone from the map now that it has been persisted.
        assert!(
            storage.map.get(&task_id).is_none(),
            "task entry should be removed from the map after being persisted in drain mode"
        );
    }

    /// In drain mode, fully consuming the iterators should release each drained shard's table
    /// allocation entirely (reset-to-empty in `SnapshotShardIter::drop`), not just shrink it.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_releases_drained_shards() {
        // dashmap requires at least 2 shards.
        let storage = Storage::new(StorageOptions::for_tests());

        // Insert and modify enough tasks to grow the shards' tables beyond their minimum.
        let task_ids: Vec<_> = (1..=256).map(non_transient_task).collect();
        for &task_id in &task_ids {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        let grown_capacity: usize = storage
            .map
            .shards()
            .iter()
            .map(|s| s.read().capacity())
            .sum();
        assert!(grown_capacity >= task_ids.len());

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            true,
        );
        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();
        assert_eq!(items.len(), task_ids.len());

        // Every shard is now empty and its table allocation has been released (capacity 0),
        // since the reset swaps in the allocation-free default table.
        for shard in storage.map.shards() {
            let shard = shard.read();
            assert_eq!(shard.len(), 0);
            assert_eq!(
                shard.capacity(),
                0,
                "drained shard should have released its table allocation"
            );
        }
    }

    /// In drain mode, `take_snapshot`'s scan removes *both* kinds of entry from the map: unmodified
    /// entries are erased and freed (never serialized), and the remaining modified-only table is
    /// moved out into the shard iterators (to be serialized, then freed as each is consumed). So
    /// the map is already empty when `take_snapshot` returns, and only the modified task is
    /// yielded.
    #[tokio::test(flavor = "multi_thread")]
    async fn drain_entries_removes_unmodified_during_take_snapshot() {
        let storage = Storage::new(StorageOptions::for_tests());
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
        assert!(storage.map.get(&unmodified_id).is_some());

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);

        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            true,
        );

        // The scan moved the modified table out and freed the unmodified entry, so both ids are
        // already absent from the map before any iterator is consumed.
        assert!(
            storage.map.get(&unmodified_id).is_none(),
            "unmodified entry should be removed during take_snapshot in drain mode"
        );
        assert!(
            storage.map.get(&modified_id).is_none(),
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
        let storage = Storage::new(StorageOptions::for_tests());
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
            "undo must decrement the shard counter so no modifications remain"
        );
    }

    /// A second track on an already-modified category returns `NoChange`; undoing it is a no-op and
    /// must NOT clear the real modification recorded by the first track.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_nochange_preserves_prior_modification() {
        let storage = Storage::new(StorageOptions::for_tests());
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
        let storage = Storage::new(StorageOptions::for_tests());
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

    /// A task wholly outside the snapshot (not captured) that is modified during the snapshot is
    /// tracked as a normal modification: `modified` is set and counted, no `snapshots` entry is
    /// created. Undo reverses both.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_outside_snapshot_during_snapshot_is_normal() {
        let storage = Storage::new(StorageOptions::for_tests());
        let anchor = non_transient_task(1);
        let task_id = non_transient_task(2);
        {
            let mut guard = storage.access_mut(anchor);
            let _ = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
        }
        // Insert the task (unmodified) so it exists in the map.
        let _ = storage.access_mut(task_id);

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            false,
        );
        assert!(storage.snapshot_mode());

        let mut guard = storage.access_mut(task_id);
        let outcome = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        assert!(matches!(
            outcome,
            TrackOutcome::Tracked {
                bumped: true,
                inserted_snapshot: false,
                ..
            }
        ));
        assert!(guard.flags.data_modified());
        assert!(!guard.flags.any_snapshot_pending());
        assert!(!storage.snapshots.contains_key(&task_id));
        assert_eq!(
            storage.shard_modified_counts[storage.shard_index(&task_id)].load(Ordering::Relaxed),
            1
        );

        guard.undo_track_modification(outcome);
        assert!(!guard.flags.data_modified());
        assert_eq!(
            storage.shard_modified_counts[storage.shard_index(&task_id)].load(Ordering::Relaxed),
            0
        );
        drop(guard);
        let items: Vec<_> = shards.into_iter().flatten().collect();
        assert_eq!(items.len(), 1);
    }

    /// A captured task tracked again before being persisted stores a pre-mutation encoded item in
    /// `snapshots`. Undo must remove that item and the new `modified` flag/count, while leaving
    /// the captured (pending) state intact.
    #[tokio::test(flavor = "multi_thread")]
    async fn undo_after_copy_on_write_removes_item_preserves_pending() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = non_transient_task(1);

        // Modify before snapshot so the category is captured.
        {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }

        let (snapshot_guard, _) = storage.start_snapshot();
        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            false,
        );

        {
            let mut guard = storage.access_mut(task_id);
            let outcome = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(matches!(
                outcome,
                TrackOutcome::Tracked {
                    bumped: true,
                    inserted_snapshot: true,
                    ..
                }
            ));
            assert!(storage.snapshots.contains_key(&task_id));

            guard.undo_track_modification(outcome);
            assert!(!guard.flags.data_modified());
            assert!(
                guard.flags.data_snapshot_pending(),
                "the captured modification belongs to the snapshot and must survive undo"
            );
            assert!(
                !storage.snapshots.contains_key(&task_id),
                "undo must remove the pre-mutation item it inserted"
            );
        }
        assert_eq!(
            storage.shard_modified_counts[storage.shard_index(&task_id)].load(Ordering::Relaxed),
            0
        );

        // The captured state is still persisted (from the live task, since no entry remains).
        let items: Vec<_> = shards.into_iter().flatten().collect();
        assert_eq!(items.len(), 1);
        assert!(!storage.access_mut(task_id).flags.any_snapshot_pending());
    }

    /// The capture runs inside the operation exclusion: it moves the modified flags to
    /// `*_snapshot_pending`, keeps `new_task` until persistence, and resets the shard counters.
    #[tokio::test(flavor = "multi_thread")]
    async fn take_snapshot_captures_mask_and_clears_live_bits() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = non_transient_task(1);
        {
            let mut guard = storage.access_mut(task_id);
            guard.flags.set_new_task(true);
            let _ = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
        }

        let (snapshot_guard, _) = storage.start_snapshot();
        let process = |id: TaskId,
                       inner: &TaskStorage,
                       category: TaskDataCategory,
                       buffer: &mut TurboBincodeBuffer| {
            assert_eq!(category, TaskDataCategory::Meta);
            dummy_process(id, inner, category, buffer)
        };
        let shards = take_snapshot(&storage, snapshot_guard, &process, &noop_inspect, false);
        {
            let guard = storage.access_mut(task_id);
            assert!(!guard.flags.any_modified());
            assert!(guard.flags.meta_snapshot_pending());
            assert!(!guard.flags.data_snapshot_pending());
            assert!(guard.flags.new_task());
        }
        assert!(
            storage
                .shard_modified_counts
                .iter()
                .all(|c| c.load(Ordering::Relaxed) == 0)
        );

        let items: Vec<_> = shards.into_iter().flatten().collect();
        assert_eq!(items.len(), 1);
        let guard = storage.access_mut(task_id);
        assert!(!guard.flags.any_snapshot_pending());
        assert!(!guard.flags.new_task());
        assert!(!guard.flags.any_modified());
    }

    /// When persisting fails, the shards are dropped before every captured task is yielded.
    /// Persisting is then disabled for the session, so the leftovers are not restored: dropping a
    /// shard clears the pending flags of its unyielded tasks (before snapshot mode ends), and
    /// ending the snapshot drops their copy-on-write items.
    #[tokio::test(flavor = "multi_thread")]
    async fn dropping_shards_early_leaves_no_copy_on_write_items() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_ids: Vec<_> = (1..=8).map(non_transient_task).collect();
        for &task_id in &task_ids {
            let mut guard = storage.access_mut(task_id);
            // Both categories, so the check below covers both pending flags.
            let _ = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        let frozen = task_ids[0];

        let (snapshot_guard, _) = storage.start_snapshot();
        let shards = take_snapshot(
            &storage,
            snapshot_guard,
            &dummy_process,
            &noop_inspect,
            false,
        );
        {
            let mut guard = storage.access_mut(frozen);
            let _ = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
        }
        assert!(storage.snapshots.contains_key(&frozen));

        // Consume one item from the first shard, then drop everything.
        let mut shards = shards.into_iter();
        let mut first = shards.next().unwrap().into_iter();
        let yielded = first
            .next()
            .expect("the first shard is not empty")
            .task_id();
        drop(first);
        drop(shards);

        assert!(!storage.snapshot_mode());
        assert!(storage.snapshots.is_empty());
        for &task_id in &task_ids {
            assert!(
                !storage.access_mut(task_id).flags.any_snapshot_pending(),
                "dropping the shards clears the pending flags of unyielded task {task_id:?}"
            );
        }

        let leftover = *task_ids
            .iter()
            .find(|&&id| id != frozen && id != yielded)
            .expect("some captured tasks were not yielded");
        let mut guard = storage.access_mut(leftover);
        let outcome = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
        assert!(matches!(
            outcome,
            TrackOutcome::Tracked {
                inserted_snapshot: false,
                ..
            }
        ));
        assert!(guard.flags.meta_modified());
        drop(guard);
        assert!(storage.snapshots.is_empty());
    }

    /// A panic while encoding a captured task (e.g. a value type without a bincode impl) unwinds
    /// out of the shard iterator. The task being encoded must still be cleaned up when the shards
    /// drop, like the tasks that weren't reached yet.
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    #[tokio::test(flavor = "multi_thread")]
    async fn panic_while_encoding_clears_pending_flags() {
        let storage = Storage::new(StorageOptions::for_tests());
        let task_ids: Vec<_> = (1..=8).map(non_transient_task).collect();
        for &task_id in &task_ids {
            let mut guard = storage.access_mut(task_id);
            let _ = guard.track_modification(SpecificTaskDataCategory::Data, "test");
        }
        let poisoned = task_ids[2];
        let process = |task_id: TaskId,
                       inner: &TaskStorage,
                       category: TaskDataCategory,
                       buffer: &mut TurboBincodeBuffer| {
            assert_ne!(task_id, poisoned, "simulated encoding failure");
            dummy_process(task_id, inner, category, buffer)
        };

        let (snapshot_guard, _) = storage.start_snapshot();
        let shards = take_snapshot(&storage, snapshot_guard, &process, &noop_inspect, false);
        let mut panicked = false;
        for shard in shards {
            let mut iter = shard.into_iter();
            loop {
                match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| iter.next())) {
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => {
                        panicked = true;
                        break;
                    }
                }
            }
            // Dropping the shard after the panic is what `snapshot_and_persist` does when it
            // unwinds.
            drop(iter);
        }
        assert!(panicked);

        assert!(!storage.snapshot_mode());
        assert!(storage.snapshots.is_empty());
        for &task_id in &task_ids {
            assert!(
                !storage.access_mut(task_id).flags.any_snapshot_pending(),
                "task {task_id:?} kept its pending flags after the panic"
            );
        }
    }

    /// Mixed-category race: meta is part of the snapshot, data is not. The first during-snapshot
    /// change hits data, then meta is changed too. The persisted meta must be the pre-snapshot
    /// meta, data must stay live (not persisted in this cycle), and both categories must be dirty
    /// for the next cycle.
    #[tokio::test(flavor = "multi_thread")]
    async fn modify_other_category_then_snapshot_category_during_snapshot() {
        fn output(id: u32) -> OutputValue {
            OutputValue::Output(non_transient_task(id))
        }

        let storage = Storage::new(StorageOptions::for_tests());
        let task_id = non_transient_task(1);

        // Meta is modified before the snapshot; data is clean.
        {
            let mut guard = storage.access_mut(task_id);
            guard.set_output(output(2));
            let _ = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
        }
        let expected_meta = {
            let mut pre = TaskStorage::new();
            pre.set_output(output(2));
            encode_task_contents(
                task_id,
                &pre,
                SpecificTaskDataCategory::Meta,
                &mut TurboBincodeBuffer::new(),
            )
            .unwrap()
        };

        let (snapshot_guard, has_modifications) = storage.start_snapshot();
        assert!(has_modifications);
        let process = |id: TaskId,
                       inner: &TaskStorage,
                       category: TaskDataCategory,
                       buffer: &mut TurboBincodeBuffer| {
            assert_ne!(
                id, task_id,
                "a task with a pre-encoded snapshot item must not be encoded again"
            );
            dummy_process(id, inner, category, buffer)
        };
        let shards = take_snapshot(&storage, snapshot_guard, &process, &noop_inspect, false);

        // During the snapshot: data first (not part of the snapshot), then meta.
        {
            let mut guard = storage.access_mut(task_id);
            let outcome = guard.track_modification(SpecificTaskDataCategory::Data, "test");
            assert!(matches!(
                outcome,
                TrackOutcome::Tracked {
                    inserted_snapshot: true,
                    ..
                }
            ));
            let outcome = guard.track_modification(SpecificTaskDataCategory::Meta, "test");
            assert!(matches!(
                outcome,
                TrackOutcome::Tracked {
                    inserted_snapshot: false,
                    ..
                }
            ));
            guard.set_output(output(3));
        }

        let items: Vec<_> = shards
            .into_iter()
            .flat_map(|shard| shard.into_iter())
            .collect();
        assert_eq!(items.len(), 1);
        let SnapshotItem::Put { meta, data, .. } = &items[0] else {
            panic!("expected a Put item");
        };
        assert_eq!(meta.as_deref(), Some(&expected_meta[..]));
        assert!(data.is_none(), "data was not part of this snapshot");

        let guard = storage.access_mut(task_id);
        assert!(guard.flags.meta_modified(), "meta change carried forward");
        assert!(guard.flags.data_modified(), "data change carried forward");
        assert!(!guard.flags.any_snapshot_pending());
        drop(guard);
        assert!(storage.snapshots.get(&task_id).is_none());
    }
}
