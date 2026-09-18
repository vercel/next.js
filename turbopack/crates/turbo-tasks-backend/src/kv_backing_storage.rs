use std::{
    any::Any,
    borrow::Borrow,
    collections::{BTreeMap, HashMap, HashSet},
    env,
    path::PathBuf,
    sync::{Arc, LazyLock, Mutex, PoisonError, Weak},
};

use anyhow::{Context, Result};
use bincode::error::DecodeError;
use smallvec::SmallVec;
use turbo_bincode::{
    InternedStringKey, InternedStringResolver, new_turbo_bincode_decoder_with_interned_strings,
    turbo_bincode_decode, turbo_bincode_encode,
};
use turbo_persistence::CommitStats;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    DynTaskInputs, RawVc, TaskId,
    macro_helpers::NativeFunction,
    panic_hooks::{PanicHookGuard, register_panic_hook},
    parallel,
};
use turbo_tasks_hash::hash_xxh3_hash128;

use crate::{
    GitVersionInfo,
    backend::{AnyOperation, SpecificTaskDataCategory, TtlCounter, storage_schema::TaskStorage},
    backing_storage::{
        EncodedTaskData, InternedStrings, SnapshotItem, SnapshotMeta,
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

const INTERNED_STRING_KEY_LEN: usize = 26;
const INTERNED_STRING_COUNT_LEN: usize = size_of::<u64>();

fn interned_string_key_bytes(key: InternedStringKey) -> [u8; INTERNED_STRING_KEY_LEN] {
    let mut bytes = [0; INTERNED_STRING_KEY_LEN];
    bytes[..10].copy_from_slice(&key.namespace);
    bytes[10..].copy_from_slice(&key.hash);
    bytes
}

fn decode_interned_string_key(bytes: &[u8]) -> Result<InternedStringKey> {
    if bytes.len() != INTERNED_STRING_KEY_LEN {
        anyhow::bail!(
            "invalid interned string key length {}, expected {INTERNED_STRING_KEY_LEN}",
            bytes.len()
        );
    }
    Ok(InternedStringKey {
        namespace: bytes[..10].try_into().unwrap(),
        hash: bytes[10..].try_into().unwrap(),
    })
}

fn encode_path_references(references: &[InternedStringKey]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(references.len() * INTERNED_STRING_KEY_LEN);
    for &reference in references {
        bytes.extend_from_slice(&interned_string_key_bytes(reference));
    }
    bytes
}

fn decode_path_references(bytes: &[u8]) -> Result<Vec<InternedStringKey>> {
    if !bytes.len().is_multiple_of(INTERNED_STRING_KEY_LEN) {
        anyhow::bail!("invalid persisted FileSystemPath reference metadata length");
    }
    bytes
        .as_chunks::<INTERNED_STRING_KEY_LEN>()
        .0
        .iter()
        .map(|bytes| decode_interned_string_key(bytes))
        .collect()
}

fn encode_dictionary_value(count: u64, value: &str) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(INTERNED_STRING_COUNT_LEN + value.len());
    bytes.extend_from_slice(&count.to_le_bytes());
    bytes.extend_from_slice(value.as_bytes());
    bytes
}

fn decode_dictionary_value(bytes: &[u8]) -> Result<(u64, &str)> {
    let (count, value) = bytes
        .split_at_checked(INTERNED_STRING_COUNT_LEN)
        .context("persisted FileSystemPath dictionary value is truncated")?;
    let count = u64::from_le_bytes(count.try_into().unwrap());
    if count == 0 {
        anyhow::bail!("persisted FileSystemPath dictionary value has a zero reference count");
    }
    Ok((count, std::str::from_utf8(value)?))
}

fn path_reference_key_space(category: SpecificTaskDataCategory) -> KeySpace {
    match category {
        SpecificTaskDataCategory::Meta => KeySpace::TaskMetaPathRefs,
        SpecificTaskDataCategory::Data => KeySpace::TaskDataPathRefs,
    }
}

struct PathReferenceDelta {
    key: InternedStringKey,
    delta: i64,
    value: Option<RcStr>,
}

fn update_path_references(
    database: &TurboKeyValueDatabase,
    batch: &TurboWriteBatch<'_>,
    task_id: TaskId,
    category: SpecificTaskDataCategory,
    new_strings: Option<InternedStrings>,
) -> Result<Vec<PathReferenceDelta>> {
    let key = IntKey::new(*task_id);
    let key_space = path_reference_key_space(category);
    let mut old_references = match database.get(key_space, key.as_ref())? {
        Some(bytes) => decode_path_references(bytes.borrow())?,
        None => Vec::new(),
    };
    old_references.sort_unstable();
    old_references.dedup();

    let mut new_entries = BTreeMap::new();
    if let Some(new_strings) = new_strings {
        for (key, value) in new_strings.into_entries() {
            if let Some(existing) = new_entries.insert(key, value.clone())
                && existing != value
            {
                anyhow::bail!("interned string identity collision for {key:?}");
            }
        }
    }
    let new_references: Vec<_> = new_entries.keys().copied().collect();

    if new_references.is_empty() {
        if !old_references.is_empty() {
            batch.delete(key_space, WriteBuffer::Borrowed(key.as_ref()))?;
        }
    } else if new_references != old_references {
        batch.put(
            key_space,
            WriteBuffer::Borrowed(key.as_ref()),
            WriteBuffer::Vec(encode_path_references(&new_references)),
        )?;
    }

    let mut deltas = Vec::new();
    for &reference in &old_references {
        if !new_entries.contains_key(&reference) {
            deltas.push(PathReferenceDelta {
                key: reference,
                delta: -1,
                value: None,
            });
        }
    }
    for (reference, value) in new_entries {
        deltas.push(PathReferenceDelta {
            key: reference,
            delta: i64::from(old_references.binary_search(&reference).is_err()),
            // Keep the value even when membership is unchanged so an existing dictionary entry is
            // checked for a content-hash collision on every rewritten record.
            value: Some(value),
        });
    }
    Ok(deltas)
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
    /// Serializes the read/modify/write transaction used for dictionary reference counts.
    snapshot_lock: Mutex<()>,
    /// Lazily resolved path strings. Values are removed when their durable reference count reaches
    /// zero; clones returned to decoded values continue to own the allocation normally.
    file_system_paths: Mutex<HashMap<InternedStringKey, RcStr>>,
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
                snapshot_lock: Mutex::new(()),
                file_system_paths: Mutex::new(HashMap::new()),
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
                    snapshot_lock: Mutex::new(()),
                    file_system_paths: Mutex::new(HashMap::new()),
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

    fn apply_path_reference_deltas(
        &self,
        batch: &TurboWriteBatch<'_>,
        deltas: Vec<PathReferenceDelta>,
    ) -> Result<Vec<InternedStringKey>> {
        let mut aggregated: BTreeMap<InternedStringKey, (i64, Option<RcStr>)> = BTreeMap::new();
        for PathReferenceDelta { key, delta, value } in deltas {
            let entry = aggregated.entry(key).or_default();
            entry.0 += delta;
            if let Some(value) = value {
                if let Some(existing) = &entry.1
                    && existing != &value
                {
                    anyhow::bail!("interned string identity collision for {key:?}");
                }
                entry.1 = Some(value);
            }
        }

        let mut removed = Vec::new();
        for (key, (delta, supplied_value)) in aggregated {
            if delta == 0 && supplied_value.is_none() {
                continue;
            }
            let key_bytes = interned_string_key_bytes(key);
            let current = self.database.get(KeySpace::FileSystemPath, &key_bytes)?;
            let (current_count, current_value) = match current.as_ref() {
                Some(bytes) => {
                    let (count, value) = decode_dictionary_value(bytes.borrow())?;
                    (count, Some(value.to_owned()))
                }
                None => (0, None),
            };

            if let Some(current_value) = current_value.as_deref()
                && hash_xxh3_hash128(current_value.as_bytes()).to_le_bytes() != key.hash
            {
                anyhow::bail!("persisted FileSystemPath dictionary digest mismatch for {key:?}");
            }
            if let Some(value) = supplied_value.as_ref() {
                if hash_xxh3_hash128(value.as_bytes()).to_le_bytes() != key.hash {
                    anyhow::bail!("invalid content digest for interned string {key:?}");
                }
                if let Some(current_value) = current_value.as_deref()
                    && current_value != value.as_str()
                {
                    anyhow::bail!("interned string identity collision for {key:?}");
                }
            }

            if delta == 0 {
                if current_value.is_none() {
                    anyhow::bail!("existing FileSystemPath reference has no dictionary value");
                }
                continue;
            }

            let new_count = i128::from(current_count) + i128::from(delta);
            if new_count < 0 {
                anyhow::bail!("FileSystemPath reference count underflow for {key:?}");
            }
            if new_count == 0 {
                batch.delete(KeySpace::FileSystemPath, WriteBuffer::Borrowed(&key_bytes))?;
                removed.push(key);
                continue;
            }
            let new_count =
                u64::try_from(new_count).context("FileSystemPath reference count overflow")?;
            let value = supplied_value
                .as_ref()
                .map(RcStr::as_str)
                .or(current_value.as_deref())
                .context("new FileSystemPath dictionary reference has no string value")?;
            batch.put(
                KeySpace::FileSystemPath,
                WriteBuffer::Borrowed(&key_bytes),
                WriteBuffer::Vec(encode_dictionary_value(new_count, value)),
            )?;
        }
        Ok(removed)
    }
}

impl InternedStringResolver for TurboBackingStorageInner {
    fn resolve(
        &self,
        key: InternedStringKey,
        receiver: &mut dyn FnMut(&(dyn Any + Send + Sync)),
    ) -> Result<(), DecodeError> {
        // Keep this lock across the database read. Snapshot commits take the same lock while
        // removing zero-reference cache entries, preventing a concurrent lookup from resurrecting
        // an entry after its durable value has been deleted.
        let mut paths = self
            .file_system_paths
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if let std::collections::hash_map::Entry::Vacant(entry) = paths.entry(key) {
            let key_bytes = interned_string_key_bytes(key);
            let bytes = self
                .database
                .get(KeySpace::FileSystemPath, &key_bytes)
                .map_err(|err| DecodeError::OtherString(err.to_string()))?
                .ok_or_else(|| {
                    DecodeError::OtherString(format!(
                        "missing persisted FileSystemPath dictionary entry {key:?}"
                    ))
                })?;
            let (_, value) = decode_dictionary_value(bytes.borrow())
                .map_err(|err| DecodeError::OtherString(err.to_string()))?;
            if hash_xxh3_hash128(value.as_bytes()).to_le_bytes() != key.hash {
                return Err(DecodeError::OtherString(format!(
                    "persisted FileSystemPath dictionary digest mismatch for {key:?}"
                )));
            }
            entry.insert(RcStr::from(value));
        }
        receiver(paths.get(&key).unwrap());
        Ok(())
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
        let _snapshot_guard = self
            .inner
            .snapshot_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let batch = self.inner.database.write_batch()?;

        {
            let span = tracing::trace_span!("update task data");
            let seen_path_records = Mutex::new(HashSet::new());
            let snapshot_results =
                parallel::map_collect_owned::<_, _, Result<Vec<_>>>(snapshots, |shard: I| {
                    let _span = span.clone().entered();
                    let mut max_new_task_id = 0;
                    let mut data_items = 0;
                    let mut meta_items = 0;
                    let mut task_cache_items = 0;
                    let mut path_reference_deltas = Vec::new();
                    for item in shard {
                        match item {
                            SnapshotItem::Put {
                                task_id,
                                meta,
                                data,
                                task_type_hash,
                            } => {
                                let key = IntKey::new(*task_id);
                                if let Some(EncodedTaskData {
                                    bytes,
                                    interned_strings,
                                }) = meta
                                {
                                    if !seen_path_records
                                        .lock()
                                        .unwrap_or_else(PoisonError::into_inner)
                                        .insert((task_id, SpecificTaskDataCategory::Meta))
                                    {
                                        anyhow::bail!(
                                            "duplicate meta snapshot record for {task_id}"
                                        );
                                    }
                                    path_reference_deltas.extend(update_path_references(
                                        &self.inner.database,
                                        &batch,
                                        task_id,
                                        SpecificTaskDataCategory::Meta,
                                        Some(interned_strings),
                                    )?);
                                    batch.put(
                                        KeySpace::TaskMeta,
                                        WriteBuffer::Borrowed(key.as_ref()),
                                        WriteBuffer::SmallVec(bytes),
                                    )?;
                                    meta_items += 1;
                                }
                                if let Some(EncodedTaskData {
                                    bytes,
                                    interned_strings,
                                }) = data
                                {
                                    if !seen_path_records
                                        .lock()
                                        .unwrap_or_else(PoisonError::into_inner)
                                        .insert((task_id, SpecificTaskDataCategory::Data))
                                    {
                                        anyhow::bail!(
                                            "duplicate data snapshot record for {task_id}"
                                        );
                                    }
                                    path_reference_deltas.extend(update_path_references(
                                        &self.inner.database,
                                        &batch,
                                        task_id,
                                        SpecificTaskDataCategory::Data,
                                        Some(interned_strings),
                                    )?);
                                    batch.put(
                                        KeySpace::TaskData,
                                        WriteBuffer::Borrowed(key.as_ref()),
                                        WriteBuffer::SmallVec(bytes),
                                    )?;
                                    data_items += 1;
                                }
                                // Register the task type only for new tasks.
                                if let Some(task_type_hash) = task_type_hash {
                                    batch.put(
                                        KeySpace::TaskCache,
                                        WriteBuffer::Borrowed(&task_type_hash),
                                        WriteBuffer::Borrowed(key.as_ref()),
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
                                {
                                    let mut seen = seen_path_records
                                        .lock()
                                        .unwrap_or_else(PoisonError::into_inner);
                                    if !seen.insert((task_id, SpecificTaskDataCategory::Meta))
                                        || !seen.insert((task_id, SpecificTaskDataCategory::Data))
                                    {
                                        anyhow::bail!(
                                            "duplicate deleted snapshot record for {task_id}"
                                        );
                                    }
                                }
                                path_reference_deltas.extend(update_path_references(
                                    &self.inner.database,
                                    &batch,
                                    task_id,
                                    SpecificTaskDataCategory::Meta,
                                    None,
                                )?);
                                path_reference_deltas.extend(update_path_references(
                                    &self.inner.database,
                                    &batch,
                                    task_id,
                                    SpecificTaskDataCategory::Data,
                                    None,
                                )?);
                                batch.delete(
                                    KeySpace::TaskMeta,
                                    WriteBuffer::Borrowed(key.as_ref()),
                                )?;
                                batch.delete(
                                    KeySpace::TaskData,
                                    WriteBuffer::Borrowed(key.as_ref()),
                                )?;
                                // TaskCache is MultiValue, delete just this id from the bucket.
                                batch.delete_value(
                                    KeySpace::TaskCache,
                                    WriteBuffer::Borrowed(&task_type_hash[..]),
                                    WriteBuffer::Borrowed(key.as_ref()),
                                )?;
                            }
                        }
                    }
                    Ok((
                        SnapshotMeta {
                            data_items,
                            meta_items,
                            task_cache_items,
                            // The on-disk byte totals aren't known until the batch is committed
                            // below; they're filled in from `CommitStats` after `batch.commit()`.
                            bytes_written: 0,
                            bytes_deleted: 0,
                            max_next_task_id: max_new_task_id,
                        },
                        path_reference_deltas,
                    ))
                })?;
            let mut snapshot_meta = SnapshotMeta::default();
            let mut path_reference_deltas = Vec::new();
            for (meta, deltas) in snapshot_results {
                snapshot_meta = snapshot_meta.merge(meta);
                path_reference_deltas.extend(deltas);
            }
            let removed_paths = self
                .inner
                .apply_path_reference_deltas(&batch, path_reference_deltas)?;

            let span = tracing::trace_span!("flush task data");
            parallel::try_for_each(
                &[
                    KeySpace::TaskMeta,
                    KeySpace::TaskData,
                    KeySpace::TaskCache,
                    KeySpace::FileSystemPath,
                    KeySpace::TaskMetaPathRefs,
                    KeySpace::TaskDataPathRefs,
                ],
                |&key_space| {
                    let _span = span.clone().entered();
                    // Safety: `map_collect_owned` has returned, so no concurrent `put` or `delete`
                    // on these key spaces are in-flight.
                    unsafe { batch.flush(key_space) }
                },
            )?;

            let mut next_task_id = get_next_free_task_id(&batch)?;
            next_task_id = next_task_id.max(snapshot_meta.max_next_task_id + 1);

            save_infra(&batch, next_task_id, operations, roots)?;
            {
                let _span = tracing::trace_span!("commit").entered();
                // Byte totals are the physical on-disk bytes (post-compression, including .sst /
                // .blob / .meta files) produced and removed by the commit.
                // Hold the cache lock across commit + eviction. Resolvers hold the same lock while
                // reading the dictionary, so none can resurrect an entry removed by this commit.
                let mut file_system_paths = self
                    .inner
                    .file_system_paths
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner);
                let stats = batch.commit().context("Unable to commit snapshot")?;
                for key in removed_paths {
                    file_system_paths.remove(&key);
                }
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
        let mut decoder = new_turbo_bincode_decoder_with_interned_strings(bytes.borrow(), inner);
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
                    let mut decoder =
                        new_turbo_bincode_decoder_with_interned_strings(bytes.borrow(), inner);
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

    /// Tests that `get_multiple` correctly returns multiple TaskIds when the same hash key
    /// is used (simulating a hash collision scenario).
    ///
    /// This is a lower-level test that verifies the database layer correctly handles
    /// the case where multiple task IDs are stored under the same hash key.
    #[tokio::test(flavor = "multi_thread")]
    async fn test_hash_collision_returns_multiple_candidates() -> Result<()> {
        let tempdir = tempfile::tempdir()?;
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

            db.shutdown()?;
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
            db.shutdown()?;
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
        let tempdir = tempfile::tempdir()?;
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

    fn encoded_path_record(
        namespace: [u8; 10],
        value: &str,
    ) -> (InternedStringKey, EncodedTaskData) {
        let key = InternedStringKey {
            namespace,
            hash: hash_xxh3_hash128(value.as_bytes()).to_le_bytes(),
        };
        let mut interned_strings = InternedStrings::default();
        turbo_bincode::InternedStringCollector::insert(
            &mut interned_strings,
            key,
            &RcStr::from(value),
        )
        .unwrap();
        (
            key,
            EncodedTaskData {
                bytes: Default::default(),
                interned_strings,
            },
        )
    }

    fn resolve_path(
        storage: &TurboBackingStorage,
        key: InternedStringKey,
    ) -> Result<RcStr, DecodeError> {
        let mut result = None;
        storage.inner.resolve(key, &mut |value| {
            result = value.downcast_ref::<RcStr>().cloned()
        })?;
        result.ok_or_else(|| DecodeError::OtherString("wrong resolved test value type".into()))
    }

    fn dictionary_entry(
        storage: &TurboBackingStorage,
        key: InternedStringKey,
    ) -> Result<Option<(u64, String)>> {
        let key = interned_string_key_bytes(key);
        storage
            .inner
            .database
            .get(KeySpace::FileSystemPath, &key)?
            .map(|bytes| {
                let (count, value) = decode_dictionary_value(bytes.borrow())?;
                Ok((count, value.to_owned()))
            })
            .transpose()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn file_system_path_dictionary_reclaims_final_record_reference() -> Result<()> {
        let tempdir = tempfile::tempdir()?;
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);
        let namespace = [42; 10];
        let first_id = TaskId::try_from(301u32).unwrap();
        let second_id = TaskId::try_from(302u32).unwrap();
        let old_path = "src/a/realistically/long/shared/file-system-path.ts";
        let new_path = "src/a/different/realistically/long/file-system-path.ts";

        let (old_key, first_record) = encoded_path_record(namespace, old_path);
        let (_, second_record) = encoded_path_record(namespace, old_path);
        storage.save_snapshot(
            Vec::new(),
            None,
            vec![vec![
                SnapshotItem::Put {
                    task_id: first_id,
                    meta: Some(first_record),
                    data: None,
                    task_type_hash: None,
                },
                SnapshotItem::Put {
                    task_id: second_id,
                    meta: Some(second_record),
                    data: None,
                    task_type_hash: None,
                },
            ]],
        )?;
        assert_eq!(
            dictionary_entry(&storage, old_key)?,
            Some((2, old_path.to_owned()))
        );

        // A forced content-identity collision aborts the whole snapshot before commit.
        let mut colliding_strings = InternedStrings::default();
        turbo_bincode::InternedStringCollector::insert(
            &mut colliding_strings,
            old_key,
            &RcStr::from("a different string with the forced old identity"),
        )?;
        assert!(
            storage
                .save_snapshot(
                    Vec::new(),
                    None,
                    vec![vec![SnapshotItem::Put {
                        task_id: first_id,
                        meta: Some(EncodedTaskData {
                            bytes: Default::default(),
                            interned_strings: colliding_strings,
                        }),
                        data: None,
                        task_type_hash: None,
                    }]],
                )
                .is_err()
        );
        assert_eq!(
            dictionary_entry(&storage, old_key)?,
            Some((2, old_path.to_owned()))
        );

        // Reopening retains the durable dictionary and reconstructs the sharing cache lazily.
        storage.inner.database.shutdown()?;
        drop(storage);
        let db = TurboKeyValueDatabase::new(tempdir.path().to_path_buf(), TEST_STORAGE_OPTIONS)?;
        let storage = TurboBackingStorage::new_in_memory(db);

        // Lazy resolution clones the same RcStr allocation.
        let first = resolve_path(&storage, old_key)?;
        let second = resolve_path(&storage, old_key)?;
        assert!(std::ptr::eq(
            first.as_str().as_ptr(),
            second.as_str().as_ptr()
        ));

        // Rewriting one record moves only its membership to the new path.
        let (new_key, replacement) = encoded_path_record(namespace, new_path);
        storage.save_snapshot(
            Vec::new(),
            None,
            vec![vec![SnapshotItem::Put {
                task_id: first_id,
                meta: Some(replacement),
                data: None,
                task_type_hash: None,
            }]],
        )?;
        assert_eq!(
            dictionary_entry(&storage, old_key)?,
            Some((1, old_path.to_owned()))
        );
        assert_eq!(
            dictionary_entry(&storage, new_key)?,
            Some((1, new_path.to_owned()))
        );

        // Deleting the final records removes both dictionary values and their metadata.
        for task_id in [second_id, first_id] {
            storage.save_snapshot(
                Vec::new(),
                None,
                vec![vec![SnapshotItem::Delete {
                    task_id,
                    task_type_hash: [0; 8],
                }]],
            )?;
        }
        assert_eq!(dictionary_entry(&storage, old_key)?, None);
        assert_eq!(dictionary_entry(&storage, new_key)?, None);
        assert!(resolve_path(&storage, old_key).is_err());
        assert!(resolve_path(&storage, new_key).is_err());
        assert!(
            storage
                .inner
                .database
                .get(KeySpace::TaskMetaPathRefs, &(*first_id).to_le_bytes())?
                .is_none()
        );
        assert!(
            storage
                .inner
                .database
                .get(KeySpace::TaskMetaPathRefs, &(*second_id).to_le_bytes())?
                .is_none()
        );

        storage.inner.database.shutdown()?;
        Ok(())
    }
}
