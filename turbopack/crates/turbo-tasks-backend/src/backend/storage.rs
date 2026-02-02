use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
    sync::{Arc, atomic::AtomicBool},
};

use smallvec::SmallVec;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{FxDashMap, TaskId, parallel};

use crate::{
    backend::storage_schema::TaskStorage,
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

impl SpecificTaskDataCategory {
    /// Returns the KeySpace for storing data of this category
    pub fn key_space(self) -> KeySpace {
        match self {
            SpecificTaskDataCategory::Meta => KeySpace::TaskMeta,
            SpecificTaskDataCategory::Data => KeySpace::TaskData,
        }
    }
}

enum ModifiedState {
    /// It was modified before snapshot mode was entered, but it was not accessed during snapshot
    /// mode.
    Modified,
    /// Snapshot(Some):
    /// It was modified before snapshot mode was entered and it was accessed again during snapshot
    /// mode. A copy of the version of the item when snapshot mode was entered is stored here.
    /// The `TaskStorage` contains only persistent fields (via `clone_snapshot()`), and has
    /// `meta_modified`/`data_modified` flags set to indicate which categories need serializing.
    /// Snapshot(None):
    /// It was not modified before snapshot mode was entered, but it was accessed during snapshot
    /// mode. Or the snapshot was already taken out by the snapshot operation.
    Snapshot(Option<Box<TaskStorage>>),
}

pub struct Storage {
    snapshot_mode: AtomicBool,
    modified: FxDashMap<TaskId, ModifiedState>,
    map: FxDashMap<TaskId, Box<TaskStorage>>,
}

impl Storage {
    pub fn new(shard_amount: usize, small_preallocation: bool) -> Self {
        let map_capacity: usize = if small_preallocation {
            1024
        } else {
            1024 * 1024
        };
        let modified_capacity: usize = if small_preallocation { 0 } else { 1024 };

        Self {
            snapshot_mode: AtomicBool::new(false),
            modified: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                modified_capacity,
                Default::default(),
                shard_amount,
            ),
            map: FxDashMap::with_capacity_and_hasher_and_shard_amount(
                map_capacity,
                Default::default(),
                shard_amount,
            ),
        }
    }

    /// Processes every modified item (resp. a snapshot of it) with the given functions and returns
    /// the results. Ends snapshot mode afterwards.
    /// preprocess is potentially called within a lock, so it should be fast.
    /// process is called outside of locks, so it could do more expensive operations.
    /// Both process and process_snapshot receive a mutable scratch buffer that can be reused
    /// across iterations to avoid repeated allocations.
    pub fn take_snapshot<
        'l,
        T,
        R,
        PP: for<'a> Fn(TaskId, &'a TaskStorage) -> T + Sync,
        P: Fn(TaskId, T, &mut TurboBincodeBuffer) -> R + Sync,
        PS: Fn(TaskId, Box<TaskStorage>, &mut TurboBincodeBuffer) -> R + Sync,
    >(
        &'l self,
        preprocess: &'l PP,
        process: &'l P,
        process_snapshot: &'l PS,
    ) -> Vec<SnapshotShard<'l, PP, P, PS>> {
        if !self.snapshot_mode() {
            self.start_snapshot();
        }

        let guard = Arc::new(SnapshotGuard { storage: self });

        // The number of shards is much larger than the number of threads, so the effect of the
        // locks held is negligible.
        parallel::map_collect::<_, _, Vec<_>>(self.modified.shards(), |shard| {
            let mut direct_snapshots: Vec<(TaskId, Box<TaskStorage>)> = Vec::new();
            let mut modified: SmallVec<[TaskId; 4]> = SmallVec::new();
            {
                // Take the snapshots from the modified map
                let guard = shard.write();
                // Safety: guard must outlive the iterator.
                for bucket in unsafe { guard.iter() } {
                    // Safety: the guard guarantees that the bucket is not removed and the ptr
                    // is valid.
                    let (key, shared_value) = unsafe { bucket.as_mut() };
                    let modified_state = shared_value.get_mut();
                    match modified_state {
                        ModifiedState::Modified => {
                            modified.push(*key);
                        }
                        ModifiedState::Snapshot(snapshot) => {
                            if let Some(snapshot) = snapshot.take() {
                                direct_snapshots.push((*key, snapshot));
                            }
                        }
                    }
                }
                // Safety: guard must outlive the iterator.
                drop(guard);
            }
            /// How big of a buffer to allocate initially.  Based on metrics from a large
            /// application this should cover about 98% of values with no resizes
            const SCRATCH_BUFFER_SIZE: usize = 4096;
            SnapshotShard {
                direct_snapshots,
                modified,
                storage: self,
                guard: Some(guard.clone()),
                process,
                preprocess,
                process_snapshot,
                scratch_buffer: TurboBincodeBuffer::with_capacity(SCRATCH_BUFFER_SIZE),
            }
        })
    }

    /// Start snapshot mode.
    pub fn start_snapshot(&self) {
        self.snapshot_mode
            .store(true, std::sync::atomic::Ordering::Release);
    }

    /// End snapshot mode.
    /// Items that have snapshots will be kept as modified since they have been accessed during the
    /// snapshot mode. Items that are modified will be removed and considered as unmodified.
    /// When items are accessed in future they will be marked as modified.
    fn end_snapshot(&self) {
        // We are still in snapshot mode, so all accessed items would be stored as snapshot.
        // This means we can start by removing all modified items.
        let mut removed_modified = Vec::new();
        self.modified.retain(|key, inner| {
            if matches!(inner, ModifiedState::Modified) {
                removed_modified.push(*key);
                false
            } else {
                true
            }
        });

        // We also need to unset all the modified flags.
        for key in removed_modified {
            if let Some(mut inner) = self.map.get_mut(&key) {
                inner.flags.set_data_modified(false);
                inner.flags.set_meta_modified(false);
            }
        }

        // Now modified only contains snapshots.
        // We leave snapshot mode. Any access would be stored as modified and not as snapshot.
        self.snapshot_mode
            .store(false, std::sync::atomic::Ordering::Release);

        // We can change all the snapshots to modified now.
        let mut removed_snapshots = Vec::new();
        for mut item in self.modified.iter_mut() {
            match item.value() {
                ModifiedState::Snapshot(_) => {
                    removed_snapshots.push(*item.key());
                    *item.value_mut() = ModifiedState::Modified;
                }
                ModifiedState::Modified => {
                    // This means it was concurrently modified.
                    // It's already in the correct state.
                }
            }
        }

        // And update the flags
        for key in removed_snapshots {
            if let Some(mut inner) = self.map.get_mut(&key) {
                if inner.flags.meta_snapshot() {
                    inner.flags.set_meta_snapshot(false);
                    inner.flags.set_meta_modified(true);
                }
                if inner.flags.data_snapshot() {
                    inner.flags.set_data_snapshot(false);
                    inner.flags.set_data_modified(true);
                }
            }
        }

        // Remove excessive capacity in modified
        self.modified.shrink_to_fit();
    }

    fn snapshot_mode(&self) -> bool {
        self.snapshot_mode
            .load(std::sync::atomic::Ordering::Acquire)
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
        drop_contents(&self.modified);
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
        let flags = &self.inner.flags;
        if flags.is_snapshot(category) {
            return;
        }
        let modified = flags.is_modified(category);
        #[cfg(feature = "trace_task_modification")]
        let _span = (!modified).then(|| tracing::trace_span!("mark_modified", name).entered());
        match (self.storage.snapshot_mode(), modified) {
            (false, false) => {
                // Not in snapshot mode and item is unmodified
                if !flags.any_snapshot() && !flags.any_modified() {
                    self.storage
                        .modified
                        .insert(*self.inner.key(), ModifiedState::Modified);
                }
                self.inner.flags.set_modified(category, true);
            }
            (false, true) => {
                // Not in snapshot mode and item is already modified
                // Do nothing
            }
            (true, false) => {
                // In snapshot mode and item is unmodified (so it's not part of the snapshot)
                if !flags.any_snapshot() {
                    self.storage
                        .modified
                        .insert(*self.inner.key(), ModifiedState::Snapshot(None));
                }
                self.inner.flags.set_snapshot(category, true);
            }
            (true, true) => {
                // In snapshot mode and item is modified (so it's part of the snapshot)
                // We need to store the original version that is part of the snapshot
                if !flags.any_snapshot() {
                    // Snapshot all non-transient fields but keep the modified bits.
                    let mut snapshot = self.inner.clone_snapshot();
                    snapshot.flags.set_data_modified(flags.data_modified());
                    snapshot.flags.set_meta_modified(flags.meta_modified());
                    self.storage.modified.insert(
                        *self.inner.key(),
                        ModifiedState::Snapshot(Some(Box::new(snapshot))),
                    );
                }
                self.inner.flags.set_snapshot(category, true);
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

pub struct SnapshotGuard<'l> {
    storage: &'l Storage,
}

impl Drop for SnapshotGuard<'_> {
    fn drop(&mut self) {
        self.storage.end_snapshot();
    }
}

pub struct SnapshotShard<'l, PP, P, PS> {
    direct_snapshots: Vec<(TaskId, Box<TaskStorage>)>,
    modified: SmallVec<[TaskId; 4]>,
    storage: &'l Storage,
    guard: Option<Arc<SnapshotGuard<'l>>>,
    process: &'l P,
    preprocess: &'l PP,
    process_snapshot: &'l PS,
    /// Scratch buffer for encoding task data, reused across iterations to avoid allocations
    scratch_buffer: TurboBincodeBuffer,
}

