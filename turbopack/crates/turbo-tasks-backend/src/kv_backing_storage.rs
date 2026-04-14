use std::{
    borrow::Borrow,
    env,
    path::PathBuf,
    sync::{Arc, LazyLock, Mutex, PoisonError, Weak},
};

use anyhow::{Context, Result};
use smallvec::SmallVec;
use turbo_bincode::{new_turbo_bincode_decoder, turbo_bincode_decode, turbo_bincode_encode};
use turbo_tasks::{
    TaskId,
    backend::CachedTaskType,
    panic_hooks::{PanicHookGuard, register_panic_hook},
    parallel,
};

use crate::{
    GitVersionInfo,
    backend::{AnyOperation, SpecificTaskDataCategory, storage_schema::TaskStorage},
    backing_storage::{BackingStorage, BackingStorageSealed, SnapshotItem, compute_task_type_hash},
    database::{
        db_invalidation::{StartupCacheState, check_db_invalidation_and_cleanup, invalidate_db},
        db_versioning::handle_db_versioning,
        key_value_database::{KeySpace, KeyValueDatabase},
        write_batch::{ConcurrentWriteBatch, WriteBuffer},
    },
    db_invalidation::invalidation_reasons,
};

const META_KEY_OPERATIONS: u32 = 0;
const META_KEY_NEXT_FREE_TASK_ID: u32 = 1;

struct IntKey([u8; 4]);

impl IntKey {
    fn new(value: u32) -> Self {
        Self(value.to_le_bytes())
    }
}

impl AsRef<[u8]> for IntKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

fn as_u32(bytes: impl Borrow<[u8]>) -> Result<u32> {
    let n = u32::from_le_bytes(bytes.borrow().try_into()?);
    Ok(n)
}

// We want to invalidate the cache on panic for most users, but this is a band-aid to underlying
// problems in turbo-tasks.
//
// If we invalidate the cache upon panic and it "fixes" the issue upon restart, users typically
// won't report bugs to us, and we'll never find root-causes for these problems.
//
// These overrides let us avoid the cache invalidation / error suppression within Vercel so that we
// feel these pain points and fix the root causes of bugs.
fn should_invalidate_on_panic() -> bool {
    fn env_is_falsy(key: &str) -> bool {
        env::var_os(key)
            .is_none_or(|value| ["".as_ref(), "0".as_ref(), "false".as_ref()].contains(&&*value))
    }
    static SHOULD_INVALIDATE: LazyLock<bool> = LazyLock::new(|| {
        env_is_falsy("TURBO_ENGINE_SKIP_INVALIDATE_ON_PANIC") && env_is_falsy("__NEXT_TEST_MODE")
    });
    *SHOULD_INVALIDATE
}

pub struct KeyValueDatabaseBackingStorageInner<T: KeyValueDatabase> {
    database: T,
    /// Used when calling [`BackingStorage::invalidate`]. Can be `None` in the memory-only/no-op
    /// storage case.
    base_path: Option<PathBuf>,
    /// Used to skip calling [`invalidate_db`] when the database has already been invalidated.
    invalidated: Mutex<bool>,
    /// We configure a panic hook to invalidate the cache. This guard cleans up our panic hook upon
    /// drop.
    _panic_hook_guard: Option<PanicHookGuard>,
}

pub struct KeyValueDatabaseBackingStorage<T: KeyValueDatabase> {
    // wrapped so that `register_panic_hook` can hold a weak reference to `inner`.
    inner: Arc<KeyValueDatabaseBackingStorageInner<T>>,
}

/// A wrapper type used by [`crate::turbo_backing_storage`] and [`crate::noop_backing_storage`].
///
/// Wraps a low-level key-value database into a higher-level [`BackingStorage`] type.
impl<T: KeyValueDatabase> KeyValueDatabaseBackingStorage<T> {
    pub(crate) fn new_in_memory(database: T) -> Self {
        Self {
            inner: Arc::new(KeyValueDatabaseBackingStorageInner {
                database,
                base_path: None,
                invalidated: Mutex::new(false),
                _panic_hook_guard: None,
            }),
        }
    }

