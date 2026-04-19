use std::sync::Arc;

use anyhow::Result;
use either::Either;
use smallvec::SmallVec;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{
    DynTaskInputs, RawVc, TaskId, backend::CachedTaskType, macro_helpers::NativeFunction,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

use crate::backend::{AnyOperation, SpecificTaskDataCategory, storage_schema::TaskStorage};

pub type TaskTypeHash = [u8; 8];

/// A single item yielded by the snapshot iterator during persistence.
pub struct SnapshotItem {
    pub task_id: TaskId,
    /// Serialized task meta data, if modified
    pub meta: Option<TurboBincodeBuffer>,
    /// Serialized task data, if modified
    pub data: Option<TurboBincodeBuffer>,
    /// Task type for new tasks that need to be added to the task cache
    pub task_type_hash: Option<TaskTypeHash>,
}

/// Computes a deterministic 64-bit hash of a CachedTaskType for use as a TaskCache key.
///
/// This encodes the task type directly to a hasher, avoiding intermediate buffer allocation.
/// The encoding is deterministic (function IDs from registry, bincode argument encoding).
pub fn compute_task_type_hash(task_type: &CachedTaskType) -> TaskTypeHash {
    let mut hasher = Xxh3Hash64Hasher::new();
    task_type.hash_encode(&mut hasher);
    let hash = hasher.finish();
    if cfg!(feature = "verify_serialization") {
        hasher = Xxh3Hash64Hasher::new();
        task_type.hash_encode(&mut hasher);
        let hash2 = hasher.finish();
        assert_eq!(
            hash, hash2,
            "Hashing TaskType twice was non-deterministic: \n{:?}\ngot hashes {} != {}",
            task_type, hash, hash2
        );
    }
    hash.to_le_bytes()
}

/// Computes a deterministic 64-bit hash from task type components for use as a TaskCache key.
///
/// Like [`compute_task_type_hash`], but works with borrowed components so the caller does not need
/// to construct (and box-allocate) a full [`CachedTaskType`] first.
pub fn compute_task_type_hash_from_components(
    native_fn: &'static NativeFunction,
    this: Option<RawVc>,
    arg: &dyn DynTaskInputs,
) -> TaskTypeHash {
    let mut hasher = Xxh3Hash64Hasher::new();
    CachedTaskType::hash_encode_components(native_fn, this, arg, &mut hasher);
    hasher.finish().to_le_bytes()
}

/// Represents types accepted by [`TurboTasksBackend::new`]. Typically this is the value returned by
/// [`turbo_backing_storage`] or [`noop_backing_storage`].
///
/// This trait is [sealed]. External crates are not allowed to implement it.
///
/// [`turbo_backing_storage`]: crate::turbo_backing_storage
/// [`noop_backing_storage`]: crate::noop_backing_storage
/// [`TurboTasksBackend::new`]: crate::TurboTasksBackend::new
/// [sealed]: https://predr.ag/blog/definitive-guide-to-sealed-traits-in-rust/
pub trait BackingStorage: BackingStorageSealed {
    /// Called when the database should be invalidated upon re-initialization.
    ///
    /// This typically means that we'll restart the process or `turbo-tasks` soon with a fresh
    /// database. If this happens, there's no point in writing anything else to disk, or flushing
    /// during [`TurboTasksBackend::stop`].
    ///
    /// [`TurboTasksBackend::stop`]: turbo_tasks::backend::Backend::stop
    //
    // This can be implemented by calling `database::db_invalidation::invalidate_db` with the
    // database's non-versioned base path.
    fn invalidate(&self, reason_code: &str) -> Result<()>;
}

/// Private methods used by [`BackingStorage`]. This trait is `pub` (because of the sealed-trait
/// pattern), but should not be exported outside of the crate.
///
/// [`BackingStorage`] is exported for documentation reasons and to expose the public
/// [`BackingStorage::invalidate`] method.
pub trait BackingStorageSealed: 'static + Send + Sync {
    fn next_free_task_id(&self) -> Result<TaskId>;
    fn uncompleted_operations(&self) -> Result<Vec<AnyOperation>>;

    fn save_snapshot<I>(&self, operations: Vec<Arc<AnyOperation>>, snapshots: Vec<I>) -> Result<()>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync;
    /// Returns all task IDs that match the given task type (hash collision candidates).
    ///
    /// Since TaskCache uses hash-based keys, multiple task types may (rarely) hash to the same key.
    /// The caller must verify each returned TaskId by comparing the stored task type which will
    /// require a second database read
    fn lookup_task_candidates(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> Result<SmallVec<[TaskId; 1]>>;
    /// Looks up and decodes persisted data for a single task, updating the provided storage with
    /// data from the database in the given category.
    fn lookup_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
        storage: &mut TaskStorage,
    ) -> Result<()>;

    /// Batch lookup and decode data for multiple tasks directly into TypedStorage instances.
    /// Returns a vector of TypedStorage, one for each task_id in the input slice.
    fn batch_lookup_data(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
    ) -> Result<Vec<TaskStorage>>;

    fn compact(&self) -> Result<bool> {
        Ok(false)
    }

    fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    /// Returns true if the database is in an unrecoverable error state where a previous write or
    /// compaction failed and the rollback also failed, permanently disabling further writes.
    fn has_unrecoverable_write_error(&self) -> bool {
        false
    }
}

impl<L, R> BackingStorage for Either<L, R>
where
    L: BackingStorage,
    R: BackingStorage,
{
    fn invalidate(&self, reason_code: &str) -> Result<()> {
        either::for_both!(self, this => this.invalidate(reason_code))
    }
}

impl<L, R> BackingStorageSealed for Either<L, R>
where
    L: BackingStorageSealed,
    R: BackingStorageSealed,
{
    fn next_free_task_id(&self) -> Result<TaskId> {
        either::for_both!(self, this => this.next_free_task_id())
    }

    fn uncompleted_operations(&self) -> Result<Vec<AnyOperation>> {
        either::for_both!(self, this => this.uncompleted_operations())
    }

    fn save_snapshot<I>(&self, operations: Vec<Arc<AnyOperation>>, snapshots: Vec<I>) -> Result<()>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync,
    {
        either::for_both!(self, this => this.save_snapshot(
            operations,
            snapshots,
        ))
    }

    fn lookup_task_candidates(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> Result<SmallVec<[TaskId; 1]>> {
        either::for_both!(self, this_impl => this_impl.lookup_task_candidates(native_fn, this, arg))
    }

    fn lookup_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
        storage: &mut TaskStorage,
    ) -> Result<()> {
        either::for_both!(self, this => this.lookup_data(task_id, category, storage))
    }

    fn batch_lookup_data(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
    ) -> Result<Vec<TaskStorage>> {
        either::for_both!(self, this => this.batch_lookup_data(task_ids, category))
    }

    fn compact(&self) -> Result<bool> {
        either::for_both!(self, this => this.compact())
    }

    fn shutdown(&self) -> Result<()> {
        either::for_both!(self, this => this.shutdown())
    }

    fn has_unrecoverable_write_error(&self) -> bool {
        either::for_both!(self, this => this.has_unrecoverable_write_error())
    }
}
