use std::{
    borrow::Borrow,
    env,
    fmt::Display,
    path::{Path, PathBuf},
    sync::{Arc, LazyLock, Mutex, PoisonError, Weak},
};

use anyhow::{Context, Result};
use smallvec::SmallVec;
use turbo_bincode::{new_turbo_bincode_decoder, turbo_bincode_decode, turbo_bincode_encode};
use turbo_persistence::{CacheFileUnreadable, CommitStats};
use turbo_tasks::{
    DynTaskInputs, PersistentCacheUnreadablePanic, RawVc, TaskId,
    macro_helpers::NativeFunction,
    panic_hooks::{PanicHookGuard, register_panic_hook},
    parallel,
};

use crate::{
    GitVersionInfo,
    backend::{SpecificTaskDataCategory, TtlCounter, storage_schema::TaskStorage},
    backing_storage::{SnapshotItem, SnapshotMeta, compute_task_type_hash_from_components},
    database::{
        db_invalidation::{StartupCacheState, check_db_invalidation_and_cleanup, invalidate_db},
        db_versioning::handle_db_versioning,
        key_value_database::KeySpace,
        turbo::{TurboKeyValueDatabase, TurboWriteBatch},
        write_batch::WriteBuffer,
    },
    db_invalidation::invalidation_reasons,
};

/// The fixed keys in the [`KeySpace::Infra`] keyspace.
#[derive(Clone, Copy)]
#[repr(u8)]
enum InfraKey {
    NextFreeTaskId = 0,
    GcRoots = 1,
}

impl InfraKey {
    fn key(self) -> ByteKey {
        ByteKey::new(self as u8)
    }
}

struct ByteKey([u8; 1]);

impl ByteKey {
    fn new(value: u8) -> Self {
        Self([value])
    }
}

impl AsRef<[u8]> for ByteKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

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

/// Builds the message of a [`PersistentCacheUnreadablePanic`] if `error` was caused by a database
/// file that couldn't be read (see [`CacheFileUnreadable`]), otherwise returns `None`.
///
/// `base_path` is the directory of the filesystem cache (`None` for in-memory storage), and
/// `invalidates_on_panic` whether the panic hook registered by
/// [`TurboBackingStorage::open_versioned_on_disk`] invalidates the cache (see
/// [`should_invalidate_on_panic`]). That invalidation is best-effort, so the message doesn't claim
/// that it succeeded.
fn unreadable_cache_message(
    error: &anyhow::Error,
    base_path: Option<&Path>,
    invalidates_on_panic: bool,
) -> Option<String> {
    let unreadable = CacheFileUnreadable::find(error)?;
    let what_to_do = match base_path {
        Some(base_path) if invalidates_on_panic => format!(
            "Turbopack will try to invalidate the filesystem cache, so that it is rebuilt on the \
             next start. Restart to continue. If this error comes back, delete {} manually.",
            base_path.display()
        ),
        Some(base_path) => format!("Delete {} and restart to continue.", base_path.display()),
        None => "Restart to continue.".to_string(),
    };
    Some(format!(
        "Turbopack's filesystem cache could not be read: the cache file {} is missing or \
         corrupted. It may have been deleted or modified outside of Turbopack while Turbopack was \
         running.\n{what_to_do}\n\nDetails: {error:?}",
        unreadable.file_name()
    ))
}

struct TurboBackingStorageInner {
    database: TurboKeyValueDatabase,
    /// Used when calling [`TurboBackingStorage::invalidate`]. Can be `None` in the
    /// memory-only/no-op storage case.
    base_path: Option<PathBuf>,
    /// Used to skip calling [`invalidate_db`] when the database has already been invalidated.
    invalidated: Mutex<bool>,
    /// We configure a panic hook to invalidate the cache. This guard cleans up our panic hook upon
    /// drop.
    _panic_hook_guard: Option<PanicHookGuard>,
}

/// The higher-level backing storage passed to [`TurboTasksBackend::new`], used by
/// [`crate::turbo_backing_storage`] and [`crate::noop_backing_storage`].
///
/// Wraps a low-level `TurboKeyValueDatabase` and adapts it into the persistence operations the
/// backend needs (snapshots, task-candidate lookups, etc.).
///
/// [`TurboTasksBackend::new`]: crate::TurboTasksBackend::new
pub struct TurboBackingStorage {
    // wrapped so that `register_panic_hook` can hold a weak reference to `inner`.
    inner: Arc<TurboBackingStorageInner>,
}

