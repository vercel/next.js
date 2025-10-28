use std::{
    borrow::Borrow,
    env,
    path::PathBuf,
    sync::{Arc, LazyLock, Mutex, PoisonError, Weak},
};

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{
    SessionId, TaskId,
    backend::CachedTaskType,
    panic_hooks::{PanicHookGuard, register_panic_hook},
    parallel,
};

use crate::{
    GitVersionInfo,
    backend::{AnyOperation, TaskDataCategory},
    backing_storage::{BackingStorage, BackingStorageSealed},
    data::CachedDataItem,
    database::{
        db_invalidation::{StartupCacheState, check_db_invalidation_and_cleanup, invalidate_db},
        db_versioning::handle_db_versioning,
        key_value_database::{KeySpace, KeyValueDatabase},
        write_batch::{
            BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch, WriteBatchRef,
            WriteBuffer,
        },
    },
    db_invalidation::invalidation_reasons,
    utils::chunked_vec::ChunkedVec,
};

const POT_CONFIG: pot::Config = pot::Config::new().compatibility(pot::Compatibility::V4);

fn pot_serialize_small_vec<T: Serialize>(value: &T) -> pot::Result<SmallVec<[u8; 16]>> {
    struct SmallVecWrite<'l>(&'l mut SmallVec<[u8; 16]>);
    impl std::io::Write for SmallVecWrite<'_> {
        #[inline]
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.extend_from_slice(buf);
            Ok(buf.len())
        }

        #[inline]
        fn write_all(&mut self, buf: &[u8]) -> std::io::Result<()> {
            self.0.extend_from_slice(buf);
            Ok(())
        }

        #[inline]
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    let mut output = SmallVec::new();
    POT_CONFIG.serialize_into(value, SmallVecWrite(&mut output))?;
    Ok(output)
}

fn pot_ser_symbol_map() -> pot::ser::SymbolMap {
    pot::ser::SymbolMap::new().with_compatibility(pot::Compatibility::V4)
}

fn pot_de_symbol_list<'l>() -> pot::de::SymbolList<'l> {
    pot::de::SymbolList::new()
}

