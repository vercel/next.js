use std::sync::Arc;

use anyhow::Result;
use either::Either;
use smallvec::SmallVec;
use turbo_bincode::TurboBincodeBuffer;
use turbo_persistence::ArcBytes;
use turbo_tasks::{TaskId, backend::CachedTaskType};

use crate::{
    backend::{AnyOperation, SpecificTaskDataCategory},
    utils::chunked_vec::ChunkedVec,
};

pub struct SnapshotItem {
    pub task_id: TaskId,
    pub data: Option<TurboBincodeBuffer>,
    pub meta: Option<TurboBincodeBuffer>,
}

impl SnapshotItem {
    pub fn is_empty(&self) -> bool {
        self.meta.is_none() && self.data.is_none()
    }
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

    fn save_snapshot<I>(
        &self,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        snapshots: Vec<I>,
    ) -> Result<()>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync;
    /// Returns all task IDs that match the given task type (hash collision candidates).
    ///
    /// Since TaskCache uses hash-based keys, multiple task types may (rarely) hash to the same key.
    /// The caller must verify each returned TaskId by comparing the stored task type which will
    /// require a second database read
    fn lookup_task_candidates(&self, key: &CachedTaskType) -> Result<SmallVec<[TaskId; 1]>>;
    /// Looks up raw persisted bytes for a single task.
    ///
    /// Returns `None` if the task has no persisted data for the given category.
    /// The caller is responsible for decoding the returned bytes. The returned
    /// [`ArcBytes`] is ref-counted and zero-copy when backed by a memory-mapped file.
    fn lookup_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
    ) -> Result<Option<ArcBytes>>;

    /// Batch lookup raw bytes for multiple tasks, calling
    /// `callback(index, Option<&[u8]>)` for every task in `task_ids` immediately after its
    /// entry is resolved. Index corresponds to the position in `task_ids`. `None` means the key
    /// was not found in the database (no allocation is made for missing keys).
    ///
    /// The caller is responsible for decoding the bytes. The byte slice is only valid for the
    /// duration of the callback invocation and must not be stored.
    ///
    /// This avoids allocating an intermediate `TaskStorage` per entry — callers can decode
    /// directly into the live in-memory storage, reducing peak memory usage for large batches.
    fn batch_lookup_data(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
        callback: &mut dyn FnMut(usize, Option<&[u8]>),
    ) -> Result<()>;

    fn compact(&self) -> Result<bool> {
        Ok(false)
    }

    fn shutdown(&self) -> Result<()> {
        Ok(())
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

    fn save_snapshot<I>(
        &self,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        snapshots: Vec<I>,
    ) -> Result<()>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync,
    {
        either::for_both!(self, this => this.save_snapshot(
            operations,
            task_cache_updates,
            snapshots,
        ))
    }

    fn lookup_task_candidates(&self, key: &CachedTaskType) -> Result<SmallVec<[TaskId; 1]>> {
        either::for_both!(self, this => this.lookup_task_candidates(key))
    }

    fn lookup_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
    ) -> Result<Option<ArcBytes>> {
        either::for_both!(self, this => this.lookup_data(task_id, category))
    }

    fn batch_lookup_data(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
        callback: &mut dyn FnMut(usize, Option<&[u8]>),
    ) -> Result<()> {
        either::for_both!(self, this => this.batch_lookup_data(task_ids, category, callback))
    }

    fn compact(&self) -> Result<bool> {
        either::for_both!(self, this => this.compact())
    }

    fn shutdown(&self) -> Result<()> {
        either::for_both!(self, this => this.shutdown())
    }
}