impl TurboBackingStorage {
    pub(crate) fn new_in_memory(database: TurboKeyValueDatabase) -> Self {
        Self {
            inner: Arc::new(TurboBackingStorageInner {
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
    /// Along with returning a [`TurboBackingStorage`], this returns a
    /// [`StartupCacheState`], which can be used by the application for logging information to the
    /// user or telemetry about the cache.
    pub(crate) fn open_versioned_on_disk(
        base_path: PathBuf,
        version_info: &GitVersionInfo,
        is_ci: bool,
        database: impl FnOnce(PathBuf) -> Result<TurboKeyValueDatabase>,
    ) -> Result<(Self, StartupCacheState)> {
        let startup_cache_state = check_db_invalidation_and_cleanup(&base_path)
            .context("Failed to check database invalidation and cleanup")?;
        let versioned_path = handle_db_versioning(&base_path, version_info, is_ci)
            .context("Failed to handle database versioning")?;
        let database = (database)(versioned_path).context("Failed to open database")?;
        let backing_storage = Self {
            inner: Arc::new_cyclic(move |weak_inner: &Weak<TurboBackingStorageInner>| {
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
                TurboBackingStorageInner {
                    database,
                    base_path: Some(base_path),
                    invalidated: Mutex::new(false),
                    _panic_hook_guard: panic_hook_guard,
                }
            }),
        };
        Ok((backing_storage, startup_cache_state))
    }
}

impl TurboBackingStorageInner {
    fn invalidate(&self, reason_code: &str) -> Result<()> {
        // `base_path` is `None` for in-memory backing storage (see `noop_backing_storage`).
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
    fn get_infra_u32(&self, key: InfraKey) -> Result<Option<u32>> {
        self.database
            .get(KeySpace::Infra, key.key().as_ref())?
            .map(as_u32)
            .transpose()
    }
}

impl TurboBackingStorage {
    /// Called when the database should be invalidated upon re-initialization.
    ///
    /// This typically means that we'll restart the process or `turbo-tasks` soon with a fresh
    /// database. If this happens, there's no point in writing anything else to disk, or flushing
    /// during [`TurboTasksBackend::stop`].
    ///
    /// [`TurboTasksBackend::stop`]: turbo_tasks::backend::Backend::stop
    pub(crate) fn invalidate(&self, reason_code: &str) -> Result<()> {
        self.inner.invalidate(reason_code)
    }

    /// Panics because reading from the database failed with `error`, which can't be recovered
    /// from: the task graph can't be restored without that data.
    ///
    /// If a database file couldn't be read (see [`CacheFileUnreadable`]), e.g. because it was
    /// deleted or modified by another process while it was in use, the panic payload is a
    /// [`PersistentCacheUnreadablePanic`] with a message explaining that and what to do about it.
    /// Otherwise this panics with `description` and `error` as before.
    #[cold]
    #[track_caller]
    pub(crate) fn panic_on_read_error(&self, description: impl Display, error: anyhow::Error) -> ! {
        if let Some(message) = unreadable_cache_message(
            &error,
            self.inner.base_path.as_deref(),
            should_invalidate_on_panic(),
        ) {
            std::panic::panic_any(PersistentCacheUnreadablePanic { message });
        }
        panic!("{description}: {error:?}");
    }

    pub(crate) fn next_free_task_id(&self) -> Result<TaskId> {
        Ok(self
            .inner
            .get_infra_u32(InfraKey::NextFreeTaskId)
            .context("Unable to read next free task id from database")?
            .map_or(Ok(TaskId::MIN), TaskId::try_from)?)
    }

    /// Reads the persisted GC roots set (see [`InfraKey::GcRoots`]). Empty on a fresh database.
    pub(crate) fn roots(&self) -> Result<Vec<(TaskId, TtlCounter)>> {
        fn get(database: &TurboKeyValueDatabase) -> Result<Vec<(TaskId, TtlCounter)>> {
            let Some(roots) = database.get(KeySpace::Infra, InfraKey::GcRoots.key().as_ref())?
            else {
                return Ok(Vec::new());
            };
            let roots = turbo_bincode_decode(roots.borrow())?;
            Ok(roots)
        }
        get(&self.inner.database).context("Unable to read GC roots from database")
    }

    pub(crate) fn save_snapshot<I>(
        &self,
        roots: Option<Vec<(TaskId, TtlCounter)>>,
        snapshots: Vec<I>,
    ) -> Result<SnapshotMeta>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync,
    {
        let _span = tracing::info_span!("save snapshot").entered();
        let batch = self.inner.database.write_batch()?;

        {
            let span = tracing::trace_span!("update task data");
            let mut snapshot_meta =
                parallel::map_collect_owned::<_, _, Result<Vec<_>>>(snapshots, |shard: I| {
                    let _span = span.clone().entered();
                    let mut max_new_task_id = 0;
                    let mut data_items = 0;
                    let mut meta_items = 0;
                    let mut task_cache_items = 0;
                    for item in shard {
                        match item {
                            SnapshotItem::Put {
                                task_id,
                                meta,
                                data,
                                task_type_hash,
                                ..
                            } => {
                                let key = IntKey::new(*task_id);
                                let key = key.as_ref();
                                if let Some(meta) = meta {
                                    batch.put(
                                        KeySpace::TaskMeta,
                                        WriteBuffer::Borrowed(key),
                                        WriteBuffer::Owned(meta),
                                    )?;
                                    meta_items += 1;
                                }
                                if let Some(data) = data {
                                    batch.put(
                                        KeySpace::TaskData,
                                        WriteBuffer::Borrowed(key),
                                        WriteBuffer::Owned(data),
                                    )?;
                                    data_items += 1;
                                }
                                // Register the task type only for new tasks.
                                if let Some(task_type_hash) = task_type_hash {
                                    batch.put(
                                        KeySpace::TaskCache,
                                        WriteBuffer::Borrowed(&task_type_hash),
                                        WriteBuffer::Borrowed(key),
                                    )?;
                                    task_cache_items += 1;
                                    max_new_task_id = max_new_task_id.max(*task_id);
                                }
                            }
                            SnapshotItem::Delete {
                                task_id,
                                task_type_hash,
                            } => {
                                let key = IntKey::new(*task_id);
                                let key = key.as_ref();
                                batch.delete(KeySpace::TaskMeta, WriteBuffer::Borrowed(key))?;
                                batch.delete(KeySpace::TaskData, WriteBuffer::Borrowed(key))?;
                                // TaskCache is MultiValue, delete just this id from the bucket.
                                batch.delete_value(
                                    KeySpace::TaskCache,
                                    WriteBuffer::Borrowed(&task_type_hash[..]),
                                    WriteBuffer::Borrowed(key),
                                )?;
                            }
                        }
                    }
                    Ok(SnapshotMeta {
                        data_items,
                        meta_items,
                        task_cache_items,
                        // The on-disk byte totals aren't known until the batch is committed
                        // below; they're filled in from `CommitStats` after `batch.commit()`.
                        bytes_written: 0,
                        bytes_deleted: 0,
                        max_next_task_id: max_new_task_id,
                    })
                })?
                .into_iter()
                .reduce(|t1, t2| t1.merge(t2))
                .unwrap_or_default();

            let span = tracing::trace_span!("flush task data");
            parallel::try_for_each(
                &[KeySpace::TaskMeta, KeySpace::TaskData, KeySpace::TaskCache],
                |&key_space| {
                    let _span = span.clone().entered();
                    // Safety: `map_collect_owned` has returned, so no concurrent `put` or `delete`
                    // on these key spaces are in-flight.
                    unsafe { batch.flush(key_space) }
                },
            )?;

            let mut next_task_id = get_next_free_task_id(&batch)?;
            next_task_id = next_task_id.max(snapshot_meta.max_next_task_id + 1);

            save_infra(&batch, next_task_id, roots)?;
            {
                let _span = tracing::trace_span!("commit").entered();
                // Byte totals are the physical on-disk bytes (post-compression, including .sst /
                // .blob / .meta files) produced and removed by the commit.
                let stats = batch.commit().context("Unable to commit snapshot")?;
                snapshot_meta.bytes_written = stats.bytes_written;
                snapshot_meta.bytes_deleted = stats.bytes_deleted;
            }
            Ok(snapshot_meta)
        }
    }

    pub(crate) fn lookup_task_candidates(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> Result<SmallVec<[TaskId; 1]>> {
        let inner = &*self.inner;
        if inner.database.is_empty() {
            // Checking if the database is empty is a performance optimization
            // to avoid computing the hash.
            return Ok(SmallVec::new());
        }
        let hash = compute_task_type_hash_from_components(native_fn, this, arg);
        let buffers = inner
            .database
            .get_multiple(KeySpace::TaskCache, &hash)
            .with_context(|| {
                format!("Looking up task id for {native_fn:?}(this={this:?}) from database failed")
            })?;

        let mut task_ids = SmallVec::with_capacity(buffers.len());
        for bytes in buffers {
            let bytes = Borrow::<[u8]>::borrow(&bytes).try_into()?;
            let id = TaskId::try_from(u32::from_le_bytes(bytes)).unwrap();
            task_ids.push(id);
        }
        Ok(task_ids)
    }

    /// Reads the stored `category` for `task_id`.
    ///
    /// `None` means the database had no key for this category. That is distinct from `Some`
    /// of an empty [`TaskStorage`] (a key that decoded to nothing): `MustExist` treats a missing
    /// requested category as a missing task, regardless of the other category.
    pub(crate) fn lookup_data(
        &self,
        task_id: TaskId,
        category: SpecificTaskDataCategory,
    ) -> Result<Option<TaskStorage>> {
        let inner = &*self.inner;
        let Some(bytes) = inner
            .database
            .get(category.key_space(), IntKey::new(*task_id).as_ref())
            .with_context(|| {
                format!("Looking up task storage for {task_id} from database failed")
            })?
        else {
            return Ok(None);
        };
        let mut storage = TaskStorage::default();
        let mut decoder = new_turbo_bincode_decoder(bytes.borrow());
        storage
            .decode(category, &mut decoder)
            .with_context(|| format!("Failed to decode {category:?}"))?;
        Ok(Some(storage))
    }

    /// Looks up and decodes the `category` of many tasks. Calls `on_result` with the index of the
    /// task in `task_ids` and its decoded storage, or `None` if the category has no key on disk.
    ///
    /// When this returns `Ok`, `on_result` was called exactly once for every index. The calls
    /// happen in no particular order and may run concurrently on other threads, so decoding
    /// runs in parallel for large batches. A read, decode or `on_result` error aborts the
    /// batch.
    pub(crate) fn batch_lookup_data(
        &self,
        task_ids: &[TaskId],
        category: SpecificTaskDataCategory,
        on_result: impl Fn(usize, Option<TaskStorage>) -> Result<()> + Sync,
    ) -> Result<()> {
        let inner = &*self.inner;
        let int_keys: Vec<_> = task_ids.iter().map(|&id| IntKey::new(*id)).collect();
        let keys = int_keys.iter().map(|k| k.as_ref()).collect::<Vec<_>>();
        inner
            .database
            .batch_get(category.key_space(), &keys, |index, opt_bytes| {
                let Some(bytes) = opt_bytes else {
                    return on_result(index, None);
                };
                let mut storage = TaskStorage::new();
                let mut decoder = new_turbo_bincode_decoder(bytes.borrow());
                storage
                    .decode(category, &mut decoder)
                    .map_err(|e| anyhow::anyhow!("Failed to decode {category:?}: {e:?}"))?;
                on_result(index, Some(storage))
            })
            .with_context(|| {
                format!(
                    "Looking up typed data for {} tasks from database failed",
                    task_ids.len()
                )
            })
    }

    pub(crate) fn compact(&self) -> Result<Option<CommitStats>> {
        self.inner.database.compact()
    }

    pub(crate) fn shutdown(&self) {
        self.inner.database.shutdown()
    }

    pub(crate) fn has_unrecoverable_write_error(&self) -> bool {
        self.inner.database.has_unrecoverable_write_error()
    }
}

fn get_next_free_task_id(batch: &TurboWriteBatch<'_>) -> Result<u32, anyhow::Error> {
    Ok(
        match batch.get(KeySpace::Infra, InfraKey::NextFreeTaskId.key().as_ref())? {
            Some(bytes) => u32::from_le_bytes(Borrow::<[u8]>::borrow(&bytes).try_into()?),
            None => 1,
        },
    )
}

fn save_infra(
    batch: &TurboWriteBatch<'_>,
    next_task_id: u32,
    roots: Option<Vec<(TaskId, TtlCounter)>>,
) -> Result<(), anyhow::Error> {
    batch
        .put(
            KeySpace::Infra,
            WriteBuffer::Borrowed(InfraKey::NextFreeTaskId.key().as_ref()),
            WriteBuffer::Borrowed(&next_task_id.to_le_bytes()),
        )
        .context("Unable to write next free task id")?;
    if let Some(roots) = roots {
        let _span = tracing::trace_span!("update roots", roots = roots.len()).entered();
        let roots = turbo_bincode_encode(&roots).context("Unable to serialize GC roots")?;
        batch
            .put(
                KeySpace::Infra,
                WriteBuffer::Borrowed(InfraKey::GcRoots.key().as_ref()),
                WriteBuffer::Owned(roots.into_boxed_slice()),
            )
            .context("Unable to write GC roots")?;
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
    use crate::{
        BackingStorageOptions,
        database::{turbo::TurboKeyValueDatabase, write_batch::WriteBuffer},
        utils::test_temp_dir::test_temp_dir,
    };

    /// Options used by these tests. `is_short_session` disables background compaction, which
    /// requires a turbo-tasks context that these tests don't set up.
    const TEST_STORAGE_OPTIONS: BackingStorageOptions = BackingStorageOptions {
        is_ci: false,
        is_short_session: true,
        skip_compaction: false,
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

    /// Reads the TaskIds stored under `hash` in `TaskCache`, sorted for stable comparison.
    fn task_cache_ids(db: &TurboKeyValueDatabase, hash: u64) -> Result<Vec<TaskId>> {
        let mut ids: Vec<TaskId> = db
            .get_multiple(KeySpace::TaskCache, &hash.to_le_bytes())?
            .iter()
            .map(|bytes| {
                let bytes: [u8; 4] = Borrow::<[u8]>::borrow(bytes).try_into().unwrap();
                TaskId::try_from(u32::from_le_bytes(bytes)).unwrap()
            })
            .collect();
        ids.sort_by_key(|id| **id);
        Ok(ids)
    }

    /// Encodes a distinct [`TaskStorage`] for `seed`, with both meta and data fields populated.
    fn encoded_task_storage(seed: u32, category: SpecificTaskDataCategory) -> Vec<u8> {
        use crate::{
            backend::{TrackOutcome, storage_schema::TaskStorageAccessors},
            data::{AggregationNumber, OutputValue},
        };

        /// Accessors over a bare [`TaskStorage`], without modification tracking.
        struct Untracked(TaskStorage);
        impl TaskStorageAccessors for Untracked {
            fn typed(&self) -> &TaskStorage {
                &self.0
            }
            fn typed_mut(&mut self) -> &mut TaskStorage {
                &mut self.0
            }
            fn track_modification(
                &mut self,
                _category: SpecificTaskDataCategory,
                _name: &str,
            ) -> TrackOutcome {
                TrackOutcome::NoChange
            }
            fn undo_track_modification(&mut self, _outcome: TrackOutcome) {}
            fn check_access(&self, _category: SpecificTaskDataCategory) {}
        }

        let id = |n: u32| TaskId::try_from(n).unwrap();
        let mut task = Untracked(TaskStorage::new());
        task.set_output(OutputValue::Output(id(seed + 1)));
        task.set_aggregation_number(AggregationNumber {
            base: seed,
            distance: 1,
            effective: seed + 1,
        });
        task.add_upper(id(seed + 2), 1);
        assert!(task.add_output_dependencies(id(seed + 3)));
        assert!(task.add_children(id(seed + 4)));
        let storage = task.0;
        let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
        storage
            .encode(
                category,
                &mut turbo_bincode::new_turbo_bincode_encoder(&mut buffer),
            )
            .unwrap();
        buffer.to_vec()
    }

    fn reencode(
        storages: &[Option<TaskStorage>],
        category: SpecificTaskDataCategory,
    ) -> Vec<Option<Vec<u8>>> {
        storages
            .iter()
            .map(|storage| {
                storage.as_ref().map(|storage| {
                    let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
                    storage
                        .encode(
                            category,
                            &mut turbo_bincode::new_turbo_bincode_encoder(&mut buffer),
                        )
                        .unwrap();
                    buffer.to_vec()
                })
            })
            .collect()
    }

    /// Reports every requested index exactly once, with request order, duplicates and missing
    /// entries resolved correctly, on both sides of turbo-persistence's parallel `batch_get`
    /// cutoff. A value that fails to decode fails the whole lookup.
    // Default worker count like the other database tests here: under the WASI test host, file
    // descriptors are per thread, so committing SST files from extra runtime workers fails.
    #[tokio::test(flavor = "multi_thread")]
    async fn test_batch_lookup_data_roundtrip_at_parallel_threshold() -> Result<()> {
        /// turbo-persistence's `batch_get` runs in parallel above this many keys.
        const PARALLEL_BATCH_GET_THRESHOLD: usize = 2048;
        const MALFORMED_ID: u32 = 999_997;

        let tempdir = test_temp_dir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let stored_ids: Vec<TaskId> = (1..=(PARALLEL_BATCH_GET_THRESHOLD as u32 + 64))
            .map(|id| TaskId::try_from(id).unwrap())
            .collect();
        let batch = db.write_batch()?;
        for category in [
            SpecificTaskDataCategory::Meta,
            SpecificTaskDataCategory::Data,
        ] {
            for &task_id in &stored_ids {
                let key = IntKey::new(*task_id);
                let value = encoded_task_storage(*task_id * 10, category);
                batch.put(
                    category.key_space(),
                    WriteBuffer::Borrowed(key.as_ref()),
                    WriteBuffer::Borrowed(&value),
                )?;
            }
            batch.put(
                category.key_space(),
                WriteBuffer::Borrowed(IntKey::new(MALFORMED_ID).as_ref()),
                WriteBuffer::Borrowed(&[0xff; 3]),
            )?;
        }
        batch.commit()?;
        let storage = TurboBackingStorage::new_in_memory(db);

        for category in [
            SpecificTaskDataCategory::Meta,
            SpecificTaskDataCategory::Data,
        ] {
            for len in [
                PARALLEL_BATCH_GET_THRESHOLD,
                PARALLEL_BATCH_GET_THRESHOLD + 1,
            ] {
                let mut requested = stored_ids[..len - 3].to_vec();
                requested.reverse();
                requested.insert(len / 2, TaskId::try_from(999_999).unwrap());
                requested.push(stored_ids[7]);
                requested.push(TaskId::try_from(999_998).unwrap());
                assert_eq!(requested.len(), len);

                let expected: Vec<Option<Vec<u8>>> = requested
                    .iter()
                    .map(|task_id| {
                        (**task_id <= stored_ids.len() as u32)
                            .then(|| encoded_task_storage(**task_id * 10, category))
                    })
                    .collect();
                let slots: Vec<std::sync::OnceLock<Option<TaskStorage>>> =
                    (0..len).map(|_| std::sync::OnceLock::new()).collect();
                storage.batch_lookup_data(&requested, category, |index, storage| {
                    assert!(
                        slots[index].set(storage).is_ok(),
                        "{category:?} len={len}: index {index} reported twice"
                    );
                    Ok(())
                })?;
                let decoded: Vec<Option<TaskStorage>> = slots
                    .into_iter()
                    .enumerate()
                    .map(|(index, slot)| {
                        slot.into_inner().unwrap_or_else(|| {
                            panic!("{category:?} len={len}: index {index} never reported")
                        })
                    })
                    .collect();
                assert_eq!(
                    reencode(&decoded, category),
                    expected,
                    "{category:?} len={len}"
                );

                let mut malformed = requested.clone();
                malformed[len / 3] = TaskId::try_from(MALFORMED_ID).unwrap();
                assert!(
                    storage
                        .batch_lookup_data(&malformed, category, |_, _| Ok(()))
                        .is_err(),
                    "{category:?} len={len} must fail on malformed bytes"
                );
            }
        }

        storage.inner.database.shutdown();
        Ok(())
    }

    /// Tests that `get_multiple` correctly returns multiple TaskIds when the same hash key
    /// is used (simulating a hash collision scenario).
    ///
    /// This is a lower-level test that verifies the database layer correctly handles
    /// the case where multiple task IDs are stored under the same hash key.
    #[tokio::test(flavor = "multi_thread")]
    async fn test_hash_collision_returns_multiple_candidates() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let path = tempdir.path();

        let db = TurboKeyValueDatabase::new(path.to_path_buf(), TEST_STORAGE_OPTIONS)?;

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
        assert_eq!(
            task_cache_ids(&db, collision_hash)?,
            vec![task_id_1, task_id_2, task_id_3],
            "Should return all 3 task IDs for the colliding hash"
        );

        db.shutdown();
        Ok(())
    }

    /// Tests that multiple distinct keys written in a single batch with flush can be read back.
    /// This mirrors the actual save_snapshot pattern: write many TaskCache entries, flush, commit.
    // This test is too slow to run under Miri.
    #[cfg(not(miri))]
    #[tokio::test(flavor = "multi_thread")]
    async fn test_batch_write_with_flush_and_reopen() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let path = tempdir.path();

        let n = 100_000;
        let hashes: Vec<u64> = (0..n).map(|i| 0x1000 + i as u64).collect();
        let task_ids: Vec<TaskId> = (1..=n as u32)
            .map(|i| TaskId::try_from(i).unwrap())
            .collect();

        // Write all entries in a single batch with flush (like save_snapshot does)
        {
            let db = TurboKeyValueDatabase::new(path.to_path_buf(), TEST_STORAGE_OPTIONS)?;
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

            db.shutdown();
        }

        // Reopen and verify all entries are readable
        {
            let db = TurboKeyValueDatabase::new(path.to_path_buf(), TEST_STORAGE_OPTIONS)?;
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
            db.shutdown();
        }

        Ok(())
    }

    /// `save_snapshot` delete path: a `Delete` item must erase the task's `TaskMeta` and
    /// `TaskData` (`SingleValue`) entries and remove *only* that id from its `TaskCache`
    /// (`MultiValue`) bucket.
    ///
    /// The colliding survivor is never read or rewritten — the key-value tombstone names the
    /// single id it deletes, so anything else in the bucket is untouched whether or not this
    /// commit knows about it.
    #[tokio::test(flavor = "multi_thread")]
    async fn test_save_snapshot_delete_tombstones_task() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let path = tempdir.path();

        let collision_hash: u64 = 0xC0FFEE;
        let deleted_id = TaskId::try_from(111u32).unwrap();
        let survivor_id = TaskId::try_from(222u32).unwrap();
        let deleted_key = (*deleted_id).to_le_bytes();

        let db = TurboKeyValueDatabase::new(
            path.to_path_buf(),
            BackingStorageOptions {
                is_ci: false,
                is_short_session: true,
                skip_compaction: false,
            },
        )?;

        // Both ids collide in one TaskCache bucket, purely on disk; the deleted task also has
        // meta and data entries.
        write_task_cache_entry(&db, collision_hash, deleted_id)?;
        write_task_cache_entry(&db, collision_hash, survivor_id)?;
        let batch = db.write_batch()?;
        batch.put(
            KeySpace::TaskMeta,
            WriteBuffer::Borrowed(&deleted_key),
            WriteBuffer::Borrowed(b"meta-bytes"),
        )?;
        batch.put(
            KeySpace::TaskData,
            WriteBuffer::Borrowed(&deleted_key),
            WriteBuffer::Borrowed(b"data-bytes"),
        )?;
        batch.commit()?;

        // Sanity: everything is present before the delete.
        assert!(db.get(KeySpace::TaskMeta, &deleted_key)?.is_some());
        assert!(db.get(KeySpace::TaskData, &deleted_key)?.is_some());
        assert_eq!(
            task_cache_ids(&db, collision_hash)?,
            vec![deleted_id, survivor_id],
        );

        let storage = TurboBackingStorage::new_in_memory(db);

        // Snapshot with no task data, just the one deletion.
        storage.save_snapshot(
            None,
            vec![vec![SnapshotItem::Delete {
                task_id: deleted_id,
                task_type_hash: collision_hash.to_le_bytes(),
            }]],
        )?;

        let db = &storage.inner.database;
        assert!(
            db.get(KeySpace::TaskMeta, &deleted_key)?.is_none(),
            "TaskMeta should be tombstoned"
        );
        assert!(
            db.get(KeySpace::TaskData, &deleted_key)?.is_none(),
            "TaskData should be tombstoned"
        );
        assert_eq!(
            task_cache_ids(db, collision_hash)?,
            vec![survivor_id],
            "save_snapshot should delete only the named id from the bucket"
        );

        db.shutdown();
        Ok(())
    }

    /// An error caused by an unreadable database file, wrapped in further context like the errors
    /// of restoring a task.
    fn unreadable_error() -> anyhow::Error {
        anyhow::Error::new(CacheFileUnreadable::new(
            "00000007.sst",
            anyhow::anyhow!("failed to open file `00000007.sst`: No such file or directory"),
        ))
        .context("Looking up task storage for TaskId 4 from database failed")
        .context("Failed to restore Data for TaskId 4")
    }

    #[test]
    fn test_unreadable_cache_message() {
        let base_path = Path::new("/project/.cache/turbopack");
        let error = unreadable_error();

        let with_invalidation = unreadable_cache_message(&error, Some(base_path), true).unwrap();
        let without_invalidation =
            unreadable_cache_message(&error, Some(base_path), false).unwrap();
        let in_memory = unreadable_cache_message(&error, None, true).unwrap();
        for message in [&with_invalidation, &without_invalidation, &in_memory] {
            assert!(
                message.contains("Turbopack's filesystem cache could not be read"),
                "{message}"
            );
            assert!(message.contains("00000007.sst"), "{message}");
            assert!(
                message.contains("deleted or modified outside of Turbopack"),
                "{message}"
            );
            // The details of the error follow.
            assert!(message.contains("No such file or directory"), "{message}");
            // Invalidating is best-effort, so it's never claimed to have happened.
            assert!(!message.contains("has been deleted"), "{message}");
            assert!(!message.contains("was deleted"), "{message}");
        }
        assert!(
            with_invalidation.contains("will try to invalidate"),
            "{with_invalidation}"
        );
        assert!(
            with_invalidation
                .contains("If this error comes back, delete /project/.cache/turbopack"),
            "{with_invalidation}"
        );
        assert!(
            without_invalidation.contains("Delete /project/.cache/turbopack and restart"),
            "{without_invalidation}"
        );
        assert!(
            !without_invalidation.contains("will try to invalidate"),
            "{without_invalidation}"
        );

        assert_eq!(
            unreadable_cache_message(&anyhow::anyhow!("some bug"), Some(base_path), true),
            None
        );
    }

    #[test]
    #[cfg_attr(target_family = "wasm", ignore = "no unwinding on wasm")]
    fn test_panic_on_read_error() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);

        let payload = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            storage.panic_on_read_error("Failed to restore", unreadable_error())
        }))
        .expect_err("must panic");
        let panic = payload
            .downcast_ref::<PersistentCacheUnreadablePanic>()
            .expect("the payload must be a PersistentCacheUnreadablePanic");
        assert!(panic.message.contains("00000007.sst"), "{}", panic.message);

        // Other errors panic as before. (Without the error's backtrace, which is included if
        // `RUST_BACKTRACE` is set.)
        let payload = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            storage.panic_on_read_error("Failed to restore", anyhow::anyhow!("some bug"))
        }))
        .expect_err("must panic");
        let message = payload
            .downcast_ref::<String>()
            .expect("the payload must be a String");
        let message = message
            .split("\n\nStack backtrace:")
            .next()
            .unwrap_or_default();
        assert_eq!(message, "Failed to restore: some bug");
        Ok(())
    }
}