    /// Handles boilerplate logic for an on-disk persisted database with versioning.
    ///
    /// - Creates a directory per version, with a maximum number of old versions and performs
    ///   automatic cleanup of old versions.
    /// - Checks for a database invalidation marker file, and cleans up the database as needed.
    /// - [Registers a dynamic panic hook][turbo_tasks::panic_hooks] to invalidate the database upon
    ///   a panic. This invalidates the database using [`invalidation_reasons::PANIC`].
    ///
    /// Along with returning a [`KeyValueDatabaseBackingStorage`], this returns a
    /// [`StartupCacheState`], which can be used by the application for logging information to the
    /// user or telemetry about the cache.
    pub(crate) fn open_versioned_on_disk(
        base_path: PathBuf,
        version_info: &GitVersionInfo,
        is_ci: bool,
        database: impl FnOnce(PathBuf) -> Result<T>,
    ) -> Result<(Self, StartupCacheState)>
    where
        T: Send + Sync + 'static,
    {
        let startup_cache_state = check_db_invalidation_and_cleanup(&base_path)
            .context("Failed to check database invalidation and cleanup")?;
        let versioned_path = handle_db_versioning(&base_path, version_info, is_ci)
            .context("Failed to handle database versioning")?;
        let database = (database)(versioned_path).context("Failed to open database")?;
        let backing_storage = Self {
            inner: Arc::new_cyclic(
                move |weak_inner: &Weak<KeyValueDatabaseBackingStorageInner<T>>| {
                    let panic_hook_guard = if should_invalidate_on_panic() {
                        let weak_inner = weak_inner.clone();
                        Some(register_panic_hook(Box::new(move |_| {
                            let Some(inner) = weak_inner.upgrade() else {
                                return;
                            };
                            // If a panic happened that must mean something deep inside of turbopack
                            // or turbo-tasks failed, and it may be hard to recover. We don't want
                            // the cache to stick around, as that may persist bugs. Make a
                            // best-effort attempt to invalidate the database (ignoring failures).
                            let _ = inner.invalidate(invalidation_reasons::PANIC);
                        })))
                    } else {
                        None
                    };
                    KeyValueDatabaseBackingStorageInner {
                        database,
                        base_path: Some(base_path),
                        invalidated: Mutex::new(false),
                        _panic_hook_guard: panic_hook_guard,
                    }
                },
            ),
        };
        Ok((backing_storage, startup_cache_state))
    }
}

impl<T: KeyValueDatabase> KeyValueDatabaseBackingStorageInner<T> {
    fn invalidate(&self, reason_code: &str) -> Result<()> {
        // `base_path` can be `None` for a `NoopKvDb`
        if let Some(base_path) = &self.base_path {
            // Invalidation could happen frequently if there's a bunch of panics. We only need to
            // invalidate once, so grab a lock.
            let mut invalidated_guard = self
                .invalidated
                .lock()
                .unwrap_or_else(PoisonError::into_inner);
            if *invalidated_guard {
                return Ok(());
            }
            // Invalidate first, as it's a very fast atomic operation. `prevent_writes` is allowed
            // to be slower (e.g. wait for a lock) and is allowed to corrupt the database with
            // partial writes.
            invalidate_db(base_path, reason_code)?;
            self.database.prevent_writes();
            // Avoid redundant invalidations from future panics
            *invalidated_guard = true;
        }
        Ok(())
    }

    /// Used to read the next free task ID from the database.
    fn get_infra_u32(&self, key: u32) -> Result<Option<u32>> {
        self.database
            .get(KeySpace::Infra, IntKey::new(key).as_ref())?
            .map(as_u32)
            .transpose()
    }
}

impl<T: KeyValueDatabase + Send + Sync + 'static> BackingStorage
    for KeyValueDatabaseBackingStorage<T>
{
    fn invalidate(&self, reason_code: &str) -> Result<()> {
        self.inner.invalidate(reason_code)
    }
}

