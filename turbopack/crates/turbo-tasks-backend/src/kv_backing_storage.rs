use std::{
    borrow::{Borrow, Cow},
    collections::{hash_map::Entry, HashMap},
    sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use rayon::iter::{IntoParallelIterator, ParallelIterator};
use tracing::Span;
use turbo_tasks::{backend::CachedTaskType, KeyValuePair, SessionId, TaskId};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    backing_storage::BackingStorage,
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataUpdate},
    database::key_value_database::{KeySpace, KeyValueDatabase, WriteBatch},
    utils::chunked_vec::ChunkedVec,
};

const META_KEY_OPERATIONS: u32 = 0;
const META_KEY_NEXT_FREE_TASK_ID: u32 = 1;
const META_KEY_SESSION_ID: u32 = 2;

struct IntKey([u8; 4]);

impl IntKey {
    fn new(value: u32) -> Self {
        Self(value.to_be_bytes())
    }
}

impl AsRef<[u8]> for IntKey {
    fn as_ref(&self) -> &[u8] {
        &self.0
    }
}

fn as_u32(bytes: impl Borrow<[u8]>) -> Result<u32> {
    let n = u32::from_be_bytes(bytes.borrow().try_into()?);
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
            let operations = pot::from_slice(operations.borrow())?;
            Ok(operations)
        }
        get(&self.database).unwrap_or_default()
    }

    fn save_snapshot(
        &self,
        session_id: SessionId,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: Vec<ChunkedVec<(Arc<CachedTaskType>, TaskId)>>,
        meta_updates: Vec<ChunkedVec<CachedDataUpdate>>,
        data_updates: Vec<ChunkedVec<CachedDataUpdate>>,
    ) -> Result<()> {
        let span = tracing::trace_span!("save snapshot", session_id = ?session_id, operations = operations.len(), db_operation_count = tracing::field::Empty);
        let mut op_count = 0;
        let mut batch = self.database.write_batch()?;
        let mut task_meta_items_result = Ok(Vec::new());
        let mut task_data_items_result = Ok(Vec::new());

        turbo_tasks::scope(|s| {
            // Start organizing the updates in parallel
            s.spawn(|_| {
                let task_meta_updates = {
                    let _span = tracing::trace_span!(
                        "organize task meta",
                        updates = meta_updates.iter().map(|m| m.len()).sum::<usize>()
                    )
                    .entered();
                    organize_task_data(meta_updates)
                };
                let items_result = {
                    let _span = tracing::trace_span!(
                        "restore task meta",
                        tasks = task_meta_updates.iter().map(|m| m.len()).sum::<usize>()
                    )
                    .entered();
                    restore_task_data(&self.database, KeySpace::TaskMeta, task_meta_updates)
                };
                task_meta_items_result = items_result.and_then(|items| {
                    let _span = tracing::trace_span!("serialize task meta").entered();
                    serialize_task_data(items)
                });
            });
            s.spawn(|_| {
                let task_data_updates = {
                    let _span = tracing::trace_span!(
                        "organize task data",
                        updates = data_updates.iter().map(|m| m.len()).sum::<usize>()
                    )
                    .entered();
                    organize_task_data(data_updates)
                };
                let items_result = {
                    let _span = tracing::trace_span!(
                        "restore task data",
                        tasks = task_data_updates.iter().map(|m| m.len()).sum::<usize>()
                    )
                    .entered();
                    restore_task_data(&self.database, KeySpace::TaskData, task_data_updates)
                };
                task_data_items_result = items_result.and_then(|items| {
                    let _span = tracing::trace_span!("serialize task data").entered();
                    serialize_task_data(items)
                });
            });

            {
                let _span =
                    tracing::trace_span!("update session id", session_id = ?session_id).entered();
                batch
                    .put(
                        KeySpace::Infra,
                        Cow::Borrowed(IntKey::new(META_KEY_SESSION_ID).as_ref()),
                        Cow::Borrowed(&session_id.to_be_bytes()),
                    )
                    .with_context(|| anyhow!("Unable to write next session id"))?;
            }

            let mut next_task_id = match batch.get(
                KeySpace::Infra,
                IntKey::new(META_KEY_NEXT_FREE_TASK_ID).as_ref(),
            )? {
                Some(bytes) => u32::from_be_bytes(bytes.borrow().try_into()?),
                None => 1,
            };
            {
                let _span = tracing::trace_span!(
                    "update task cache",
                    items = task_cache_updates.iter().map(|m| m.len()).sum::<usize>()
                )
                .entered();
                for (task_type, task_id) in task_cache_updates.into_iter().flatten() {
                    let task_id = *task_id;
                    let task_type_bytes = pot::to_vec(&*task_type).with_context(|| {
                        anyhow!("Unable to serialize task cache key {task_type:?}")
                    })?;
                    #[cfg(feature = "verify_serialization")]
                    {
                        let deserialize: Result<CachedTaskType, _> =
                            serde_path_to_error::deserialize(
                                &mut pot::de::SymbolList::new()
                                    .deserializer_for_slice(&task_type_bytes)?,
                            );
                        if let Err(err) = deserialize {
                            println!(
                                "Task type would not be deserializable {task_id}: \
                                 {err:?}\n{task_type:#?}"
                            );
                            panic!("Task type would not be deserializable {task_id}: {err:?}");
                        }
                    }

                    batch
                        .put(
                            KeySpace::ForwardTaskCache,
                            Cow::Borrowed(&task_type_bytes),
                            Cow::Borrowed(&task_id.to_be_bytes()),
                        )
                        .with_context(|| {
                            anyhow!("Unable to write task cache {task_type:?} => {task_id}")
                        })?;
                    batch
                        .put(
                            KeySpace::ReverseTaskCache,
                            Cow::Borrowed(IntKey::new(task_id).as_ref()),
                            Cow::Borrowed(&task_type_bytes),
                        )
                        .with_context(|| {
                            anyhow!("Unable to write task cache {task_id} => {task_type:?}")
                        })?;
                    op_count += 2;
                    next_task_id = next_task_id.max(task_id + 1);
                }
                batch
                    .put(
                        KeySpace::Infra,
                        Cow::Borrowed(IntKey::new(META_KEY_NEXT_FREE_TASK_ID).as_ref()),
                        Cow::Borrowed(&next_task_id.to_be_bytes()),
                    )
                    .with_context(|| anyhow!("Unable to write next free task id"))?;
            }
            {
                let _span =
                    tracing::trace_span!("update operations", operations = operations.len())
                        .entered();
                let operations = pot::to_vec(&operations)
                    .with_context(|| anyhow!("Unable to serialize operations"))?;
                batch
                    .put(
                        KeySpace::Infra,
                        Cow::Borrowed(IntKey::new(META_KEY_OPERATIONS).as_ref()),
                        operations.into(),
                    )
                    .with_context(|| anyhow!("Unable to write operations"))?;
                op_count += 2;
            }

            anyhow::Ok(())
        })?;

        for (key_space, task_items) in [
            (KeySpace::TaskMeta, task_meta_items_result?),
            (KeySpace::TaskData, task_data_items_result?),
        ] {
            {
                let _span =
                    tracing::trace_span!("update task data", tasks = task_items.len()).entered();
                for (task_id, value) in task_items {
                    batch
                        .put(
                            key_space,
                            Cow::Borrowed(IntKey::new(*task_id).as_ref()),
                            value.into(),
                        )
                        .with_context(|| anyhow!("Unable to write data items for {task_id}"))?;
                    op_count += 1;
                }
            }
        }
        {
            let _span = tracing::trace_span!("commit").entered();
            batch
                .commit()
                .with_context(|| anyhow!("Unable to commit operations"))?;
        }
        span.record("db_operation_count", op_count);
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
            let task_type = pot::to_vec(task_type)?;
            let Some(bytes) = database.get(tx, KeySpace::ForwardTaskCache, &task_type)? else {
                return Ok(None);
            };
            let bytes = bytes.borrow().try_into()?;
            let id = TaskId::from(u32::from_be_bytes(bytes));
            Ok(Some(id))
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
            Ok(Some(pot::from_slice(bytes.borrow())?))
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
            let result: Vec<CachedDataItem> = pot::from_slice(bytes.borrow())?;
            Ok(result)
        }
        self.with_tx(tx, |tx| lookup(&self.database, tx, task_id, category))
            .inspect_err(|err| println!("Looking up data for {task_id} failed: {err:?}"))
            .unwrap_or_default()
    }
}

