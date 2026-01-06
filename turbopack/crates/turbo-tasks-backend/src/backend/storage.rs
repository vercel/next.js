use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
    sync::{Arc, atomic::AtomicBool},
};

use smallvec::SmallVec;
use turbo_tasks::{FxDashMap, TaskId, parallel};

use crate::{
    backend::storage_schema::{TaskFlags, TypedStorage},
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SpecificTaskDataCategory {
    Meta,
    Data,
}

impl IntoIterator for TaskDataCategory {
    type Item = TaskDataCategory;

    type IntoIter = TaskDataCategoryIterator;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            TaskDataCategory::Meta => TaskDataCategoryIterator::Meta,
            TaskDataCategory::Data => TaskDataCategoryIterator::Data,
            TaskDataCategory::All => TaskDataCategoryIterator::All,
        }
    }
}

pub enum TaskDataCategoryIterator {
    All,
    Meta,
    Data,
    None,
}

impl Iterator for TaskDataCategoryIterator {
    type Item = TaskDataCategory;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            TaskDataCategoryIterator::All => {
                *self = TaskDataCategoryIterator::Data;
                Some(TaskDataCategory::Meta)
            }
            TaskDataCategoryIterator::Meta => {
                *self = TaskDataCategoryIterator::None;
                Some(TaskDataCategory::Meta)
            }
            TaskDataCategoryIterator::Data => {
                *self = TaskDataCategoryIterator::None;
                Some(TaskDataCategory::Data)
            }
            TaskDataCategoryIterator::None => None,
        }
    }
}

// Note: InnerStorageState has been replaced by TaskFlags in TypedStorage.
// The flags are now part of the typed storage and include both persisted flags
// (stateful, invalidator, immutable) and transient internal state flags
// (meta_restored, data_restored, meta_modified, data_modified,
// meta_snapshot, data_snapshot, prefetched, current_session_clean).

pub struct InnerStorageSnapshot {
    // Typed storage data for persistence - all CachedDataItem variants are now migrated
    pub typed: TypedStorage,
    pub meta_modified: bool,
    pub data_modified: bool,
}