const META_KEY_OPERATIONS: u32 = 0;
const META_KEY_NEXT_FREE_TASK_ID: u32 = 1;
const META_KEY_SESSION_ID: u32 = 2;

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
    fn with_tx<R>(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        f: impl FnOnce(&T::ReadTransaction<'_>) -> Result<R>,
    ) -> Result<R> {
        if let Some(tx) = tx {
            f(tx)
        } else {
            let tx = self.database.begin_read_transaction()?;
            let r = f(&tx)?;
            drop(tx);
            Ok(r)
        }
    }

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

    /// Used to read the previous session id and the next free task ID from the database.
    fn get_infra_u32(&self, key: u32) -> Result<Option<u32>> {
        let tx = self.database.begin_read_transaction()?;
        self.database
            .get(&tx, KeySpace::Infra, IntKey::new(key).as_ref())?
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
    type ReadTransaction<'l> = T::ReadTransaction<'l>;

    fn next_free_task_id(&self) -> Result<TaskId> {
        Ok(self
            .inner
            .get_infra_u32(META_KEY_NEXT_FREE_TASK_ID)
            .context("Unable to read next free task id from database")?
            .map_or(Ok(TaskId::MIN), TaskId::try_from)?)
    }

    fn next_session_id(&self) -> Result<SessionId> {
        Ok(SessionId::try_from(
            self.inner
                .get_infra_u32(META_KEY_SESSION_ID)
                .context("Unable to read session id from database")?
                .unwrap_or(0)
                + 1,
        )?)
    }

    fn uncompleted_operations(&self) -> Result<Vec<AnyOperation>> {
        fn get(database: &impl KeyValueDatabase) -> Result<Vec<AnyOperation>> {
            let tx = database.begin_read_transaction()?;
            let Some(operations) = database.get(
                &tx,
                KeySpace::Infra,
                IntKey::new(META_KEY_OPERATIONS).as_ref(),
            )?
            else {
                return Ok(Vec::new());
            };
            let operations = deserialize_with_good_error(operations.borrow())?;
            Ok(operations)
        }
        get(&self.inner.database).context("Unable to read uncompleted operations from database")
    }

    fn serialize(&self, task: TaskId, data: &Vec<CachedDataItem>) -> Result<SmallVec<[u8; 16]>> {
        serialize(task, data)
    }

    fn save_snapshot<I>(
        &self,
        session_id: SessionId,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        snapshots: Vec<I>,
    ) -> Result<()>
    where
        I: Iterator<
                Item = (
                    TaskId,
                    Option<SmallVec<[u8; 16]>>,
                    Option<SmallVec<[u8; 16]>>,
                ),
            > + Send
            + Sync,
    {
        let _span = tracing::trace_span!("save snapshot", session_id = ?session_id, operations = operations.len());
        let mut batch = self.inner.database.write_batch()?;

        // Start organizing the updates in parallel
        match &mut batch {
            &mut WriteBatch::Concurrent(ref batch, _) => {
                {
                    let _span = tracing::trace_span!("update task data").entered();
                    process_task_data(snapshots, Some(batch))?;
                    let span = tracing::trace_span!("flush task data").entered();
                    parallel::try_for_each(
                        &[KeySpace::TaskMeta, KeySpace::TaskData],
                        |&key_space| {
                            let _span = span.clone().entered();
                            // Safety: We already finished all processing of the task data and task
                            // meta
                            unsafe { batch.flush(key_space) }
                        },
                    )?;
                }

                let mut next_task_id = get_next_free_task_id::<
                    T::SerialWriteBatch<'_>,
                    T::ConcurrentWriteBatch<'_>,
                >(&mut WriteBatchRef::concurrent(batch))?;

                {
                    let _span = tracing::trace_span!(
                        "update task cache",
                        items = task_cache_updates.iter().map(|m| m.len()).sum::<usize>()
                    )
                    .entered();
                    let result = parallel::map_collect_owned::<_, _, Result<Vec<_>>>(
                        task_cache_updates,
                        |updates| {
                            let _span = _span.clone().entered();
                            let mut max_task_id = 0;

                            let mut task_type_bytes = Vec::new();
                            for (task_type, task_id) in updates {
                                serialize_task_type(
                                    &task_type,
                                    &mut task_type_bytes,
                                    Some(task_id),
                                )?;
                                let task_id: u32 = *task_id;

                                batch
                                    .put(
                                        KeySpace::ForwardTaskCache,
                                        WriteBuffer::Borrowed(&task_type_bytes),
                                        WriteBuffer::Borrowed(&task_id.to_le_bytes()),
                                    )
                                    .with_context(|| {
                                        anyhow!(
                                            "Unable to write task cache {task_type:?} => {task_id}"
                                        )
                                    })?;
                                batch
                                    .put(
                                        KeySpace::ReverseTaskCache,
                                        WriteBuffer::Borrowed(IntKey::new(task_id).as_ref()),
                                        WriteBuffer::Borrowed(&task_type_bytes),
                                    )
                                    .with_context(|| {
                                        anyhow!(
                                            "Unable to write task cache {task_id} => {task_type:?}"
                                        )
                                    })?;
                                max_task_id = max_task_id.max(task_id + 1);
                            }

                            Ok(max_task_id)
                        },
                    )?
                    .into_iter()
                    .max()
                    .unwrap_or(0);
                    next_task_id = next_task_id.max(result);
                }

                save_infra::<T::SerialWriteBatch<'_>, T::ConcurrentWriteBatch<'_>>(
                    &mut WriteBatchRef::concurrent(batch),
                    next_task_id,
                    session_id,
                    operations,
                )?;
            }
            WriteBatch::Serial(batch) => {
                {
                    let _span = tracing::trace_span!("update tasks").entered();
                    let task_items =
                        process_task_data(snapshots, None::<&T::ConcurrentWriteBatch<'_>>)?;
                    for (task_id, meta, data) in task_items.into_iter().flatten() {
                        let key = IntKey::new(*task_id);
                        let key = key.as_ref();
                        if let Some(meta) = meta {
                            batch
                                .put(KeySpace::TaskMeta, WriteBuffer::Borrowed(key), meta)
                                .with_context(|| {
                                    anyhow!("Unable to write meta items for {task_id}")
                                })?;
                        }
                        if let Some(data) = data {
                            batch
                                .put(KeySpace::TaskData, WriteBuffer::Borrowed(key), data)
                                .with_context(|| {
                                    anyhow!("Unable to write data items for {task_id}")
                                })?;
                        }
                    }
                    batch.flush(KeySpace::TaskMeta)?;
                    batch.flush(KeySpace::TaskData)?;
                }

                let mut next_task_id = get_next_free_task_id::<
                    T::SerialWriteBatch<'_>,
                    T::ConcurrentWriteBatch<'_>,
                >(&mut WriteBatchRef::serial(batch))?;

                {
                    let _span = tracing::trace_span!(
                        "update task cache",
                        items = task_cache_updates.iter().map(|m| m.len()).sum::<usize>()
                    )
                    .entered();
                    let mut task_type_bytes = Vec::new();
                    for (task_type, task_id) in task_cache_updates.into_iter().flatten() {
                        serialize_task_type(&task_type, &mut task_type_bytes, Some(task_id))?;
                        let task_id = *task_id;

                        batch
                            .put(
                                KeySpace::ForwardTaskCache,
                                WriteBuffer::Borrowed(&task_type_bytes),
                                WriteBuffer::Borrowed(&task_id.to_le_bytes()),
                            )
                            .with_context(|| {
                                anyhow!("Unable to write task cache {task_type:?} => {task_id}")
                            })?;
                        batch
                            .put(
                                KeySpace::ReverseTaskCache,
                                WriteBuffer::Borrowed(IntKey::new(task_id).as_ref()),
                                WriteBuffer::Borrowed(&task_type_bytes),
                            )
                            .with_context(|| {
                                anyhow!("Unable to write task cache {task_id} => {task_type:?}")
                            })?;
                        next_task_id = next_task_id.max(task_id + 1);
                    }
                }

                save_infra::<T::SerialWriteBatch<'_>, T::ConcurrentWriteBatch<'_>>(
                    &mut WriteBatchRef::serial(batch),
                    next_task_id,
                    session_id,
                    operations,
                )?;
            }
        }

        {
            let _span = tracing::trace_span!("commit").entered();
            batch
                .commit()
                .with_context(|| anyhow!("Unable to commit operations"))?;
        }
        Ok(())
    }

    fn start_read_transaction(&self) -> Option<Self::ReadTransaction<'_>> {
        self.inner.database.begin_read_transaction().ok()
    }

    unsafe fn forward_lookup_task_cache(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_type: &CachedTaskType,
    ) -> Result<Option<TaskId>> {
        let inner = &*self.inner;
        fn lookup<D: KeyValueDatabase>(
            database: &D,
            tx: &D::ReadTransaction<'_>,
            task_type: &CachedTaskType,
        ) -> Result<Option<TaskId>> {
            let mut task_type_bytes = Vec::new();
            serialize_task_type(task_type, &mut task_type_bytes, None)?;
            let Some(bytes) = database.get(tx, KeySpace::ForwardTaskCache, &task_type_bytes)?
            else {
                return Ok(None);
            };
            let bytes = bytes.borrow().try_into()?;
            let id = TaskId::try_from(u32::from_le_bytes(bytes)).unwrap();
            Ok(Some(id))
        }
        if inner.database.is_empty() {
            // Checking if the database is empty is a performance optimization
            // to avoid serializing the task type.
            return Ok(None);
        }
        inner
            .with_tx(tx, |tx| lookup(&self.inner.database, tx, task_type))
            .with_context(|| format!("Looking up task id for {task_type:?} from database failed"))
    }

    unsafe fn reverse_lookup_task_cache(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_id: TaskId,
    ) -> Result<Option<Arc<CachedTaskType>>> {
        let inner = &*self.inner;
        fn lookup<D: KeyValueDatabase>(
            database: &D,
            tx: &D::ReadTransaction<'_>,
            task_id: TaskId,
        ) -> Result<Option<Arc<CachedTaskType>>> {
            let Some(bytes) = database.get(
                tx,
                KeySpace::ReverseTaskCache,
                IntKey::new(*task_id).as_ref(),
            )?
            else {
                return Ok(None);
            };
            Ok(Some(deserialize_with_good_error(bytes.borrow())?))
        }
        inner
            .with_tx(tx, |tx| lookup(&inner.database, tx, task_id))
            .with_context(|| format!("Looking up task type for {task_id} from database failed"))
    }

    unsafe fn lookup_data(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Result<Vec<CachedDataItem>> {
        let inner = &*self.inner;
        fn lookup<D: KeyValueDatabase>(
            database: &D,
            tx: &D::ReadTransaction<'_>,
            task_id: TaskId,
            category: TaskDataCategory,
        ) -> Result<Vec<CachedDataItem>> {
            let Some(bytes) = database.get(
                tx,
                match category {
                    TaskDataCategory::Meta => KeySpace::TaskMeta,
                    TaskDataCategory::Data => KeySpace::TaskData,
                    TaskDataCategory::All => unreachable!(),
                },
                IntKey::new(*task_id).as_ref(),
            )?
            else {
                return Ok(Vec::new());
            };
            let result: Vec<CachedDataItem> = deserialize_with_good_error(bytes.borrow())?;
            Ok(result)
        }
        inner
            .with_tx(tx, |tx| lookup(&inner.database, tx, task_id, category))
            .with_context(|| format!("Looking up data for {task_id} from database failed"))
    }

    fn shutdown(&self) -> Result<()> {
        self.inner.database.shutdown()
    }
}

fn get_next_free_task_id<'a, S, C>(
    batch: &mut WriteBatchRef<'_, 'a, S, C>,
) -> Result<u32, anyhow::Error>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
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

fn save_infra<'a, S, C>(
    batch: &mut WriteBatchRef<'_, 'a, S, C>,
    next_task_id: u32,
    session_id: SessionId,
    operations: Vec<Arc<AnyOperation>>,
) -> Result<(), anyhow::Error>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    {
        batch
            .put(
                KeySpace::Infra,
                WriteBuffer::Borrowed(IntKey::new(META_KEY_NEXT_FREE_TASK_ID).as_ref()),
                WriteBuffer::Borrowed(&next_task_id.to_le_bytes()),
            )
            .with_context(|| anyhow!("Unable to write next free task id"))?;
    }
    {
        let _span = tracing::trace_span!("update session id", session_id = ?session_id).entered();
        batch
            .put(
                KeySpace::Infra,
                WriteBuffer::Borrowed(IntKey::new(META_KEY_SESSION_ID).as_ref()),
                WriteBuffer::Borrowed(&session_id.to_le_bytes()),
            )
            .with_context(|| anyhow!("Unable to write next session id"))?;
    }
    {
        let _span =
            tracing::trace_span!("update operations", operations = operations.len()).entered();
        let operations = pot_serialize_small_vec(&operations)
            .with_context(|| anyhow!("Unable to serialize operations"))?;
        batch
            .put(
                KeySpace::Infra,
                WriteBuffer::Borrowed(IntKey::new(META_KEY_OPERATIONS).as_ref()),
                WriteBuffer::SmallVec(operations),
            )
            .with_context(|| anyhow!("Unable to write operations"))?;
    }
    batch.flush(KeySpace::Infra)?;
    Ok(())
}