type OrganizedTaskData = HashMap<
    TaskId,
    HashMap<CachedDataItemKey, (Option<CachedDataItemValue>, Option<CachedDataItemValue>)>,
>;
type ShardedOrganizedTaskData = Vec<OrganizedTaskData>;

fn organize_task_data(updates: Vec<ChunkedVec<CachedDataUpdate>>) -> ShardedOrganizedTaskData {
    let span = Span::current();
    updates
        .into_par_iter()
        .map(|updates| {
            let _span = span.clone().entered();
            let mut task_updates: OrganizedTaskData = HashMap::new();
            for CachedDataUpdate {
                task,
                key,
                value,
                old_value,
            } in updates.into_iter()
            {
                let data = task_updates.entry(task).or_default();
                match data.entry(key) {
                    Entry::Occupied(mut entry) => {
                        entry.get_mut().1 = value;
                    }
                    Entry::Vacant(entry) => {
                        entry.insert((old_value, value));
                    }
                }
            }
            task_updates.retain(|_, data| {
                data.retain(|_, (old_value, value)| *old_value != *value);
                !data.is_empty()
            });
            task_updates
        })
        .collect()
}

fn restore_task_data(
    database: &impl KeyValueDatabase,
    key_space: KeySpace,
    task_updates: ShardedOrganizedTaskData,
) -> Result<Vec<(TaskId, Vec<CachedDataItem>)>> {
    let mut result = Vec::with_capacity(task_updates.iter().map(|m| m.len()).sum());

    let tx = database.begin_read_transaction()?;
    for (task, updates) in task_updates.into_iter().flatten() {
        let mut map;
        if let Some(old_data) = database.get(&tx, key_space, IntKey::new(*task).as_ref())? {
            let old_data: Vec<CachedDataItem> = match pot::from_slice(old_data.borrow()) {
                Ok(d) => d,
                Err(_) => serde_path_to_error::deserialize(
                    &mut pot::de::SymbolList::new().deserializer_for_slice(old_data.borrow())?,
                )
                .with_context(|| {
                    let old_data: &[u8] = old_data.borrow();
                    anyhow!("Unable to deserialize old value of {task}: {old_data:?}")
                })?,
            };
            map = old_data
                .into_iter()
                .map(|item| item.into_key_and_value())
                .collect();
        } else {
            map = HashMap::new();
        }
        for (key, (_, value)) in updates {
            if let Some(value) = value {
                map.insert(key, value);
            } else {
                map.remove(&key);
            }
        }
        let vec = map
            .into_iter()
            .map(|(key, value)| CachedDataItem::from_key_and_value(key, value))
            .collect();
        result.push((task, vec));
    }

    Ok(result)
}

