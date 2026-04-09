use std::{
    cell::Cell,
    hash::Hash,
    ops::{Deref, DerefMut},
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};

use thread_local::ThreadLocal;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{FxDashMap, TaskId, event::Event, parallel};

use crate::{
    backend::storage_schema::TaskStorage,
    backing_storage::SnapshotItem,
    database::key_value_database::KeySpace,
    utils::{
        dash_map_drop_contents::drop_contents,
        dash_map_multi::{RefMut, get_multiple_mut},
    },
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskDataCategory {
    Meta,
    Data,
    All,
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
    snapshots: FxDashMap<TaskId, Option<Box<TaskStorage>>>,
    map: FxDashMap<TaskId, Box<TaskStorage>>,
    /// A shared event notified whenever any task finishes restoring (successfully or not).
    ///
    /// Threads waiting for another thread's in-progress restore subscribe to this event,
    /// then re-check the specific task's `restoring`/`restored` bits after waking.
    pub(crate) restored: Event,
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
        let num_shards = map.shards().len();
        let shard_modified_counts = (0..num_shards)
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
    fn promote_during_snapshot_flags(&self, task_id: &TaskId, task: &mut TaskStorage) {
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
            let shard_idx = self.shard_index(task_id);
            self.shard_modified_counts[shard_idx].fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Mark a newly allocated task as restored (skip DB queries) and new (include in persistence
    /// snapshots).
    pub fn initialize_new_task(&self, task_id: TaskId) {
        let mut task = self.access_mut(task_id);
        task.flags.set_restored(TaskDataCategory::All);
        task.flags.set_new_task(true);
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
        guard: SnapshotGuard<'l>,
        process: &'l P,
    ) -> Vec<SnapshotShard<'l, P>> {
        let guard = Arc::new(guard);

        let shards: Vec<_> = self.map.shards().iter().enumerate().collect();

        // The number of shards is much larger than the number of threads, so the effect of the
        // locks held is negligible.
        parallel::map_collect::<_, _, Vec<_>>(&shards, |&(shard_idx, shard)| {
            // Check how many modifications there are in this shard, because we have entered
            // snapshot_mode, there are no racing writes
            // So we can safely clear it out now that we are processing the modifications
            let modified_count = self.shard_modified_counts[shard_idx].swap(0, Ordering::Relaxed);
            if modified_count == 0 {
                return None;
            }
            let mut direct_snapshots: Vec<(TaskId, Box<TaskStorage>)> = Vec::new();
            let mut modified = Vec::with_capacity(modified_count as usize);
            {
                let shard_guard = shard.read();
                // Safety: shard_guard must outlive the iterator.
                for bucket in unsafe { shard_guard.iter() } {
                    // Safety: the guard guarantees that the bucket is not removed and the ptr
                    // is valid.
                    let (key, shared_value) = unsafe { bucket.as_ref() };
                    let flags = &shared_value.get().flags;
                    // Only check modified flags here — transient tasks never have
                    // modified flags set (track_modification guards against it), so
                    // this naturally excludes them. new_task is always
                    // accompanied by modified flags (set_persistent_task_type calls
                    // track_modification), so any_modified() is sufficient.
                    if flags.any_modified() {
                        debug_assert!(
                            !key.is_transient(),
                            "found a modified transient task: {:?}",
                            shared_value.get().get_persistent_task_type()
                        );

                        if flags.any_modified_during_snapshot() {
                            // Task was modified during snapshot mode, so a snapshot
                            // copy must exist in the snapshots map (created by the
                            // (true, true) case in track_modification_internal).
                            // Remove the entry entirely so end_snapshot doesn't
                            // double-process this task.  When iterating in `next` we will
                            // re-synchronize the task flags.
                            let (_, snapshot) = self.snapshots.remove(key).expect(
                                "task with modified_during_snapshot must have a snapshots entry",
                            );
                            let snapshot = snapshot.expect(
                                "snapshot entry for modified_during_snapshot task must contain a \
                                 value",
                            );
                            direct_snapshots.push((*key, snapshot));
                        } else {
                            modified.push(*key);
                        }
                    }
                }
                // Safety: shard_guard must outlive the iterator.
                drop(shard_guard);
            }

            // Early return for shards with no entries at all
            if direct_snapshots.is_empty() && modified.is_empty() {
                return None;
            }

            Some(SnapshotShard {
                shard_idx,
                direct_snapshots,
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
    pub fn start_snapshot(&self) -> (SnapshotGuard<'_>, bool) {
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
        self.snapshot_mode.store(false, Ordering::Release);

        // Promote modified_during_snapshot → modified for tasks that had snapshots.
        // The snapshots map should be small (only tasks concurrently accessed during snapshot
        // mode). Increment the per-shard modified counts for promoted tasks.

        // Lock Ordering: Note, in track_modification_internal, we modify the snapshots map while
        // holding a StorageWriteGuard and here we do the opposite.  This is fine because that code
        // only runs when `snapshot_mode==true` and this loop only runs when it is false.
        parallel::for_each(self.snapshots.shards(), |shard| {
            let mut shard_guard = shard.write();
            for (key, _) in shard_guard.drain() {
                if let Some(mut inner) = self.map.get_mut(&key) {
                    self.promote_during_snapshot_flags(&key, &mut inner);
                }
            }
            // If we are saving a non-trivial amount of memory just clear it out.
            if shard_guard.capacity() > 1024 {
                shard_guard.shrink_to(0, |_entry| {
                    unreachable!("nothing is hashed when resizing an empty shard to zero");
                });
            }
            // Safety: shard_guard must outlive the iterator.
            drop(shard_guard);
        });
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
                    // Snapshot all non-transient fields but keep the modified bits since
                    // save_snapshot relies on them
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

pub struct SnapshotShard<'l, P> {
    shard_idx: usize,
    direct_snapshots: Vec<(TaskId, Box<TaskStorage>)>,
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
        // direct_snapshots: these tasks had a snapshot copy created by
        // track_modification. We encode from the owned snapshot copy,
        // clear the stale modified flags, and promote any _during_snapshot
        // flags so the task stays dirty for the next cycle.
        while let Some((task_id, snapshot)) = self.shard.direct_snapshots.pop() {
            let item = (self.shard.process)(task_id, &snapshot, &mut self.buffer);
            let mut inner = self.shard.storage.map.get_mut(&task_id).unwrap();
            if !item.is_empty() {
                // Successfully encoded — clear pre-snapshot flags. Since we removed
                // this task's entry from the snapshots map in take_snapshot,
                // end_snapshot won't see it, so we must promote here.
                inner.flags.set_data_modified(false);
                inner.flags.set_meta_modified(false);
                inner.flags.set_new_task(false);
                self.shard
                    .storage
                    .promote_during_snapshot_flags(&task_id, &mut inner);
                return Some(item);
            } else {
                // Error path: encoding failed. Re-mark dirty for next cycle.
                std::hint::cold_path();
                self.shard.storage.shard_modified_counts[self.shard.shard_idx]
                    .fetch_add(1, Ordering::Relaxed);
                self.shard
                    .storage
                    .promote_during_snapshot_flags(&task_id, &mut inner);
            }
        }
        // modified tasks: acquire a write lock to encode and clear flags in one pass.
        while let Some(task_id) = self.shard.modified.pop() {
            let mut inner = self.shard.storage.map.get_mut(&task_id).unwrap();
            if !inner.flags.any_modified_during_snapshot() {
                let item = (self.shard.process)(task_id, &inner, &mut self.buffer);
                if !item.is_empty() {
                    // Successfully encoded — clear flags.
                    inner.flags.set_data_modified(false);
                    inner.flags.set_meta_modified(false);
                    inner.flags.set_new_task(false);
                    return Some(item);
                }
                // Error path: encoding failed. Re-mark dirty for next cycle.
                std::hint::cold_path();
                self.shard.storage.shard_modified_counts[self.shard.shard_idx]
                    .fetch_add(1, Ordering::Relaxed);
            } else {
                // Task was modified again during snapshot mode. A snapshot copy was
                // created in track_modification_internal. Use that for encoding.
                // Promote modified_during_snapshot → modified so the task stays dirty
                // for the next snapshot cycle (the original has diverged from what
                // we're about to persist).
                debug_assert!(!inner.flags.any_modified(), "cannot already be modified");
                self.shard
                    .storage
                    .promote_during_snapshot_flags(&task_id, &mut inner);
                drop(inner);

                // Take the snapshot and remove from the snapshots map so
                // end_snapshot doesn't double-process this task.
                let snapshot = self
                    .shard
                    .storage
                    .snapshots
                    .remove(&task_id)
                    .expect("The snapshot bit was set, so it must be in Snapshot state")
                    .1;

                if let Some(snapshot) = snapshot {
                    let item = (self.shard.process)(task_id, &snapshot, &mut self.buffer);
                    if !item.is_empty() {
                        // Successfully encoded the snapshot — clear new_task since it
                        // was captured in the snapshot. The promoted modified flags
                        // keep the task dirty for future changes.
                        if let Some(mut inner) = self.shard.storage.map.get_mut(&task_id) {
                            inner.flags.set_new_task(false);
                        }
                        return Some(item);
                    }
                    // Encoding failed — new_task flag stays set for retry.
                }
            }
        }
        None
    }
}

impl<P> Drop for SnapshotShardIter<'_, P> {
    fn drop(&mut self) {
        self.shard
            ._guard
            .return_scratch_buffer(std::mem::take(&mut self.buffer));
    }
}