// DO NOT REMOVE THE `inline(never)` ATTRIBUTE!
// `pot` uses the pointer address of `&'static str` to deduplicate Symbols.
// If this function is inlined into multiple different callsites it might inline the Serialize
// implementation too, which can pull a `&'static str` from another crate into this crate.
// Since string deduplication between crates is not guaranteed, it can lead to behavior changes due
// to the pointer addresses. This can lead to lookup path and store path creating different
// serialization of the same task type, which breaks task cache lookups.
#[inline(never)]
fn serialize_task_type(
    task_type: &CachedTaskType,
    mut task_type_bytes: &mut Vec<u8>,
    task_id: Option<TaskId>,
) -> Result<()> {
    task_type_bytes.clear();
    POT_CONFIG
        .serialize_into(task_type, &mut task_type_bytes)
        .with_context(|| {
            if let Some(task_id) = task_id {
                anyhow!("Unable to serialize task {task_id} cache key {task_type:?}")
            } else {
                anyhow!("Unable to serialize task cache key {task_type:?}")
            }
        })?;
    #[cfg(feature = "verify_serialization")]
    {
        let deserialize: Result<CachedTaskType, _> = serde_path_to_error::deserialize(
            &mut pot_de_symbol_list().deserializer_for_slice(&*task_type_bytes)?,
        );
        if let Err(err) = deserialize {
            println!("Task type would not be deserializable {task_id:?}: {err:?}\n{task_type:#?}");
            panic!("Task type would not be deserializable {task_id:?}: {err:?}");
        }
    }
    Ok(())
}

