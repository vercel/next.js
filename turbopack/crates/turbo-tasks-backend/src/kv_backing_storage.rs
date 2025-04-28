use std::{borrow::Borrow, cmp::max, sync::Arc};

use anyhow::{Context, Result, anyhow};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use tracing::Span;
use turbo_persistence::interning_serde;
use turbo_tasks::{SessionId, TaskId, backend::CachedTaskType, turbo_tasks_scope};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    backing_storage::BackingStorage,
    data::CachedDataItem,
    database::{
        key_value_database::{KeySpace, KeyValueDatabase},
        write_batch::{
            BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch, WriteBatchRef,
            WriteBuffer,
        },
    },
    interning_serde,
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
    interning_serde::to_writer(&POT_CONFIG, value, SmallVecWrite(&mut output))?;
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

pub struct KeyValueDatabaseBackingStorage<T: KeyValueDatabase> {
    database: T,
}

impl<T: KeyValueDatabase> KeyValueDatabaseBackingStorage<T> {
    pub fn new(database: T) -> Self {
        Self { database }
    }

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
}

fn get_infra_u32(database: &impl KeyValueDatabase, key: u32) -> Result<Option<u32>> {
    let tx = database.begin_read_transaction()?;
    database
        .get(&tx, KeySpace::Infra, IntKey::new(key).as_ref())?
        .map(as_u32)
        .transpose()
}

