use std::{borrow::Borrow, cmp::max, sync::Arc};

use anyhow::{anyhow, Context, Result};
use rayon::iter::{
    IndexedParallelIterator, IntoParallelIterator, IntoParallelRefIterator, ParallelIterator,
};
use serde::Serialize;
use smallvec::SmallVec;
use tracing::Span;
use turbo_tasks::{backend::CachedTaskType, turbo_tasks_scope, SessionId, TaskId};

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

#[cfg(feature = "verify_serialization")]
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

fn get_infra_u32(database: &impl KeyValueDatabase, key: u32) -> Option<u32> {
    let tx = database.begin_read_transaction().ok()?;
    let value = database
        .get(&tx, KeySpace::Infra, IntKey::new(key).as_ref())
        .ok()?
        .map(as_u32)?
        .ok()?;
    Some(value)
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

    fn next_free_task_id(&self) -> TaskId {
        TaskId::from(get_infra_u32(&self.database, META_KEY_NEXT_FREE_TASK_ID).unwrap_or(1))
    }

    fn next_session_id(&self) -> SessionId {
        SessionId::from(get_infra_u32(&self.database, META_KEY_SESSION_ID).unwrap_or(0) + 1)
    }

    fn uncompleted_operations(&self) -> Vec<AnyOperation> {
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
            let operations = POT_CONFIG.deserialize(operations.borrow())?;
            Ok(operations)
        }
        get(&self.database).unwrap_or_default()
    }

    fn save_snapshot(
        &self,
        session_id: SessionId,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        tasks: Vec<
            Vec<(
                TaskId,
                Option<Vec<CachedDataItem>>,
                Option<Vec<CachedDataItem>>,
            )>,
        >,
    ) -> Result<()> {
        let _span = tracing::trace_span!("save snapshot", session_id = ?session_id, operations = operations.len());
        let mut batch = self.database.write_batch()?;
        let mut task_meta_items_result = Ok(Vec::new());
        let mut task_data_items_result = Ok(Vec::new());

        // Start organizing the updates in parallel
        match &mut batch {
            WriteBatch::Concurrent(ref batch, _) => {
                turbo_tasks::scope(|s| {
                    s.spawn(|_| {
                        let _span = tracing::trace_span!("update task meta").entered();
                        task_meta_items_result = process_task_data(
                            KeySpace::TaskMeta,
                            &tasks,
                            |meta, _| meta,
                            Some(batch),
                        );
                    });
                    s.spawn(|_| {
                        let _span = tracing::trace_span!("update task data").entered();
                        task_data_items_result = process_task_data(
                            KeySpace::TaskData,
                            &tasks,
                            |_, data| data,
                            Some(batch),
                        );
                    });

                    let mut next_task_id =
                        get_next_free_task_id::<
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
                                                "Unable to write task cache {task_type:?} => \
                                                 {task_id}"
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
                                                "Unable to write task cache {task_id} => \
                                                 {task_type:?}"
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
                    anyhow::Ok(())
                })?;

                task_meta_items_result?;
                task_data_items_result?;
            }
            WriteBatch::Serial(batch) => {
                turbo_tasks::scope(|s| {
                    s.spawn(|_| {
                        task_meta_items_result = process_task_data(
                            KeySpace::TaskMeta,
                            &tasks,
                            |meta, _| meta,
                            None::<&T::ConcurrentWriteBatch<'_>>,
                        );
                    });
                    s.spawn(|_| {
                        task_data_items_result = process_task_data(
                            KeySpace::TaskData,
                            &tasks,
                            |_, data| data,
                            None::<&T::ConcurrentWriteBatch<'_>>,
                        );
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

                let jobs = [
                    (
                        KeySpace::TaskMeta,
                        tracing::trace_span!("update task meta"),
                        task_meta_items_result?,
                    ),
                    (
                        KeySpace::TaskData,
                        tracing::trace_span!("update task data"),
                        task_data_items_result?,
                    ),
                ];
                for (key_space, span, task_items) in jobs {
                    let _span = span.entered();
                    for (task_id, value) in task_items.into_iter().flatten() {
                        batch
                            .put(
                                key_space,
                                WriteBuffer::Borrowed(IntKey::new(*task_id).as_ref()),
                                value,
                            )
                            .with_context(|| anyhow!("Unable to write data items for {task_id}"))?;
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
    ) -> Option<TaskId> {
        fn lookup<D: KeyValueDatabase>(
            database: &D,
            tx: &D::ReadTransaction<'_>,
            task_type: &CachedTaskType,
        ) -> Result<Option<TaskId>> {
            let task_type = POT_CONFIG.serialize(task_type)?;
            let Some(bytes) = database.get(tx, KeySpace::ForwardTaskCache, &task_type)? else {
                return Ok(None);
            };
            let bytes = bytes.borrow().try_into()?;
            let id = TaskId::from(u32::from_le_bytes(bytes));
            Ok(Some(id))
        }
        if self.database.is_empty() {
            // Checking if the database is empty is a performance optimization
            // to avoid serializing the task type.
            return None;
        }
        let id = self
            .with_tx(tx, |tx| lookup(&self.database, tx, task_type))
            .inspect_err(|err| println!("Looking up task id for {task_type:?} failed: {err:?}"))
            .ok()??;
        Some(id)
    }

    unsafe fn reverse_lookup_task_cache(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_id: TaskId,
    ) -> Option<Arc<CachedTaskType>> {
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
            Ok(Some(POT_CONFIG.deserialize(bytes.borrow())?))
        }
        let result = self
            .with_tx(tx, |tx| lookup(&self.database, tx, task_id))
            .inspect_err(|err| println!("Looking up task type for {task_id} failed: {err:?}"))
            .ok()??;
        Some(result)
    }

    unsafe fn lookup_data(
        &self,
        tx: Option<&T::ReadTransaction<'_>>,
        task_id: TaskId,
        category: TaskDataCategory,
    ) -> Vec<CachedDataItem> {
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
            let result: Vec<CachedDataItem> = POT_CONFIG.deserialize(bytes.borrow())?;
            Ok(result)
        }
        self.with_tx(tx, |tx| lookup(&self.database, tx, task_id, category))
            .inspect_err(|err| println!("Looking up data for {task_id} failed: {err:?}"))
            .unwrap_or_default()
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
    Ok(())
}

fn serialize_task_type(
    task_type: &Arc<CachedTaskType>,
    mut task_type_bytes: &mut Vec<u8>,
    task_id: u32,
) -> Result<()> {
    task_type_bytes.clear();
    POT_CONFIG
        .serialize_into(&**task_type, &mut task_type_bytes)
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

type SerializedTasks = Vec<Vec<(TaskId, WriteBuffer<'static>)>>;

fn process_task_data<'a, B: ConcurrentWriteBatch<'a> + Send + Sync, S>(
    key_space: KeySpace,
    tasks: &Vec<
        Vec<(
            TaskId,
            Option<Vec<CachedDataItem>>,
            Option<Vec<CachedDataItem>>,
        )>,
    >,
    select: S,
    batch: Option<&B>,
) -> Result<SerializedTasks>
where
    S: for<'l> Fn(
            &'l Option<Vec<CachedDataItem>>,
            &'l Option<Vec<CachedDataItem>>,
        ) -> &'l Option<Vec<CachedDataItem>>
        + Sync
        + Send,
{
    let span = Span::current();
    let turbo_tasks = turbo_tasks::turbo_tasks();
    let handle = tokio::runtime::Handle::current();
    tasks
        .par_iter()
        .with_max_len(1)
        .map(|tasks| {
            let _span = span.clone().entered();
            let _guard = handle.clone().enter();
            turbo_tasks_scope(turbo_tasks.clone(), || {
                let mut result = if batch.is_some() {
                    Vec::new()
                } else {
                    Vec::with_capacity(tasks.len())
                };
                for (task, meta, data) in tasks {
                    let data = select(meta, data);
                    let Some(data) = data else {
                        continue;
                    };
                    // Serialize new data
                    let value = serialize(*task, data)?;

                    if let Some(batch) = batch {
                        batch.put(
                            key_space,
                            WriteBuffer::Borrowed(IntKey::new(**task).as_ref()),
                            WriteBuffer::SmallVec(value),
                        )?;
                    } else {
                        // Store the new task data
                        result.push((*task, WriteBuffer::SmallVec(value)));
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