impl<T: KeyValueDatabase + Send + Sync + 'static> BackingStorageSealed
    for KeyValueDatabaseBackingStorage<T>
{
    fn next_free_task_id(&self) -> Result<TaskId> {
        Ok(self
            .inner
            .get_infra_u32(META_KEY_NEXT_FREE_TASK_ID)
            .context("Unable to read next free task id from database")?
            .map_or(Ok(TaskId::MIN), TaskId::try_from)?)
    }

    fn uncompleted_operations(&self) -> Result<Vec<AnyOperation>> {
        fn get(database: &impl KeyValueDatabase) -> Result<Vec<AnyOperation>> {
            let Some(operations) =
                database.get(KeySpace::Infra, IntKey::new(META_KEY_OPERATIONS).as_ref())?
            else {
                return Ok(Vec::new());
            };
            let operations = turbo_bincode_decode(operations.borrow())?;
            Ok(operations)
        }
        get(&self.inner.database).context("Unable to read uncompleted operations from database")
    }

    fn save_snapshot<I>(&self, operations: Vec<Arc<AnyOperation>>, snapshots: Vec<I>) -> Result<()>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync,
    {
        let _span = tracing::info_span!("save snapshot", operations = operations.len()).entered();
        let batch = self.inner.database.write_batch()?;

        {
            let _span = tracing::trace_span!("update task data").entered();
            let max_new_task_id =
                parallel::map_collect_owned::<_, _, Result<Vec<_>>>(snapshots, |shard: I| {
                    let mut max_new_task_id = 0;
                    for SnapshotItem {
                        task_id,
                        meta,
                        data,
                        task_type_hash,
                    } in shard
                    {
                        let key = IntKey::new(*task_id);
                        let key = key.as_ref();
                        if let Some(meta) = meta {
                            batch.put(
                                KeySpace::TaskMeta,
                                WriteBuffer::Borrowed(key),
                                WriteBuffer::SmallVec(meta),
                            )?;
                        }
                        if let Some(data) = data {
                            batch.put(
                                KeySpace::TaskData,
                                WriteBuffer::Borrowed(key),
                                WriteBuffer::SmallVec(data),
                            )?;
                        }
                        // Write task cache entry inline if this is a new task
                        if let Some(task_type_hash) = task_type_hash {
                            batch.put(
                                KeySpace::TaskCache,
                                WriteBuffer::Borrowed(&task_type_hash),
                                WriteBuffer::Borrowed(key),
                            )?;
                            max_new_task_id = max_new_task_id.max(*task_id);
                        }
                    }
                    Ok(max_new_task_id)
                })?
                .into_iter()
                .max()
                .unwrap_or_default();

            let span = tracing::trace_span!("flush task data").entered();
            parallel::try_for_each(
                &[KeySpace::TaskMeta, KeySpace::TaskData, KeySpace::TaskCache],
                |&key_space| {
                    let _span = span.clone().entered();
                    // Safety: `map_collect_owned` has returned, so no concurrent `put` or
                    // `delete` on these key spaces are in-flight.
                    unsafe { batch.flush(key_space) }
                },
            )?;

            let mut next_task_id = get_next_free_task_id(&batch)?;
            next_task_id = next_task_id.max(max_new_task_id + 1);

            save_infra(&batch, next_task_id, operations)?;
            {
                let _span = tracing::trace_span!("commit").entered();
                batch.commit().context("Unable to commit operations")?;
            }
            Ok(())
        }
    }

    fn lookup_task_candidates(&self, task_type: &CachedTaskType) -> Result<SmallVec<[TaskId; 1]>> {
        let inner = &*self.inner;
        if inner.database.is_empty() {
            // Checking if the database is empty is a performance optimization
            // to avoid computing the hash.
            return Ok(SmallVec::new());
        }
        let hash = compute_task_type_hash(task_type);
        let buffers = inner
            .database
            .get_multiple(KeySpace::TaskCache, &hash)
            .with_context(|| {
                format!("Looking up task id for {task_type:?} from database failed")
            })?;

        let mut task_ids = SmallVec::with_capacity(buffers.len());
        for bytes in buffers {
            let bytes = bytes.borrow().try_into()?;
            let id = TaskId::try_from(u32::from_le_bytes(bytes)).unwrap();
            task_ids.push(id);
        }
        Ok(task_ids)
    }

    fn lookup_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
        storage: &mut TaskStorage,
    ) -> Result<()> {
        let inner = &*self.inner;
        let Some(bytes) = inner
            .database
            .get(category.key_space(), IntKey::new(*task_id).as_ref())
            .with_context(|| {
                format!("Looking up task storage for {task_id} from database failed")
            })?
        else {
            return Ok(());
        };
        let mut decoder = new_turbo_bincode_decoder(bytes.borrow());
        storage
            .decode(category, &mut decoder)
            .map_err(|e| anyhow::anyhow!("Failed to decode {category:?}: {e:?}"))
    }

    fn batch_lookup_data(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
    ) -> Result<Vec<TaskStorage>> {
        let inner = &*self.inner;
        let int_keys: Vec<_> = task_ids.iter().map(|&id| IntKey::new(*id)).collect();
        let keys = int_keys.iter().map(|k| k.as_ref()).collect::<Vec<_>>();
        let bytes = inner
            .database
            .batch_get(category.key_space(), &keys)
            .with_context(|| {
                format!(
                    "Looking up typed data for {} tasks from database failed",
                    task_ids.len()
                )
            })?;
        bytes
            .into_iter()
            .map(|opt_bytes| {
                let mut storage = TaskStorage::new();
                if let Some(bytes) = opt_bytes {
                    let mut decoder = new_turbo_bincode_decoder(bytes.borrow());
                    storage
                        .decode(category, &mut decoder)
                        .map_err(|e| anyhow::anyhow!("Failed to decode {category:?}: {e:?}"))?;
                }
                Ok(storage)
            })
            .collect::<Result<Vec<_>>>()
    }

    fn compact(&self) -> Result<bool> {
        self.inner.database.compact()
    }

    fn shutdown(&self) -> Result<()> {
        self.inner.database.shutdown()
    }

    fn has_unrecoverable_write_error(&self) -> bool {
        self.inner.database.has_unrecoverable_write_error()
    }
}