fn serialize_task_data(
    tasks: Vec<(TaskId, Vec<CachedDataItem>)>,
) -> Result<Vec<(TaskId, Vec<u8>)>> {
    tasks
        .into_iter()
        .map(|(task_id, mut data)| {
            let value = match pot::to_vec(&data) {
                #[cfg(not(feature = "verify_serialization"))]
                Ok(value) => value,
                _ => {
                    let mut error = Ok(());
                    data.retain(|item| {
                        let mut buf = Vec::<u8>::new();
                        let mut symbol_map = pot::ser::SymbolMap::new();
                        let mut serializer = symbol_map.serializer_for(&mut buf).unwrap();
                        if let Err(err) = serde_path_to_error::serialize(item, &mut serializer) {
                            if item.is_optional() {
                                #[cfg(feature = "verify_serialization")]
                                println!("Skipping non-serializable optional item: {item:?}");
                            } else {
                                error = Err(err).context({
                                    anyhow!(
                                        "Unable to serialize data item for {task_id}: {item:#?}"
                                    )
                                });
                            }
                            false
                        } else {
                            #[cfg(feature = "verify_serialization")]
                            {
                                let deserialize: Result<CachedDataItem, _> =
                                    serde_path_to_error::deserialize(
                                        &mut pot::de::SymbolList::new()
                                            .deserializer_for_slice(&buf)
                                            .unwrap(),
                                    );
                                if let Err(err) = deserialize {
                                    println!(
                                        "Data item would not be deserializable {task_id}: \
                                         {err:?}\n{item:#?}"
                                    );
                                    return false;
                                }
                            }
                            true
                        }
                    });
                    error?;

                    pot::to_vec(&data).with_context(|| {
                        anyhow!("Unable to serialize data items for {task_id}: {data:#?}")
                    })?
                }
            };
            Ok((task_id, value))
        })
        .collect()
}
