mod extended_key;

use std::{
    collections::{hash_map::Entry, HashMap},
    error::Error,
    fs::create_dir_all,
    path::Path,
    sync::Arc,
    thread::available_parallelism,
    time::Instant,
};

use anyhow::{anyhow, Context, Result};
use lmdb::{Database, DatabaseFlags, Environment, EnvironmentFlags, Transaction, WriteFlags};
use tracing::Span;
use turbo_tasks::{backend::CachedTaskType, KeyValuePair, TaskId};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    backing_storage::BackingStorage,
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataUpdate},
    utils::chunked_vec::ChunkedVec,
};

const META_KEY_OPERATIONS: u32 = 0;
const META_KEY_NEXT_FREE_TASK_ID: u32 = 1;

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

fn as_u32<E: Error + Send + Sync + 'static>(result: Result<&[u8], E>) -> Result<u32> {
    let bytes = result?;
    let n = bytes.try_into().map(u32::from_be_bytes)?;
    Ok(n)
}

pub struct LmdbBackingStorage {
    env: Environment,
    infra_db: Database,
    data_db: Database,
    meta_db: Database,
    forward_task_cache_db: Database,
    reverse_task_cache_db: Database,
}

impl LmdbBackingStorage {
    pub fn new(path: &Path) -> Result<Self> {
        create_dir_all(path)?;
        println!("opening lmdb {:?}", path);
        let env = Environment::new()
            .set_flags(
                EnvironmentFlags::WRITE_MAP
                    | EnvironmentFlags::NO_META_SYNC
                    | EnvironmentFlags::NO_TLS,
            )
            .set_max_readers((available_parallelism().map_or(16, |v| v.get()) * 8) as u32)
            .set_max_dbs(5)
            .set_map_size(40 * 1024 * 1024 * 1024)
            .open(path)?;
        let infra_db = env.create_db(Some("infra"), DatabaseFlags::INTEGER_KEY)?;
        let data_db = env.create_db(Some("data"), DatabaseFlags::INTEGER_KEY)?;
        let meta_db = env.create_db(Some("meta"), DatabaseFlags::INTEGER_KEY)?;
        let forward_task_cache_db =
            env.create_db(Some("forward_task_cache"), DatabaseFlags::empty())?;
        let reverse_task_cache_db =
            env.create_db(Some("reverse_task_cache"), DatabaseFlags::INTEGER_KEY)?;
        Ok(Self {
            env,
            infra_db,
            data_db,
            meta_db,
            forward_task_cache_db,
            reverse_task_cache_db,
        })
    }

    fn db(&self, category: TaskDataCategory) -> Database {
        match category {
            TaskDataCategory::Meta => self.meta_db,
            TaskDataCategory::Data => self.data_db,
            _ => unreachable!(),
        }
    }
}

impl BackingStorage for LmdbBackingStorage {
    fn next_free_task_id(&self) -> TaskId {
        fn get(this: &LmdbBackingStorage) -> Result<u32> {
            let tx = this.env.begin_rw_txn()?;
            let next_free_task_id =
                as_u32(tx.get(this.infra_db, &IntKey::new(META_KEY_NEXT_FREE_TASK_ID)))?;
            Ok(next_free_task_id)
        }
        TaskId::from(get(self).unwrap_or(1))
    }

    fn uncompleted_operations(&self) -> Vec<AnyOperation> {
        fn get(this: &LmdbBackingStorage) -> Result<Vec<AnyOperation>> {
            let tx = this.env.begin_ro_txn()?;
            let operations = tx.get(this.infra_db, &IntKey::new(META_KEY_OPERATIONS))?;
            let operations = pot::from_slice(operations)?;
            Ok(operations)
        }
        get(self).unwrap_or_default()
    }