type SerializedTasks = Vec<
    Vec<(
        TaskId,
        Option<WriteBuffer<'static>>,
        Option<WriteBuffer<'static>>,
    )>,
>;

fn process_task_data<'a, B: ConcurrentWriteBatch<'a> + Send + Sync, I>(
    tasks: Vec<I>,
    batch: Option<&B>,
) -> Result<SerializedTasks>
where
    I: Iterator<
            Item = (
                TaskId,
                Option<SmallVec<[u8; 16]>>,
                Option<SmallVec<[u8; 16]>>,
            ),
        > + Send
        + Sync,
{
    parallel::map_collect_owned::<_, _, Result<Vec<_>>>(tasks, |tasks| {
        let mut result = Vec::new();
        for (task_id, meta, data) in tasks {
            if let Some(batch) = batch {
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
            } else {
                // Store the new task data
                result.push((
                    task_id,
                    meta.map(WriteBuffer::SmallVec),
                    data.map(WriteBuffer::SmallVec),
                ));
            }
        }

        Ok(result)
    })
}

fn serialize(task: TaskId, data: &Vec<CachedDataItem>) -> Result<SmallVec<[u8; 16]>> {
    Ok(match pot_serialize_small_vec(data) {
        #[cfg(not(feature = "verify_serialization"))]
        Ok(value) => value,
        _ => {
            let mut error = Ok(());
            let mut data = data.clone();
            data.retain(|item| {
                let mut buf = Vec::<u8>::new();
                let mut symbol_map = pot_ser_symbol_map();
                let mut serializer = symbol_map.serializer_for(&mut buf).unwrap();
                if let Err(err) = serde_path_to_error::serialize(&item, &mut serializer) {
                    if item.is_optional() {
                        #[cfg(feature = "verify_serialization")]
                        println!("Skipping non-serializable optional item for {task}: {item:?}");
                    } else {
                        error = Err(err).context({
                            anyhow!("Unable to serialize data item for {task}: {item:?}")
                        });
                    }
                    false
                } else {
                    #[cfg(feature = "verify_serialization")]
                    {
                        let deserialize: Result<CachedDataItem, _> =
                            serde_path_to_error::deserialize(
                                &mut pot_de_symbol_list().deserializer_for_slice(&buf).unwrap(),
                            );
                        if let Err(err) = deserialize {
                            println!(
                                "Data item would not be deserializable {task}: {err:?}\n{item:?}"
                            );
                            return false;
                        }
                    }
                    true
                }
            });
            error?;

            pot_serialize_small_vec(&data)
                .with_context(|| anyhow!("Unable to serialize data items for {task}: {data:#?}"))?
        }
    })
}

fn deserialize_with_good_error<'de, T: Deserialize<'de>>(data: &'de [u8]) -> Result<T> {
    match POT_CONFIG.deserialize(data) {
        Ok(value) => Ok(value),
        Err(error) => serde_path_to_error::deserialize::<'_, _, T>(
            &mut pot_de_symbol_list().deserializer_for_slice(data)?,
        )
        .map_err(anyhow::Error::from)
        .and(Err(error.into()))
        .context("Deserialization failed"),
    }
}
