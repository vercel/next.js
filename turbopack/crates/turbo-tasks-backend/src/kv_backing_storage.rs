use std::{
    borrow::Borrow,
    env,
    path::PathBuf,
    sync::{Arc, LazyLock, Mutex, PoisonError, Weak},
};

use anyhow::{Context, Result, ensure};
use bincode::{Decode, de::Decoder, error::DecodeError};
use rustc_hash::FxHashMap;
use smallvec::SmallVec;
use turbo_bincode::{
    TurboBincodeBuffer, new_turbo_bincode_decoder, turbo_bincode_decode, turbo_bincode_encode,
};
use turbo_persistence::CommitStats;
use turbo_tasks::{
    DynTaskInputs, RawVc, TaskId,
    macro_helpers::NativeFunction,
    panic_hooks::{PanicHookGuard, register_panic_hook},
    parallel,
};

use crate::{
    GitVersionInfo,
    backend::{AnyOperation, SpecificTaskDataCategory, TtlCounter, storage_schema::TaskStorage},
    backing_storage::{
        SnapshotItem, SnapshotMeta, TaskIdBucket, TaskTypeHash,
        compute_task_type_hash_from_components,
    },
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
    Operations = 0,
    NextFreeTaskId = 1,
    GcRoots = 2,
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

/// Bincode encodes the borrowed slice in the same format as a Vec, normally within 16 bytes.
fn encode_task_ids(task_ids: &[TaskId]) -> Result<TurboBincodeBuffer> {
    Ok(turbo_bincode_encode(&task_ids)?)
}

fn decode_task_ids(bytes: &[u8]) -> Result<TaskIdBucket> {
    let mut decoder = new_turbo_bincode_decoder(bytes);
    let len = u64::decode(&mut decoder)?;
    let len = usize::try_from(len).map_err(|_| DecodeError::OutsideUsizeRange(len))?;
    decoder.claim_container_read::<TaskId>(len)?;
    let mut task_ids = TaskIdBucket::with_capacity(len);
    for _ in 0..len {
        decoder.unclaim_bytes_read(size_of::<TaskId>());
        task_ids.push(TaskId::decode(&mut decoder)?);
    }
    ensure!(
        decoder.reader().buffer.is_empty(),
        "trailing bytes in TaskCache bucket"
    );
    ensure!(!task_ids.is_empty(), "empty TaskCache bucket");
    Ok(task_ids)
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
/// Wraps a low-level [`TurboKeyValueDatabase`] and adapts it into the persistence operations the
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

    pub(crate) fn next_free_task_id(&self) -> Result<TaskId> {
        Ok(self
            .inner
            .get_infra_u32(InfraKey::NextFreeTaskId)
            .context("Unable to read next free task id from database")?
            .map_or(Ok(TaskId::MIN), TaskId::try_from)?)
    }

    pub(crate) fn uncompleted_operations(&self) -> Result<Vec<AnyOperation>> {
        fn get(database: &TurboKeyValueDatabase) -> Result<Vec<AnyOperation>> {
            let Some(operations) =
                database.get(KeySpace::Infra, InfraKey::Operations.key().as_ref())?
            else {
                return Ok(Vec::new());
            };
            let operations = turbo_bincode_decode(operations.borrow())?;
            Ok(operations)
        }
        get(&self.inner.database).context("Unable to read uncompleted operations from database")
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
        operations: Vec<Arc<AnyOperation>>,
        roots: Option<Vec<(TaskId, TtlCounter)>>,
        snapshots: Vec<I>,
        task_cache_bucket: impl Fn(TaskTypeHash) -> TaskIdBucket + Sync,
    ) -> Result<SnapshotMeta>
    where
        I: IntoIterator<Item = SnapshotItem> + Send + Sync,
    {
        let _span = tracing::info_span!("save snapshot", operations = operations.len()).entered();
        let batch = self.inner.database.write_batch()?;

        {
            let span = tracing::trace_span!("update task data");
            let shard_results =
                parallel::map_collect_owned::<_, _, Result<Vec<_>>>(snapshots, |shard: I| {
                    let _span = span.clone().entered();
                    let mut max_new_task_id = 0;
                    let mut data_items = 0;
                    let mut meta_items = 0;
                    let mut task_cache_changes =
                        FxHashMap::<TaskTypeHash, (TaskIdBucket, TaskIdBucket)>::default();
                    for item in shard {
                        match item {
                            SnapshotItem::Put {
                                task_id,
                                meta,
                                data,
                                task_type_hash,
                            } => {
                                let key = IntKey::new(*task_id);
                                let key = key.as_ref();
                                if let Some(meta) = meta {
                                    batch.put(
                                        KeySpace::TaskMeta,
                                        WriteBuffer::Borrowed(key),
                                        WriteBuffer::SmallVec(meta),
                                    )?;
                                    meta_items += 1;
                                }
                                if let Some(data) = data {
                                    batch.put(
                                        KeySpace::TaskData,
                                        WriteBuffer::Borrowed(key),
                                        WriteBuffer::SmallVec(data),
                                    )?;
                                    data_items += 1;
                                }
                                if let Some(task_type_hash) = task_type_hash {
                                    let (added_ids, _) =
                                        task_cache_changes.entry(task_type_hash).or_default();
                                    if !added_ids.contains(&task_id) {
                                        added_ids.push(task_id);
                                    }
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
                                let (_, deleted_ids) =
                                    task_cache_changes.entry(task_type_hash).or_default();
                                if !deleted_ids.contains(&task_id) {
                                    deleted_ids.push(task_id);
                                }
                            }
                        }
                    }
                    Ok((
                        SnapshotMeta {
                            data_items,
                            meta_items,
                            // TaskCache operations are coalesced across all shards below.
                            task_cache_items: 0,
                            // The on-disk byte totals aren't known until the batch is committed
                            // below; they're filled in from `CommitStats` after `batch.commit()`.
                            bytes_written: 0,
                            bytes_deleted: 0,
                            max_next_task_id: max_new_task_id,
                        },
                        task_cache_changes,
                    ))
                })?;

            // Merge shard-local intents rather than replacing whole buckets: colliding tasks can
            // live in different task-ID shards, so their additions and deletions must coexist.
            let (mut snapshot_meta, task_cache_changes) = shard_results
                .into_iter()
                .reduce(|(meta, mut changes), (other_meta, other_changes)| {
                    for (hash, (added_ids, deleted_ids)) in other_changes {
                        let combined = changes.entry(hash).or_default();
                        for task_id in added_ids {
                            if !combined.0.contains(&task_id) {
                                combined.0.push(task_id);
                            }
                        }
                        for task_id in deleted_ids {
                            if !combined.1.contains(&task_id) {
                                combined.1.push(task_id);
                            }
                        }
                    }
                    (meta.merge(other_meta), changes)
                })
                .unwrap_or_default();
            snapshot_meta.task_cache_items = task_cache_changes.len();

            let span = tracing::trace_span!("flush task data");
            parallel::try_for_each(&[KeySpace::TaskMeta, KeySpace::TaskData], |&key_space| {
                let _span = span.clone().entered();
                // Safety: `map_collect_owned` has returned, so no concurrent `put` or `delete`
                // on these key spaces are in-flight.
                unsafe { batch.flush(key_space) }
            })?;

            {
                let _span = tracing::trace_span!(
                    "reconcile task cache",
                    changed_buckets = task_cache_changes.len()
                )
                .entered();
                for (hash, (added_ids, deleted_ids)) in &task_cache_changes {
                    let mut task_ids = task_cache_bucket(*hash);
                    for task_id in added_ids {
                        if !task_ids.contains(task_id) {
                            task_ids.push(*task_id);
                        }
                    }
                    task_ids.retain(|task_id| !deleted_ids.contains(task_id));
                    if task_ids.is_empty() {
                        batch.delete(KeySpace::TaskCache, WriteBuffer::Borrowed(hash))?;
                    } else {
                        batch.put(
                            KeySpace::TaskCache,
                            WriteBuffer::Borrowed(hash),
                            WriteBuffer::SmallVec(encode_task_ids(&task_ids)?),
                        )?;
                    }
                }
            }

            let mut next_task_id = get_next_free_task_id(&batch)?;
            next_task_id = next_task_id.max(snapshot_meta.max_next_task_id + 1);
            save_infra(&batch, next_task_id, operations, roots)?;

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
    ) -> Result<(TaskTypeHash, TaskIdBucket)> {
        let inner = &*self.inner;
        let hash = compute_task_type_hash_from_components(native_fn, this, arg);
        if inner.database.is_empty() {
            return Ok((hash, SmallVec::new()));
        }
        let Some(buffer) = inner
            .database
            .get(KeySpace::TaskCache, &hash)
            .with_context(|| {
                format!("Looking up task id for {native_fn:?}(this={this:?}) from database failed")
            })?
        else {
            return Ok((hash, SmallVec::new()));
        };

        Ok((hash, decode_task_ids(Borrow::<[u8]>::borrow(&buffer))?))
    }

    /// Reads the stored `category` for `task_id`.
    ///
    /// `None` means the database had no key for it. That is distinct from `Some` of an empty
    /// [`TaskStorage`] (a key that decoded to nothing), which is what lets a `MustExist` open tell
    /// "absent everywhere" from "present but empty".
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

    pub(crate) fn batch_lookup_data(
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

    pub(crate) fn compact(&self) -> Result<Option<CommitStats>> {
        self.inner.database.compact()
    }

    pub(crate) fn shutdown(&self) -> Result<()> {
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
    operations: Vec<Arc<AnyOperation>>,
    roots: Option<Vec<(TaskId, TtlCounter)>>,
) -> Result<(), anyhow::Error> {
    batch
        .put(
            KeySpace::Infra,
            WriteBuffer::Borrowed(InfraKey::NextFreeTaskId.key().as_ref()),
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
                WriteBuffer::Borrowed(InfraKey::Operations.key().as_ref()),
                WriteBuffer::SmallVec(operations),
            )
            .context("Unable to write operations")?;
    }
    if let Some(roots) = roots {
        let _span = tracing::trace_span!("update roots", roots = roots.len()).entered();
        let roots = turbo_bincode_encode(&roots).context("Unable to serialize GC roots")?;
        batch
            .put(
                KeySpace::Infra,
                WriteBuffer::Borrowed(InfraKey::GcRoots.key().as_ref()),
                WriteBuffer::SmallVec(roots),
            )
            .context("Unable to write GC roots")?;
    }
    // Safety: save_infra is called after all concurrent writes to Infra are done.
    unsafe { batch.flush(KeySpace::Infra)? };
    Ok(())
}

#[cfg(test)]
mod tests {
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
        task_ids: &[TaskId],
    ) -> Result<()> {
        let batch = db.write_batch()?;
        batch.put(
            KeySpace::TaskCache,
            WriteBuffer::Borrowed(&hash.to_le_bytes()),
            WriteBuffer::SmallVec(encode_task_ids(task_ids)?),
        )?;
        batch.commit()?;
        Ok(())
    }

    /// Reads the TaskIds stored under `hash` in `TaskCache`, sorted for stable comparison.
    fn task_cache_ids(db: &TurboKeyValueDatabase, hash: u64) -> Result<Vec<TaskId>> {
        let mut ids = db
            .get(KeySpace::TaskCache, &hash.to_le_bytes())?
            .map(|bytes| decode_task_ids(&bytes))
            .transpose()?
            .unwrap_or_default()
            .into_vec();
        ids.sort_by_key(|id| **id);
        Ok(ids)
    }

    #[test]
    fn small_task_id_buckets_decode_inline() -> Result<()> {
        let task_ids = (1..=4)
            .map(|id| TaskId::try_from(id).unwrap())
            .collect::<Vec<_>>();
        for len in 1..=3 {
            let decoded = decode_task_ids(&encode_task_ids(&task_ids[..len])?)?;
            assert_eq!(decoded.as_slice(), &task_ids[..len]);
            assert!(!decoded.spilled(), "{len}-id buckets must not allocate");
        }
        let decoded = decode_task_ids(&encode_task_ids(&task_ids)?)?;
        assert!(
            decoded.spilled(),
            "a fourth id should exceed inline capacity"
        );
        Ok(())
    }

    /// Tests that one list-valued TaskCache entry returns every candidate for a colliding hash.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "WASI test host cannot run disk-backed persistence"
    )]
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

        write_task_cache_entry(&db, collision_hash, &[task_id_1, task_id_2, task_id_3])?;
        assert_eq!(
            task_cache_ids(&db, collision_hash)?,
            vec![task_id_1, task_id_2, task_id_3],
            "Should return all 3 task IDs for the colliding hash"
        );

        db.shutdown()?;
        Ok(())
    }

    #[cfg_attr(
        target_os = "wasi",
        ignore = "WASI test host cannot run disk-backed persistence"
    )]
    #[tokio::test(flavor = "multi_thread")]
    async fn snapshot_coalesces_colliding_task_cache_puts() -> Result<()> {
        let tempdir = tempfile::tempdir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);
        let collision_hash = 0xDEADBEEFu64.to_le_bytes();
        let task_id_1 = TaskId::try_from(100u32).unwrap();
        let task_id_2 = TaskId::try_from(200u32).unwrap();
        let bucket = smallvec::smallvec![task_id_1, task_id_2];

        storage.save_snapshot(
            Vec::new(),
            None,
            vec![vec![
                SnapshotItem::Put {
                    task_id: task_id_1,
                    meta: None,
                    data: None,
                    task_type_hash: Some(collision_hash),
                },
                SnapshotItem::Put {
                    task_id: task_id_2,
                    meta: None,
                    data: None,
                    task_type_hash: Some(collision_hash),
                },
            ]],
            |_| bucket.clone(),
        )?;

        assert_eq!(
            task_cache_ids(&storage.inner.database, u64::from_le_bytes(collision_hash))?,
            vec![task_id_1, task_id_2]
        );
        storage.inner.database.shutdown()?;
        Ok(())
    }

    #[cfg_attr(
        target_os = "wasi",
        ignore = "WASI test host cannot run disk-backed persistence"
    )]
    #[tokio::test(flavor = "multi_thread")]
    async fn snapshot_merges_colliding_put_and_delete_across_shards() -> Result<()> {
        let tempdir = tempfile::tempdir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let hash = 0xC0111DEu64;
        let deleted = TaskId::try_from(100u32).unwrap();
        let survivor = TaskId::try_from(200u32).unwrap();
        let created = TaskId::try_from(300u32).unwrap();
        write_task_cache_entry(&db, hash, &[deleted, survivor])?;
        let storage = TurboBackingStorage::new_in_memory(db);

        // These items live in separate task-ID shards and must merge into one final write.
        storage.save_snapshot(
            Vec::new(),
            None,
            vec![
                vec![SnapshotItem::Put {
                    task_id: created,
                    meta: None,
                    data: None,
                    task_type_hash: Some(hash.to_le_bytes()),
                }],
                vec![SnapshotItem::Delete {
                    task_id: deleted,
                    task_type_hash: hash.to_le_bytes(),
                }],
            ],
            // Match canary's in-memory lifecycle: deletion has not evicted the stale ID yet.
            |_| smallvec::smallvec![deleted, survivor, created],
        )?;
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash)?,
            vec![survivor, created]
        );
        storage.inner.database.shutdown()?;
        Ok(())
    }

    /// Tests that multiple distinct keys written in a single batch with flush can be read back.
    /// This mirrors the actual save_snapshot pattern: write many TaskCache entries, flush, commit.
    // This test is too slow to run under Miri.
    #[cfg(not(miri))]
    #[cfg_attr(
        target_os = "wasi",
        ignore = "WASI test host cannot run disk-backed persistence"
    )]
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
                    WriteBuffer::SmallVec(encode_task_ids(&[*task_id])?),
                )?;
            }
            // Flush this standalone test batch before committing it.
            unsafe { batch.flush(KeySpace::TaskCache) }?;
            batch.commit()?;

            db.shutdown()?;
        }

        // Reopen and verify all entries are readable
        {
            let db = TurboKeyValueDatabase::new(path.to_path_buf(), TEST_STORAGE_OPTIONS)?;
            let mut found = 0;
            let mut missing = 0;
            for (hash, expected_id) in hashes.iter().zip(task_ids.iter()) {
                let result = db.get(KeySpace::TaskCache, &hash.to_le_bytes())?;
                if let Some(bytes) = result {
                    found += 1;
                    assert_eq!(
                        decode_task_ids(&bytes)?.as_slice(),
                        &[*expected_id],
                        "Task ID mismatch for hash {hash:#x}"
                    );
                } else {
                    missing += 1;
                }
            }
            assert_eq!(missing, 0, "Found {found}/{n} entries, missing {missing}");
            db.shutdown()?;
        }

        Ok(())
    }

    /// `save_snapshot` delete path: a `Delete` item must erase the task's `TaskMeta` and
    /// `TaskData` entries and rewrite its list-valued `TaskCache` bucket with the survivors.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "WASI test host cannot run disk-backed persistence"
    )]
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
        write_task_cache_entry(&db, collision_hash, &[deleted_id, survivor_id])?;
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
            Vec::new(),
            None,
            vec![vec![SnapshotItem::Delete {
                task_id: deleted_id,
                task_type_hash: collision_hash.to_le_bytes(),
            }]],
            |_| smallvec::smallvec![survivor_id],
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
            "save_snapshot should rewrite the bucket with only its survivor"
        );

        storage.save_snapshot(
            Vec::new(),
            None,
            vec![vec![SnapshotItem::Delete {
                task_id: survivor_id,
                task_type_hash: collision_hash.to_le_bytes(),
            }]],
            |_| SmallVec::new(),
        )?;
        assert!(
            db.get(KeySpace::TaskCache, &collision_hash.to_le_bytes())?
                .is_none(),
            "deleting the last bucket member should tombstone the whole key"
        );

        db.shutdown()?;
        Ok(())
    }
}