impl<T: KeyValueDatabase + Send + Sync + 'static> BackingStorage
    for KeyValueDatabaseBackingStorage<T>
{
    type ReadTransaction<'l> = T::ReadTransaction<'l>;

    fn lower_read_transaction<'l: 'i + 'r, 'i: 'r, 'r>(
        tx: &'r Self::ReadTransaction<'l>,
    ) -> &'r Self::ReadTransaction<'i> {
        T::lower_read_transaction(tx)
    }

    fn next_free_task_id(&self) -> Result<TaskId> {
        Ok(TaskId::try_from(
            get_infra_u32(&self.database, META_KEY_NEXT_FREE_TASK_ID)
                .context("Unable to read next free task id from database")?
                .unwrap_or(1),
        )?)
    }

    fn next_session_id(&self) -> Result<SessionId> {
        Ok(SessionId::try_from(
            get_infra_u32(&self.database, META_KEY_SESSION_ID)
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
        get(&self.database).context("Unable to read uncompleted operations from database")
    }

    fn serialize(task: TaskId, data: &Vec<CachedDataItem>) -> Result<SmallVec<[u8; 16]>> {
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
        let mut batch = self.database.write_batch()?;

        // Start organizing the updates in parallel
        match &mut batch {
            &mut WriteBatch::Concurrent(ref batch, _) => {
                {
                    let _span = tracing::trace_span!("update task data").entered();
                    process_task_data(snapshots, Some(batch))?;
                    let span = tracing::trace_span!("flush task data").entered();
                    [KeySpace::TaskMeta, KeySpace::TaskData]
                        .into_par_iter()
                        .try_for_each(|key_space| {
                            let _span = span.clone().entered();
                            // Safety: We already finished all processing of the task data and task
                            // meta
                            unsafe { batch.flush(key_space) }
                        })?;
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
                    let result = task_cache_updates
                        .into_par_iter()
                        .with_max_len(1)
                        .map(|updates| {
                            let _span = _span.clone().entered();
                            let mut max_task_id = 0;

                            let mut task_type_bytes = Vec::new();
                            for (task_type, task_id) in updates {
                                let task_id: u32 = *task_id;
                                serialize_task_type(&task_type, &mut task_type_bytes, task_id)?;

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
                        })
                        .reduce(
                            || Ok(0),
                            |a, b| -> anyhow::Result<_> {
                                let a_max = a?;
                                let b_max = b?;
                                Ok(max(a_max, b_max))
                            },
                        )?;
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
                let mut task_items_result = Ok(Vec::new());
                turbo_tasks::scope(|s| {
                    s.spawn(|_| {
                        task_items_result =
                            process_task_data(snapshots, None::<&T::ConcurrentWriteBatch<'_>>);
                    });

                    let mut next_task_id =
                        get_next_free_task_id::<
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
                            let task_id = *task_id;
                            serialize_task_type(&task_type, &mut task_type_bytes, task_id)?;

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
                    anyhow::Ok(())
                })?;

                {
                    let _span = tracing::trace_span!("update tasks").entered();
                    for (task_id, meta, data) in task_items_result?.into_iter().flatten() {
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
                }
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
        self.database.begin_read_transaction().ok()
    }

    unsafe fn forward_lookup_task_cache(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_type: &CachedTaskType,
    ) -> Result<Option<TaskId>> {
        fn lookup<D: KeyValueDatabase>(
            database: &D,
            tx: &D::ReadTransaction<'_>,
            task_type: &CachedTaskType,
        ) -> Result<Option<TaskId>> {
            let task_type = interning_serde::to_vec(&POT_CONFIG, task_type)?;
            let Some(bytes) = database.get(tx, KeySpace::ForwardTaskCache, &task_type)? else {
                return Ok(None);
            };
            let bytes = bytes.borrow().try_into()?;
            let id = TaskId::try_from(u32::from_le_bytes(bytes)).unwrap();
            Ok(Some(id))
        }
        if self.database.is_empty() {
            // Checking if the database is empty is a performance optimization
            // to avoid serializing the task type.
            return Ok(None);
        }
        self.with_tx(tx, |tx| lookup(&self.database, tx, task_type))
            .with_context(|| format!("Looking up task id for {task_type:?} from database failed"))
    }

    unsafe fn reverse_lookup_task_cache(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_id: TaskId,
    ) -> Result<Option<Arc<CachedTaskType>>> {
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
        self.with_tx(tx, |tx| lookup(&self.database, tx, task_id))
            .with_context(|| format!("Looking up task type for {task_id} from database failed"))
    }

    unsafe fn lookup_data(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Result<Vec<CachedDataItem>> {
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
        self.with_tx(tx, |tx| lookup(&self.database, tx, task_id, category))
            .with_context(|| format!("Looking up data for {task_id} from database failed"))
    }

    fn shutdown(&self) -> Result<()> {
        self.database.shutdown()
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

fn serialize_task_type(
    task_type: &Arc<CachedTaskType>,
    mut task_type_bytes: &mut Vec<u8>,
    task_id: u32,
) -> Result<()> {
    task_type_bytes.clear();
    interning_serde::to_writer(&POT_CONFIG, task_type, &mut task_type_bytes)
        .with_context(|| anyhow!("Unable to serialize task {task_id} cache key {task_type:?}"))?;
    #[cfg(feature = "verify_serialization")]
    {
        let deserialize: Result<CachedTaskType, _> = serde_path_to_error::deserialize(
            &mut pot_de_symbol_list().deserializer_for_slice(&*task_type_bytes)?,
        );
        if let Err(err) = deserialize {
            println!("Task type would not be deserializable {task_id}: {err:?}\n{task_type:#?}");
            panic!("Task type would not be deserializable {task_id}: {err:?}");
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
    let span = Span::current();
    let turbo_tasks = turbo_tasks::turbo_tasks();
    let handle = tokio::runtime::Handle::current();
    tasks
        .into_par_iter()
        .map(|tasks| {
            let _span = span.clone().entered();
            let _guard = handle.clone().enter();
            turbo_tasks_scope(turbo_tasks.clone(), || {
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
        })
        .collect::<Result<Vec<_>>>()
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
    match interning_serde::from_slice(&POT_CONFIG, data)? {
        Ok(value) => Ok(value),
        Err(error) => serde_path_to_error::deserialize::<'_, _, T>(
            &mut pot_de_symbol_list().deserializer_for_slice(data)?,
        )
        .map_err(anyhow::Error::from)
        .and(Err(error.into()))
        .context("Deserialization failed"),
    }
}