impl<'l, T, R, PP, P, PS> Iterator for SnapshotShard<'l, PP, P, PS>
where
    PP: for<'a> Fn(TaskId, &'a TaskStorage) -> T + Sync,
    P: Fn(TaskId, T, &mut TurboBincodeBuffer) -> R + Sync,
    PS: Fn(TaskId, Box<TaskStorage>, &mut TurboBincodeBuffer) -> R + Sync,
{
    type Item = R;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some((task_id, snapshot)) = self.direct_snapshots.pop() {
            return Some((self.process_snapshot)(
                task_id,
                snapshot,
                &mut self.scratch_buffer,
            ));
        }
        while let Some(task_id) = self.modified.pop() {
            let inner = self.storage.map.get(&task_id).unwrap();
            if !inner.flags.any_snapshot() {
                let preprocessed = (self.preprocess)(task_id, &inner);
                drop(inner);
                return Some((self.process)(
                    task_id,
                    preprocessed,
                    &mut self.scratch_buffer,
                ));
            } else {
                drop(inner);
                let maybe_snapshot = {
                    let mut modified_state = self.storage.modified.get_mut(&task_id).unwrap();
                    let ModifiedState::Snapshot(snapshot) = &mut *modified_state else {
                        unreachable!("The snapshot bit was set, so it must be in Snapshot state");
                    };
                    snapshot.take()
                };
                if let Some(snapshot) = maybe_snapshot {
                    return Some((self.process_snapshot)(
                        task_id,
                        snapshot,
                        &mut self.scratch_buffer,
                    ));
                }
            }
        }
        self.guard = None;
        None
    }
}