fn get_next_free_task_id<'a>(batch: &impl ConcurrentWriteBatch<'a>) -> Result<u32, anyhow::Error> {
    Ok(
        match batch.get(
            KeySpace::Infra,
            IntKey::new(META_KEY_NEXT_FREE_TASK_ID).as_ref(),
        )? {
            Some(bytes) => u32::from_le_bytes(Borrow::<[u8]>::borrow(&bytes).try_into()?),
            None => 1,
        },
    )
}

fn save_infra<'a>(
    batch: &impl ConcurrentWriteBatch<'a>,
    next_task_id: u32,
    operations: Vec<Arc<AnyOperation>>,
) -> Result<(), anyhow::Error> {
    batch
        .put(
            KeySpace::Infra,
            WriteBuffer::Borrowed(IntKey::new(META_KEY_NEXT_FREE_TASK_ID).as_ref()),
            WriteBuffer::Borrowed(&next_task_id.to_le_bytes()),
        )
        .context("Unable to write next free task id")?;
    {
        let _span =
            tracing::trace_span!("update operations", operations = operations.len()).entered();
        let operations =
            turbo_bincode_encode(&operations).context("Unable to serialize operations")?;
        batch
            .put(
                KeySpace::Infra,
                WriteBuffer::Borrowed(IntKey::new(META_KEY_OPERATIONS).as_ref()),
                WriteBuffer::SmallVec(operations),
            )
            .context("Unable to write operations")?;
    }
    // Safety: save_infra is called after all concurrent writes to Infra are done.
    unsafe { batch.flush(KeySpace::Infra)? };
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::borrow::Borrow;

    use turbo_tasks::TaskId;

    use super::*;
    use crate::database::{
        key_value_database::KeyValueDatabase,
        turbo::TurboKeyValueDatabase,
        write_batch::{ConcurrentWriteBatch, WriteBuffer},
    };

    /// Helper to write to the database using the concurrent batch API.
    fn write_task_cache_entry(
        db: &TurboKeyValueDatabase,
        hash: u64,
        task_id: TaskId,
    ) -> Result<()> {
        let batch = db.write_batch()?;
        batch.put(
            KeySpace::TaskCache,
            WriteBuffer::Borrowed(&hash.to_le_bytes()),
            WriteBuffer::Borrowed(&(*task_id).to_le_bytes()),
        )?;
        batch.commit()?;
        Ok(())
    }

    /// Tests that `get_multiple` correctly returns multiple TaskIds when the same hash key
    /// is used (simulating a hash collision scenario).
    ///
    /// This is a lower-level test that verifies the database layer correctly handles
    /// the case where multiple task IDs are stored under the same hash key.
    #[tokio::test(flavor = "multi_thread")]
    async fn test_hash_collision_returns_multiple_candidates() -> Result<()> {
        let tempdir = tempfile::tempdir()?;
        let path = tempdir.path();

        // Use is_short_session=true to disable background compaction (which requires turbo-tasks
        // context)
        let db = TurboKeyValueDatabase::new(path.to_path_buf(), false, true, false)?;

        // Simulate a hash collision by writing multiple TaskIds with the same hash key
        let collision_hash: u64 = 0xDEADBEEF;
        let task_id_1 = TaskId::try_from(100u32).unwrap();
        let task_id_2 = TaskId::try_from(200u32).unwrap();
        let task_id_3 = TaskId::try_from(300u32).unwrap();

        // Write three task IDs under the same hash key (simulating collision)
        // Each write creates a new SST file, so all three will be returned by get_multiple
        write_task_cache_entry(&db, collision_hash, task_id_1)?;
        write_task_cache_entry(&db, collision_hash, task_id_2)?;
        write_task_cache_entry(&db, collision_hash, task_id_3)?;

        // Now query using get_multiple - should return all three TaskIds
        let results = db.get_multiple(KeySpace::TaskCache, &collision_hash.to_le_bytes())?;

        assert_eq!(
            results.len(),
            3,
            "Should return all 3 task IDs for the colliding hash"
        );

        // Convert results to TaskIds and verify all three are present
        let mut found_ids: Vec<TaskId> = results
            .iter()
            .map(|bytes| {
                let bytes: [u8; 4] = Borrow::<[u8]>::borrow(bytes).try_into().unwrap();
                TaskId::try_from(u32::from_le_bytes(bytes)).unwrap()
            })
            .collect();
        found_ids.sort_by_key(|id| **id);

        assert_eq!(found_ids, vec![task_id_1, task_id_2, task_id_3]);

        db.shutdown()?;
        Ok(())
    }

    /// Tests that multiple distinct keys written in a single batch with flush can be read back.
    /// This mirrors the actual save_snapshot pattern: write many TaskCache entries, flush, commit.
    #[tokio::test(flavor = "multi_thread")]
    async fn test_batch_write_with_flush_and_reopen() -> Result<()> {
        let tempdir = tempfile::tempdir()?;
        let path = tempdir.path();

        let n = 100_000;
        let hashes: Vec<u64> = (0..n).map(|i| 0x1000 + i as u64).collect();
        let task_ids: Vec<TaskId> = (1..=n as u32)
            .map(|i| TaskId::try_from(i).unwrap())
            .collect();

        // Write all entries in a single batch with flush (like save_snapshot does)
        {
            let db = TurboKeyValueDatabase::new(path.to_path_buf(), false, true, false)?;
            let batch = db.write_batch()?;

            for (hash, task_id) in hashes.iter().zip(task_ids.iter()) {
                batch.put(
                    KeySpace::TaskCache,
                    WriteBuffer::Borrowed(&hash.to_le_bytes()),
                    WriteBuffer::Borrowed(&(**task_id).to_le_bytes()),
                )?;
            }
            // Flush TaskCache (like the new code does)
            unsafe { batch.flush(KeySpace::TaskCache) }?;
            batch.commit()?;

            db.shutdown()?;
        }

        // Reopen and verify all entries are readable
        {
            let db = TurboKeyValueDatabase::new(path.to_path_buf(), false, true, false)?;
            let mut found = 0;
            let mut missing = 0;
            for (hash, expected_id) in hashes.iter().zip(task_ids.iter()) {
                let results = db.get_multiple(KeySpace::TaskCache, &hash.to_le_bytes())?;
                if results.is_empty() {
                    missing += 1;
                } else {
                    found += 1;
                    let bytes: [u8; 4] = Borrow::<[u8]>::borrow(&results[0]).try_into().unwrap();
                    let id = TaskId::try_from(u32::from_le_bytes(bytes)).unwrap();
                    assert_eq!(id, *expected_id, "Task ID mismatch for hash {hash:#x}");
                }
            }
            assert_eq!(missing, 0, "Found {found}/{n} entries, missing {missing}");
            db.shutdown()?;
        }

        Ok(())
    }
}
