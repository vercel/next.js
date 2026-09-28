#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};
use std::{
    borrow::Borrow,
    env,
    mem::size_of,
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
        SnapshotItem, SnapshotMeta, TaskTypeHash, compute_task_type_hash_from_components,
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

/// One encoded value per TaskCache hash, with most buckets fitting inline.
type TaskIdBucket = SmallVec<[TaskId; 3]>;

/// Encode a borrowed slice as a bincode list of TaskIds.
fn encode_task_ids(task_ids: &[TaskId]) -> Result<TurboBincodeBuffer> {
    Ok(turbo_bincode_encode(&task_ids)?)
}

fn decode_task_ids(bytes: &[u8]) -> Result<TaskIdBucket> {
    let mut decoder = new_turbo_bincode_decoder(bytes);
    let len = u64::decode(&mut decoder)?;
    let len = usize::try_from(len).map_err(|_| DecodeError::OutsideUsizeRange(len))?;
    decoder.claim_container_read::<TaskId>(len)?;
    let mut ids = TaskIdBucket::with_capacity(len);
    for _ in 0..len {
        decoder.unclaim_bytes_read(size_of::<TaskId>());
        ids.push(TaskId::decode(&mut decoder)?);
    }
    ensure!(
        decoder.reader().buffer.is_empty(),
        "trailing bytes in TaskCache bucket"
    );
    ensure!(!ids.is_empty(), "empty TaskCache bucket");
    Ok(ids)
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
    #[cfg(test)]
    task_cache_batch_requests: AtomicUsize,
    #[cfg(test)]
    task_cache_batch_keys: AtomicUsize,
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
                #[cfg(test)]
                task_cache_batch_requests: AtomicUsize::new(0),
                #[cfg(test)]
                task_cache_batch_keys: AtomicUsize::new(0),
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
                    #[cfg(test)]
                    task_cache_batch_requests: AtomicUsize::new(0),
                    #[cfg(test)]
                    task_cache_batch_keys: AtomicUsize::new(0),
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
                                // Register the task type only for new or resurrected tasks.
                                if let Some(task_type_hash) = task_type_hash {
                                    let (added, _) =
                                        task_cache_changes.entry(task_type_hash).or_default();
                                    if !added.contains(&task_id) {
                                        added.push(task_id);
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
                                let (_, removed) =
                                    task_cache_changes.entry(task_type_hash).or_default();
                                if !removed.contains(&task_id) {
                                    removed.push(task_id);
                                }
                            }
                        }
                    }
                    Ok((
                        SnapshotMeta {
                            data_items,
                            meta_items,
                            task_cache_items: 0,
                            // Filled in from CommitStats after batch.commit().
                            bytes_written: 0,
                            bytes_deleted: 0,
                            max_next_task_id: max_new_task_id,
                        },
                        task_cache_changes,
                    ))
                })?;

            // Shards are partitioned by TaskId, not by hash: merge *intents* so colliding
            // additions/deletions from different shards cannot overwrite each other.
            let (mut snapshot_meta, task_cache_changes) = shard_results
                .into_iter()
                .reduce(|(meta, mut changes), (other_meta, other_changes)| {
                    for (hash, (added, removed)) in other_changes {
                        let combined = changes.entry(hash).or_default();
                        for id in added {
                            if !combined.0.contains(&id) {
                                combined.0.push(id);
                            }
                        }
                        for id in removed {
                            if !combined.1.contains(&id) {
                                combined.1.push(id);
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
                // No concurrent puts to these key spaces remain after map_collect_owned.
                unsafe { batch.flush(key_space) }
            })?;

            if !task_cache_changes.is_empty() {
                // Snapshot owns the only database write batch, so if the entire committed
                // database is empty no prior TaskCache bucket can exist. Skip batch_get's
                // hashing/sorting of keys on the first snapshot; later snapshots read again.
                let hashes: Vec<_> = task_cache_changes.keys().copied().collect();
                let was_empty = self.inner.database.is_empty();
                let old_values = if was_empty {
                    vec![None; hashes.len()]
                } else {
                    // The in-memory type map is not a complete hash bucket: a colliding type
                    // may be present only on disk. Batch-read all changed hashes together.
                    let keys: Vec<&[u8]> = hashes.iter().map(|hash| hash.as_slice()).collect();
                    #[cfg(test)]
                    self.inner
                        .task_cache_batch_requests
                        .fetch_add(1, Ordering::Relaxed);
                    #[cfg(test)]
                    self.inner
                        .task_cache_batch_keys
                        .fetch_add(keys.len(), Ordering::Relaxed);
                    self.inner.database.batch_get(KeySpace::TaskCache, &keys)?
                };
                let _span = tracing::trace_span!(
                    "reconcile task cache",
                    changed_hashes = hashes.len(),
                    batch_read_requests = usize::from(!was_empty),
                    batch_read_keys = if was_empty { 0 } else { hashes.len() },
                    batch_read_hits = old_values.iter().filter(|value| value.is_some()).count(),
                )
                .entered();
                for (hash, old_value) in hashes.into_iter().zip(old_values) {
                    let (added, removed) = &task_cache_changes[&hash];
                    let mut ids = old_value
                        .as_ref()
                        .map(|bytes| decode_task_ids(Borrow::<[u8]>::borrow(bytes)))
                        .transpose()?
                        .unwrap_or_default();
                    for id in added {
                        if !ids.contains(id) {
                            ids.push(*id);
                        }
                    }
                    ids.retain(|id| !removed.contains(id));
                    if ids.is_empty() {
                        batch.delete(KeySpace::TaskCache, WriteBuffer::Borrowed(&hash))?;
                    } else {
                        batch.put(
                            KeySpace::TaskCache,
                            WriteBuffer::Borrowed(&hash),
                            WriteBuffer::SmallVec(encode_task_ids(&ids)?),
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
    ) -> Result<TaskIdBucket> {
        let inner = &*self.inner;
        if inner.database.is_empty() {
            // Checking if the database is empty is a performance optimization
            // to avoid computing the hash.
            return Ok(SmallVec::new());
        }
        let hash = compute_task_type_hash_from_components(native_fn, this, arg);
        let Some(buffer) = inner
            .database
            .get(KeySpace::TaskCache, &hash)
            .with_context(|| {
                format!("Looking up task id for {native_fn:?}(this={this:?}) from database failed")
            })?
        else {
            return Ok(SmallVec::new());
        };
        decode_task_ids(Borrow::<[u8]>::borrow(&buffer))
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

    #[test]
    fn task_cache_is_single_value() {
        assert_eq!(
            KeySpace::TaskCache.family_config().kind,
            turbo_persistence::FamilyKind::SingleValue,
            "colliding task IDs must share one encoded TaskCache value",
        );
    }

    #[test]
    fn task_cache_bucket_codec_roundtrips_inline_and_spilled_lists() -> Result<()> {
        let ids: Vec<_> = (1..=4).map(|id| TaskId::try_from(id).unwrap()).collect();
        for len in 1..=4 {
            assert_eq!(
                decode_task_ids(&encode_task_ids(&ids[..len])?)?.as_slice(),
                &ids[..len]
            );
        }
        let mut invalid = encode_task_ids(&ids[..1])?.to_vec();
        invalid.push(0);
        assert!(
            decode_task_ids(&invalid).is_err(),
            "trailing bytes must be rejected"
        );
        assert!(
            decode_task_ids(&encode_task_ids(&[])?).is_err(),
            "empty buckets are invalid"
        );
        Ok(())
    }

    /// Helper to populate a single-value collision list using the concurrent batch API.
    fn write_task_cache_entry(
        db: &TurboKeyValueDatabase,
        hash: u64,
        task_id: TaskId,
    ) -> Result<()> {
        let mut ids = task_cache_ids(db, hash)?;
        if !ids.contains(&task_id) {
            ids.push(task_id);
        }
        let batch = db.write_batch()?;
        batch.put(
            KeySpace::TaskCache,
            WriteBuffer::Borrowed(&hash.to_le_bytes()),
            WriteBuffer::SmallVec(encode_task_ids(&ids)?),
        )?;
        batch.commit()?;
        Ok(())
    }

    /// Reads the TaskIds stored under `hash` in `TaskCache`, sorted for stable comparison.
    fn task_cache_ids(db: &TurboKeyValueDatabase, hash: u64) -> Result<Vec<TaskId>> {
        let mut ids: Vec<TaskId> = db
            .get(KeySpace::TaskCache, &hash.to_le_bytes())?
            .map(|bytes| decode_task_ids(Borrow::<[u8]>::borrow(&bytes)).map(|ids| ids.into_vec()))
            .transpose()?
            .unwrap_or_default();
        ids.sort_by_key(|id| **id);
        Ok(ids)
    }

    /// A single list-valued key recovers all colliding candidates after several commits.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
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

        // Each write merges the prior value into one list, not three values at the key.
        write_task_cache_entry(&db, collision_hash, task_id_1)?;
        write_task_cache_entry(&db, collision_hash, task_id_2)?;
        write_task_cache_entry(&db, collision_hash, task_id_3)?;

        // One `get` decodes all three candidates.
        assert_eq!(
            task_cache_ids(&db, collision_hash)?,
            vec![task_id_1, task_id_2, task_id_3],
            "Should return all 3 task IDs for the colliding hash"
        );

        db.shutdown()?;
        Ok(())
    }

    /// Tests that multiple distinct keys written in a single batch with flush can be read back.
    /// This mirrors the actual save_snapshot pattern: write many TaskCache entries, flush, commit.
    // This test is too slow to run under Miri.
    #[cfg(not(miri))]
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
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
            // Flush TaskCache (like the new code does)
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
                        decode_task_ids(Borrow::<[u8]>::borrow(&bytes))?.as_slice(),
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

    /// `save_snapshot` erases TaskMeta/TaskData for the deleted task and batch-reads the
    /// prior list-valued TaskCache bucket, preserving siblings not otherwise in memory.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
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
            Vec::new(),
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

        db.shutdown()?;
        Ok(())
    }

    /// Changed hashes are read in one batch even when their puts/deletes came from
    /// different task-ID shards. Repeated snapshots must not resurrect removed IDs.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
    )]
    #[tokio::test(flavor = "multi_thread")]
    async fn snapshot_batches_distinct_hashes_and_merges_collisions() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let hash_a = 0xCAFE_u64;
        let hash_b = 0xBEEF_u64;
        let deleted = TaskId::try_from(11u32).unwrap();
        let survivor = TaskId::try_from(12u32).unwrap();
        let added = TaskId::try_from(13u32).unwrap();
        let other_hash_id = TaskId::try_from(14u32).unwrap();
        write_task_cache_entry(&db, hash_a, deleted)?;
        write_task_cache_entry(&db, hash_a, survivor)?;
        let storage = TurboBackingStorage::new_in_memory(db);
        let put = |task_id, hash: u64| SnapshotItem::Put {
            task_id,
            meta: None,
            data: None,
            task_type_hash: Some(hash.to_le_bytes()),
        };
        let meta = storage.save_snapshot(
            Vec::new(),
            None,
            vec![
                vec![put(added, hash_a)],
                vec![SnapshotItem::Delete {
                    task_id: deleted,
                    task_type_hash: hash_a.to_le_bytes(),
                }],
                vec![put(other_hash_id, hash_b)],
            ],
        )?;
        assert_eq!(meta.task_cache_items, 2);
        assert_eq!(
            storage.inner.task_cache_batch_keys.load(Ordering::Relaxed),
            2
        );
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            1
        );
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash_a)?,
            vec![survivor, added]
        );
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash_b)?,
            vec![other_hash_id]
        );

        storage.save_snapshot(Vec::new(), None, vec![vec![put(added, hash_a)]])?;
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            2
        );
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash_a)?,
            vec![survivor, added]
        );
        storage.save_snapshot(
            Vec::new(),
            None,
            vec![vec![SnapshotItem::Delete {
                task_id: added,
                task_type_hash: hash_a.to_le_bytes(),
            }]],
        )?;
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash_a)?,
            vec![survivor]
        );

        storage.save_snapshot(
            Vec::new(),
            None,
            vec![vec![SnapshotItem::Delete {
                task_id: survivor,
                task_type_hash: hash_a.to_le_bytes(),
            }]],
        )?;
        assert!(
            storage
                .inner
                .database
                .get(KeySpace::TaskCache, &hash_a.to_le_bytes())?
                .is_none()
        );
        // A direct-by-ID resurrection reuses the old ID and recreates the list.
        storage.save_snapshot(Vec::new(), None, vec![vec![put(deleted, hash_a)]])?;
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash_a)?,
            vec![deleted]
        );

        storage.save_snapshot(Vec::new(), None, Vec::<Vec<SnapshotItem>>::new())?;
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            5
        );
        storage.inner.database.shutdown()?;
        Ok(())
    }

    /// Two creations on different TaskId shards must publish one list, not two
    /// competing writes under the same stable hash.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
    )]
    #[tokio::test(flavor = "multi_thread")]
    async fn snapshot_coalesces_two_new_colliding_puts() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);
        assert!(storage.inner.database.is_empty());
        let hash = 0xABCDEF_u64;
        let first = TaskId::try_from(5u32).unwrap();
        let second = TaskId::try_from(67u32).unwrap();
        let put = |id| SnapshotItem::Put {
            task_id: id,
            meta: None,
            data: None,
            task_type_hash: Some(hash.to_le_bytes()),
        };
        let meta =
            storage.save_snapshot(Vec::new(), None, vec![vec![put(first)], vec![put(second)]])?;
        assert_eq!(meta.task_cache_items, 1);
        assert_eq!(
            storage.inner.task_cache_batch_keys.load(Ordering::Relaxed),
            0
        );
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            0
        );
        assert!(!storage.inner.database.is_empty());
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash)?,
            vec![first, second]
        );
        storage.inner.database.shutdown()?;
        Ok(())
    }

    /// A type can miss the disk key before another task's snapshot commits it.
    /// Its later snapshot must read the *current* bucket rather than trusting the miss.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
    )]
    #[tokio::test(flavor = "multi_thread")]
    async fn snapshot_merges_a_precommit_miss_with_a_later_commit() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);
        let hash = 0xBADC0DE_u64;
        let first = TaskId::try_from(55u32).unwrap();
        let second = TaskId::try_from(66u32).unwrap();
        assert!(
            storage
                .inner
                .database
                .get(KeySpace::TaskCache, &hash.to_le_bytes())?
                .is_none()
        ); // B's original pre-commit observation.
        let put = |task_id| SnapshotItem::Put {
            task_id,
            meta: None,
            data: None,
            task_type_hash: Some(hash.to_le_bytes()),
        };
        storage.save_snapshot(Vec::new(), None, vec![vec![put(first)]])?;
        storage.save_snapshot(Vec::new(), None, vec![vec![put(second)]])?;
        assert_eq!(
            task_cache_ids(&storage.inner.database, hash)?,
            vec![first, second]
        );
        assert_eq!(
            storage.inner.task_cache_batch_keys.load(Ordering::Relaxed),
            1
        );
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            1
        );
        storage.inner.database.shutdown()?;
        Ok(())
    }

    /// A fresh database skips hashing/sorting a large batch of absent disk keys, while
    /// the next snapshot observes the first commit and preserves its collision sibling.
    #[cfg_attr(
        target_os = "wasi",
        ignore = "filesystem-backed TaskCache test needs native host"
    )]
    #[tokio::test(flavor = "multi_thread")]
    async fn fresh_database_skips_batch_get_for_many_hashes() -> Result<()> {
        let tempdir = test_temp_dir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);
        assert!(storage.inner.database.is_empty());
        let put = |raw_id, hash: u64| SnapshotItem::Put {
            task_id: TaskId::try_from(raw_id).unwrap(),
            meta: None,
            data: None,
            task_type_hash: Some(hash.to_le_bytes()),
        };
        let items: Vec<_> = (1..=64).map(|id| put(id, id as u64 + 0x1000)).collect();
        let meta = storage.save_snapshot(Vec::new(), None, vec![items])?;
        assert_eq!(meta.task_cache_items, 64);
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            0
        );
        assert_eq!(
            storage.inner.task_cache_batch_keys.load(Ordering::Relaxed),
            0
        );
        assert!(!storage.inner.database.is_empty());
        assert_eq!(
            task_cache_ids(&storage.inner.database, 0x1001)?,
            vec![TaskId::try_from(1)?]
        );

        storage.save_snapshot(Vec::new(), None, vec![vec![put(65, 0x1001)]])?;
        assert_eq!(
            storage
                .inner
                .task_cache_batch_requests
                .load(Ordering::Relaxed),
            1
        );
        assert_eq!(
            storage.inner.task_cache_batch_keys.load(Ordering::Relaxed),
            1
        );
        assert_eq!(
            task_cache_ids(&storage.inner.database, 0x1001)?,
            vec![TaskId::try_from(1)?, TaskId::try_from(65)?],
        );
        storage.inner.database.shutdown()?;
        Ok(())
    }
}
