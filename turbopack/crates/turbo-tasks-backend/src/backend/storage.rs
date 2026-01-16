use std::{
    hash::Hash,
    ops::{Deref, DerefMut},
    sync::{Arc, atomic::AtomicBool},
};

use smallvec::SmallVec;
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
    pub fn take_snapshot<
        'l,
        T,
        R,
        PP: for<'a> Fn(TaskId, &'a TaskStorage) -> T + Sync,
        P: Fn(TaskId, T) -> R + Sync,
        PS: Fn(TaskId, Box<TaskStorage>) -> R + Sync,
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
    pub fn track_modification(&mut self, category: SpecificTaskDataCategory) {
        let flags = &self.inner.flags;
        if flags.is_snapshot(category) {
            return;
        }
        let modified = flags.is_modified(category);
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

// TODO: this implementation is only needed to bootstrap new tasks
impl super::storage_schema::TaskStorageAccessors for StorageWriteGuard<'_> {
    fn typed(&self) -> &super::storage_schema::TaskStorage {
        &self.inner
    }

    fn typed_mut(&mut self) -> &mut super::storage_schema::TaskStorage {
        &mut self.inner
    }

    fn track_modification(&mut self, category: SpecificTaskDataCategory) {
        // Delegate to the existing track_modification method
        StorageWriteGuard::track_modification(self, category)
    }

    fn check_access(&self, _category: super::TaskDataCategory) {
        // StorageWriteGuard doesn't have category tracking - that's handled by TaskGuardImpl.
        // This is a no-op for Stor
    }
}

macro_rules! count {
    ($task:ident, $key:ident) => {{ $task.count($crate::data::CachedDataItemType::$key) }};
}

macro_rules! get {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::storage_schema::TaskStorageAccessors;
        if let Some($crate::data::CachedDataItemValueRef::$key {
            value,
        }) = $task.get(&$crate::data::CachedDataItemKey::$key $input) {
            Some(value)
        } else {
            None
        }
    }};
    ($task:ident, $key:ident) => {
        $crate::backend::storage::get!($task, $key {})
    };
}

macro_rules! get_mut {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::storage_schema::TaskStorageAccessors;
        if let Some($crate::data::CachedDataItemValueRefMut::$key {
            value,
        }) = $task.get_mut(&$crate::data::CachedDataItemKey::$key $input) {
            let () = $crate::data::allow_mut_access::$key;
            Some(value)
        } else {
            None
        }
    }};
    ($task:ident, $key:ident) => {
        $crate::backend::storage::get_mut!($task, $key {})
    };
}

macro_rules! get_mut_or_insert_with {
    ($task:ident, $key:ident $input:tt, $f:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::operation::TaskGuard;
        let () = $crate::data::allow_mut_access::$key;
        let functor = $f;
        let $crate::data::CachedDataItemValueRefMut::$key {
            value,
        } = $task.get_mut_or_insert_with($crate::data::CachedDataItemKey::$key $input, move || $crate::data::CachedDataItemValue::$key { value: functor() }) else {
            unreachable!()
        };
        value
    }};
    ($task:ident, $key:ident, $f:expr) => {
        $crate::backend::storage::get_mut_or_insert_with!($task, $key {}, $f)
    };
}

/// Creates an iterator over all [`CachedDataItemKey::$key`][crate::data::CachedDataItemKey]s in
/// `$task` matching the given `$key_pattern`, optional `$value_pattern`, and optional `if $cond`.
///
/// Each element in the iterator is determined by `$iter_item`, which may use fields extracted by
/// `$key_pattern` or `$value_pattern`.
macro_rules! iter_many {
    ($task:ident, $key:ident $key_pattern:tt $(if $cond:expr)? => $iter_item:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::storage_schema::TaskStorageAccessors;
        $task
            .iter($crate::data::CachedDataItemType::$key)
            .filter_map(|(key, _)| match key {
                $crate::data::CachedDataItemKey::$key $key_pattern $(if $cond)? => Some(
                    $iter_item
                ),
                _ => None,
            })
    }};
    ($task:ident, $key:ident $input:tt $value_pattern:tt $(if $cond:expr)? => $iter_item:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::storage_schema::TaskStorageAccessors;
        $task
            .iter($crate::data::CachedDataItemType::$key)
            .filter_map(|(key, value)| match (key, value) {
                (
                    $crate::data::CachedDataItemKey::$key $input,
                    $crate::data::CachedDataItemValueRef::$key { value: $value_pattern }
                ) $(if $cond)? => Some($iter_item),
                _ => None,
            })
    }};
}