    #[tracing::instrument(level = "trace", skip_all, fields(operations = operations.len(), task_cache_updates = task_cache_updates.len(), data_updates = data_updates.len()))]
    fn save_snapshot(
        &self,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: ChunkedVec<(Arc<CachedTaskType>, TaskId)>,
        meta_updates: ChunkedVec<CachedDataUpdate>,
        data_updates: ChunkedVec<CachedDataUpdate>,
    ) -> Result<()> {
        println!(
            "Persisting {} operations, {} task cache updates, {} meta updates, {} data updates...",
            operations.len(),
            task_cache_updates.len(),
            meta_updates.len(),
            data_updates.len()
        );
        let start = Instant::now();
        let mut op_count = 0;
        let mut tx = self.env.begin_rw_txn()?;
        let mut task_meta_items_result = Ok(Vec::new());
        let mut task_data_items_result = Ok(Vec::new());

        turbo_tasks::scope(|s| {
            // Start organizing the updates in parallel
            s.spawn(|_| {
                let task_meta_updates = {
                    let _span =
                        tracing::trace_span!("organize task meta", updates = meta_updates.len())
                            .entered();
                    organize_task_data(meta_updates)
                };
                let items_result = {
                    let _span =
                        tracing::trace_span!("restore task meta", tasks = task_meta_updates.len())
                            .entered();
                    restore_task_data(self, self.meta_db, task_meta_updates)
                };
                task_meta_items_result = items_result.and_then(|items| {
                    let _span = tracing::trace_span!("serialize task meta").entered();
                    serialize_task_data(items)
                });
            });
            s.spawn(|_| {
                let task_data_updates = {
                    let _span =
                        tracing::trace_span!("organize task data", updates = data_updates.len())
                            .entered();
                    organize_task_data(data_updates)
                };
                let items_result = {
                    let _span =
                        tracing::trace_span!("restore task data", tasks = task_data_updates.len())
                            .entered();
                    restore_task_data(self, self.data_db, task_data_updates)
                };
                task_data_items_result = items_result.and_then(|items| {
                    let _span = tracing::trace_span!("serialize task data").entered();
                    serialize_task_data(items)
                });
            });

            let mut next_task_id =
                as_u32(tx.get(self.infra_db, &IntKey::new(META_KEY_NEXT_FREE_TASK_ID)))
                    .unwrap_or(1);
            {
                let _span =
                    tracing::trace_span!("update task cache", items = task_cache_updates.len())
                        .entered();
                for (task_type, task_id) in task_cache_updates.iter() {
                    let task_id = **task_id;
                    let task_type_bytes = pot::to_vec(&**task_type).with_context(|| {
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
                    extended_key::put(
                        &mut tx,
                        self.forward_task_cache_db,
                        &task_type_bytes,
                        &task_id.to_be_bytes(),
                        WriteFlags::empty(),
                    )
                    .with_context(|| {
                        anyhow!("Unable to write task cache {task_type:?} => {task_id}")
                    })?;
                    tx.put(
                        self.reverse_task_cache_db,
                        &IntKey::new(task_id),
                        &task_type_bytes,
                        WriteFlags::empty(),
                    )
                    .with_context(|| {
                        anyhow!("Unable to write task cache {task_id} => {task_type:?}")
                    })?;
                    op_count += 2;
                    next_task_id = next_task_id.max(task_id + 1);
                }
                tx.put(
                    self.infra_db,
                    &IntKey::new(META_KEY_NEXT_FREE_TASK_ID),
                    &next_task_id.to_be_bytes(),
                    WriteFlags::empty(),
                )
                .with_context(|| anyhow!("Unable to write next free task id"))?;
            }
            {
                let _span =
                    tracing::trace_span!("update operations", operations = operations.len())
                        .entered();
                let operations = pot::to_vec(&operations)
                    .with_context(|| anyhow!("Unable to serialize operations"))?;
                tx.put(
                    self.infra_db,
                    &IntKey::new(META_KEY_OPERATIONS),
                    &operations,
                    WriteFlags::empty(),
                )
                .with_context(|| anyhow!("Unable to write operations"))?;
                op_count += 2;
            }

            anyhow::Ok(())
        })?;

        for (db, task_items) in [
            (self.meta_db, task_meta_items_result?),
            (self.data_db, task_data_items_result?),
        ] {
            {
                let _span =
                    tracing::trace_span!("update task data", tasks = task_items.len()).entered();
                for (task_id, value) in task_items {
                    tx.put(db, &IntKey::new(*task_id), &value, WriteFlags::empty())
                        .with_context(|| anyhow!("Unable to write data items for {task_id}"))?;
                    op_count += 1;
                }
            }
        }
        {
            let _span = tracing::trace_span!("commit").entered();
            tx.commit()
                .with_context(|| anyhow!("Unable to commit operations"))?;
        }
        println!(
            "Persisted {op_count} db entries after {:?}",
            start.elapsed()
        );
        Ok(())
    }

    fn forward_lookup_task_cache(&self, task_type: &CachedTaskType) -> Option<TaskId> {
        let span = tracing::trace_span!("forward lookup task cache", key_bytes = 0usize).entered();
        fn lookup(
            this: &LmdbBackingStorage,
            task_type: &CachedTaskType,
            span: &Span,
        ) -> Result<Option<TaskId>> {
            let tx = this.env.begin_ro_txn()?;
            let task_type = pot::to_vec(task_type)?;
            span.record("key_bytes", task_type.len());
            let bytes = match extended_key::get(&tx, this.forward_task_cache_db, &task_type) {
                Ok(result) => result,
                Err(err) => {
                    if err == lmdb::Error::NotFound {
                        return Ok(None);
                    } else {
                        return Err(err.into());
                    }
                }
            };
            let bytes = bytes.try_into()?;
            let id = TaskId::from(u32::from_be_bytes(bytes));
            tx.commit()?;
            Ok(Some(id))
        }
        let id = lookup(self, task_type, &span)
            .inspect_err(|err| println!("Looking up task id for {task_type:?} failed: {err:?}"))
            .ok()??;
        Some(id)
    }

    fn reverse_lookup_task_cache(&self, task_id: TaskId) -> Option<Arc<CachedTaskType>> {
        let span = tracing::trace_span!("reverse lookup task cache", bytes = 0usize).entered();
        fn lookup(
            this: &LmdbBackingStorage,
            task_id: TaskId,
            span: &Span,
        ) -> Result<Option<Arc<CachedTaskType>>> {
            let tx = this.env.begin_ro_txn()?;
            let bytes = match tx.get(this.reverse_task_cache_db, &IntKey::new(*task_id)) {
                Ok(bytes) => bytes,
                Err(err) => {
                    if err == lmdb::Error::NotFound {
                        return Ok(None);
                    } else {
                        return Err(err.into());
                    }
                }
            };
            span.record("bytes", bytes.len());
            let result = pot::from_slice(bytes)?;
            tx.commit()?;
            Ok(Some(result))
        }
        let result = lookup(self, task_id, &span)
            .inspect_err(|err| println!("Looking up task type for {task_id} failed: {err:?}"))
            .ok()??;
        Some(result)
    }

    fn lookup_data(&self, task_id: TaskId, category: TaskDataCategory) -> Vec<CachedDataItem> {
        let span = tracing::trace_span!("restore data", bytes = 0usize, items = 0usize).entered();
        fn lookup(
            this: &LmdbBackingStorage,
            task_id: TaskId,
            category: TaskDataCategory,
            span: &Span,
        ) -> Result<Vec<CachedDataItem>> {
            let tx = this.env.begin_ro_txn()?;
            let bytes = match tx.get(this.db(category), &IntKey::new(*task_id)) {
                Ok(bytes) => bytes,
                Err(err) => {
                    if err == lmdb::Error::NotFound {
                        return Ok(Vec::new());
                    } else {
                        return Err(err.into());
                    }
                }
            };
            span.record("bytes", bytes.len());
            let result: Vec<CachedDataItem> = pot::from_slice(bytes)?;
            span.record("items", result.len());
            tx.commit()?;
            Ok(result)
        }
        lookup(self, task_id, category, &span)
            .inspect_err(|err| println!("Looking up data for {task_id} failed: {err:?}"))
            .unwrap_or_default()
    }
}

fn organize_task_data(
    updates: ChunkedVec<CachedDataUpdate>,
) -> HashMap<
    TaskId,
    HashMap<CachedDataItemKey, (Option<CachedDataItemValue>, Option<CachedDataItemValue>)>,
> {
    let mut task_updates: HashMap<
        TaskId,
        HashMap<CachedDataItemKey, (Option<CachedDataItemValue>, Option<CachedDataItemValue>)>,
    > = HashMap::new();
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
}

fn restore_task_data(
    this: &LmdbBackingStorage,
    db: Database,
    task_updates: HashMap<
        TaskId,
        HashMap<CachedDataItemKey, (Option<CachedDataItemValue>, Option<CachedDataItemValue>)>,
    >,
) -> Result<Vec<(TaskId, Vec<CachedDataItem>)>> {
    let mut result = Vec::with_capacity(task_updates.len());

    let tx = this.env.begin_ro_txn()?;
    for (task, updates) in task_updates.into_iter() {
        let mut map;
        if let Ok(old_data) = tx.get(db, &IntKey::new(*task)) {
            let old_data: Vec<CachedDataItem> = match pot::from_slice(old_data) {
                Ok(d) => d,
                Err(_) => serde_path_to_error::deserialize(
                    &mut pot::de::SymbolList::new().deserializer_for_slice(old_data)?,
                )
                .with_context(|| {
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