impl From<&InnerStorage> for InnerStorageSnapshot {
    fn from(inner: &InnerStorage) -> Self {
        Self {
            typed: inner.typed.clone(),
            meta_modified: inner.typed.flags.meta_modified(),
            data_modified: inner.typed.flags.data_modified(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct InnerStorage {
    // Typed storage - all CachedDataItem variants are now migrated
    // Also contains flags (TaskFlags) which replace InnerStorageState
    typed: TypedStorage,
}

impl InnerStorage {
    fn new() -> Self {
        Self {
            typed: TypedStorage::new(),
        }
    }

    /// Access the typed storage for direct field access
    #[inline]
    pub fn typed(&self) -> &TypedStorage {
        &self.typed
    }

    /// Access the typed storage mutably for direct field access
    #[inline]
    pub fn typed_mut(&mut self) -> &mut TypedStorage {
        &mut self.typed
    }

    /// Access flags for internal state (replaces InnerStorageState)
    #[inline]
    pub fn flags(&self) -> &TaskFlags {
        &self.typed.flags
    }

    /// Access flags mutably for internal state (replaces InnerStorageState)
    #[inline]
    pub fn flags_mut(&mut self) -> &mut TaskFlags {
        &mut self.typed.flags
    }
}

enum ModifiedState {
    /// It was modified before snapshot mode was entered, but it was not accessed during snapshot
    /// mode.
    Modified,
    /// Snapshot(Some):
    /// It was modified before snapshot mode was entered and it was accessed again during snapshot
    /// mode. A copy of the version of the item when snapshot mode was entered is stored here.
    /// Snapshot(None):
    /// It was not modified before snapshot mode was entered, but it was accessed during snapshot
    /// mode. Or the snapshot was already taken out by the snapshot operation.
    Snapshot(Option<Box<InnerStorageSnapshot>>),
}

pub struct Storage {
    snapshot_mode: AtomicBool,
    modified: FxDashMap<TaskId, ModifiedState>,
    map: FxDashMap<TaskId, Box<InnerStorage>>,
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
    pub fn take_snapshot<
        'l,
        T,
        R,
        PP: for<'a> Fn(TaskId, &'a InnerStorage) -> T + Sync,
        P: Fn(TaskId, T) -> R + Sync,
        PS: Fn(TaskId, Box<InnerStorageSnapshot>) -> R + Sync,
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
            let mut direct_snapshots: Vec<(TaskId, Box<InnerStorageSnapshot>)> = Vec::new();
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

            SnapshotShard {
                direct_snapshots,
                modified,
                storage: self,
                guard: Some(guard.clone()),
                process,
                preprocess,
                process_snapshot,
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
                let state = inner.flags_mut();
                state.set_data_modified(false);
                state.set_meta_modified(false);
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
                let state = inner.flags_mut();
                if state.meta_snapshot() {
                    state.set_meta_snapshot(false);
                    state.set_meta_modified(true);
                }
                if state.data_snapshot() {
                    state.set_data_snapshot(false);
                    state.set_data_modified(true);
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
            dashmap::mapref::entry::Entry::Vacant(e) => e.insert(Box::new(InnerStorage::new())),
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
        let (a, b) = get_multiple_mut(&self.map, key1, key2, || Box::new(InnerStorage::new()));
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
    inner: RefMut<'a, TaskId, Box<InnerStorage>>,
}

impl StorageWriteGuard<'_> {
    /// Tracks mutation of this task
    pub fn track_modification(&mut self, category: SpecificTaskDataCategory) {
        let state = self.inner.flags();
        let snapshot = match category {
            SpecificTaskDataCategory::Meta => state.meta_snapshot(),
            SpecificTaskDataCategory::Data => state.data_snapshot(),
        };
        if !snapshot {
            let modified = match category {
                SpecificTaskDataCategory::Meta => state.meta_modified(),
                SpecificTaskDataCategory::Data => state.data_modified(),
            };
            match (self.storage.snapshot_mode(), modified) {
                (false, false) => {
                    // Not in snapshot mode and item is unmodified
                    if !state.any_snapshot() && !state.any_modified() {
                        self.storage
                            .modified
                            .insert(*self.inner.key(), ModifiedState::Modified);
                    }
                    let state = self.inner.flags_mut();
                    match category {
                        SpecificTaskDataCategory::Meta => state.set_meta_modified(true),
                        SpecificTaskDataCategory::Data => state.set_data_modified(true),
                    }
                }
                (false, true) => {
                    // Not in snapshot mode and item is already modified
                    // Do nothing
                }
                (true, false) => {
                    // In snapshot mode and item is unmodified (so it's not part of the snapshot)
                    if !state.any_snapshot() {
                        self.storage
                            .modified
                            .insert(*self.inner.key(), ModifiedState::Snapshot(None));
                    }
                    let state = self.inner.flags_mut();
                    match category {
                        SpecificTaskDataCategory::Meta => state.set_meta_snapshot(true),
                        SpecificTaskDataCategory::Data => state.set_data_snapshot(true),
                    }
                }
                (true, true) => {
                    // In snapshot mode and item is modified (so it's part of the snapshot)
                    // We need to store the original version that is part of the snapshot
                    if !state.any_snapshot() {
                        self.storage.modified.insert(
                            *self.inner.key(),
                            ModifiedState::Snapshot(Some(Box::new((&**self.inner).into()))),
                        );
                    }
                    let state = self.inner.flags_mut();
                    match category {
                        SpecificTaskDataCategory::Meta => state.set_meta_snapshot(true),
                        SpecificTaskDataCategory::Data => state.set_data_snapshot(true),
                    }
                }
            }
        }
    }
}

impl Deref for StorageWriteGuard<'_> {
    type Target = InnerStorage;

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
    direct_snapshots: Vec<(TaskId, Box<InnerStorageSnapshot>)>,
    modified: SmallVec<[TaskId; 4]>,
    storage: &'l Storage,
    guard: Option<Arc<SnapshotGuard<'l>>>,
    process: &'l P,
    preprocess: &'l PP,
    process_snapshot: &'l PS,
}

impl<'l, T, R, PP, P, PS> Iterator for SnapshotShard<'l, PP, P, PS>
where
    PP: for<'a> Fn(TaskId, &'a InnerStorage) -> T + Sync,
    P: Fn(TaskId, T) -> R + Sync,
    PS: Fn(TaskId, Box<InnerStorageSnapshot>) -> R + Sync,
{
    type Item = R;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some((task_id, snapshot)) = self.direct_snapshots.pop() {
            return Some((self.process_snapshot)(task_id, snapshot));
        }
        while let Some(task_id) = self.modified.pop() {
            let inner = self.storage.map.get(&task_id).unwrap();
            let state = inner.flags();
            if !state.any_snapshot() {
                let preprocessed = (self.preprocess)(task_id, &inner);
                drop(inner);
                return Some((self.process)(task_id, preprocessed));
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
                    return Some((self.process_snapshot)(task_id, snapshot));
                }
            }
        }
        self.guard = None;
        None
    }
}