/// A thin wrapper around [`iter_many`] that calls [`Iterator::collect`].
///
/// Note that the return type of [`Iterator::collect`] may be ambiguous in certain contexts, so
/// using this macro may require explicit type annotations on variables.
macro_rules! get_many {
    ($($args:tt)*) => {
        $crate::backend::storage::iter_many!($($args)*).collect()
    };
}

macro_rules! update {
    ($task:ident, $key:ident $input:tt, $update:expr) => {{
        #[allow(unused_imports)]
        use $crate::backend::storage_schema::TaskStorageAccessors;
        #[allow(unused_mut)]
        let mut update = $update;
        $task.update($crate::data::CachedDataItemKey::$key $input, |old| {
            update(old.and_then(|old| {
                if let $crate::data::CachedDataItemValue::$key { value } = old {
                    Some(value)
                } else {
                    None
                }
            }))
            .map(|new| $crate::data::CachedDataItemValue::$key { value: new })
        })
    }};
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update!($task, $key {}, $update)
    };
}

macro_rules! update_count {
    ($task:ident, $key:ident $input:tt, -$update:expr) => {
        match $update {
            update => {
                let mut state_change = false;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    #[allow(unused_comparisons, reason = "type of update might be unsigned, where update < 0 is always false")]
                    if let Some(old) = old {
                        let new = old - update;
                        state_change = old <= 0 && new > 0 || old > 0 && new <= 0;
                        (new != 0).then_some(new)
                    } else {
                        state_change = update < 0;
                        (update != 0).then_some(-update)
                    }
                });
                state_change
            }
        }
    };
    ($task:ident, $key:ident $input:tt, $update:expr) => {
        match $update {
            update => {
                let mut state_change = false;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    if let Some(old) = old {
                        let new = old + update;
                        state_change = old <= 0 && new > 0 || old > 0 && new <= 0;
                        (new != 0).then_some(new)
                    } else {
                        state_change = update > 0;
                        (update != 0).then_some(update)
                    }
                });
                state_change
            }
        }
    };
    ($task:ident, $key:ident, -$update:expr) => {
        $crate::backend::storage::update_count!($task, $key {}, -$update)
    };
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update_count!($task, $key {}, $update)
    };
}

macro_rules! update_count_and_get {
    ($task:ident, $key:ident $input:tt, -$update:expr) => {
        match $update {
            update => {
                let mut new = 0;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    let old = old.unwrap_or(0);
                    new = old - update;
                    (new != 0).then_some(new)
                });
                new
            }
        }
    };
    ($task:ident, $key:ident $input:tt, $update:expr) => {
        match $update {
            update => {
                let mut new = 0;
                $crate::backend::storage::update!($task, $key $input, |old: Option<_>| {
                    let old = old.unwrap_or(0);
                    new = old + update;
                    (new != 0).then_some(new)
                });
                new
            }
        }
    };
    ($task:ident, $key:ident, -$update:expr) => {
        $crate::backend::storage::update_count_and_get!($task, $key {}, -$update)
    };
    ($task:ident, $key:ident, $update:expr) => {
        $crate::backend::storage::update_count_and_get!($task, $key {}, $update)
    };
}

macro_rules! remove {
    ($task:ident, $key:ident $input:tt) => {{
        #[allow(unused_imports)]
        use $crate::backend::storage_schema::TaskStorageAccessors;
        if let Some($crate::data::CachedDataItemValue::$key { value }) = $task.remove(
            &$crate::data::CachedDataItemKey::$key $input
        ) {
            Some(value)
        } else {
            None
        }
    }};
    ($task:ident, $key:ident) => {
        $crate::backend::storage::remove!($task, $key {})
    };
}

pub(crate) use count;
pub(crate) use get;
pub(crate) use get_many;
pub(crate) use get_mut;
pub(crate) use get_mut_or_insert_with;
pub(crate) use iter_many;
pub(crate) use remove;
pub(crate) use update;
pub(crate) use update_count;
pub(crate) use update_count_and_get;

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
}

impl<'l, T, R, PP, P, PS> Iterator for SnapshotShard<'l, PP, P, PS>
where
    PP: for<'a> Fn(TaskId, &'a TaskStorage) -> T + Sync,
    P: Fn(TaskId, T) -> R + Sync,
    PS: Fn(TaskId, Box<TaskStorage>) -> R + Sync,
{
    type Item = R;

    fn next(&mut self) -> Option<Self::Item> {
        if let Some((task_id, snapshot)) = self.direct_snapshots.pop() {
            return Some((self.process_snapshot)(task_id, snapshot));
        }
        while let Some(task_id) = self.modified.pop() {
            let inner = self.storage.map.get(&task_id).unwrap();
            if !inner.flags.any_snapshot() {
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
