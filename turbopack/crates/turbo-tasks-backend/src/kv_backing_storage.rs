use std::{
    borrow::{Borrow, Cow},
    cmp::max,
    collections::hash_map::Entry,
    sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use rayon::iter::{IndexedParallelIterator, IntoParallelIterator, ParallelIterator};
use rustc_hash::FxHashMap;
use serde::{ser::SerializeSeq, Serialize};
use tracing::Span;
use turbo_tasks::{backend::CachedTaskType, turbo_tasks_scope, KeyValuePair, SessionId, TaskId};

use crate::{
    backend::{AnyOperation, TaskDataCategory},
    backing_storage::BackingStorage,
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataUpdate},
    database::{
        key_value_database::{KeySpace, KeyValueDatabase},
        write_batch::{
            BaseWriteBatch, ConcurrentWriteBatch, SerialWriteBatch, WriteBatch, WriteBatchRef,
        },
    },
    utils::chunked_vec::ChunkedVec,
};

const POT_CONFIG: pot::Config = pot::Config::new().compatibility(pot::Compatibility::V4);

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
        meta_updates: Vec<ChunkedVec<CachedDataUpdate>>,
        data_updates: Vec<ChunkedVec<CachedDataUpdate>>,
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
                            &self.database,
                            KeySpace::TaskMeta,
                            meta_updates,
                            Some(batch),
                        );
                    });
                    s.spawn(|_| {
                        let _span = tracing::trace_span!("update task data").entered();
                        task_data_items_result = process_task_data(
                            &self.database,
                            KeySpace::TaskData,
                            data_updates,
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
                                            Cow::Borrowed(&task_type_bytes),
                                            Cow::Borrowed(&task_id.to_le_bytes()),
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
                                            Cow::Borrowed(IntKey::new(task_id).as_ref()),
                                            Cow::Borrowed(&task_type_bytes),
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
                            &self.database,
                            KeySpace::TaskMeta,
                            meta_updates,
                            None::<&T::ConcurrentWriteBatch<'_>>,
                        );
                    });
                    s.spawn(|_| {
                        task_data_items_result = process_task_data(
                            &self.database,
                            KeySpace::TaskData,
                            data_updates,
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
                                    Cow::Borrowed(&task_type_bytes),
                                    Cow::Borrowed(&task_id.to_le_bytes()),
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
                                Cow::Borrowed(IntKey::new(*task_id).as_ref()),
                                value.into(),
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
                Cow::Borrowed(IntKey::new(META_KEY_NEXT_FREE_TASK_ID).as_ref()),
                Cow::Borrowed(&next_task_id.to_le_bytes()),
            )
            .with_context(|| anyhow!("Unable to write next free task id"))?;
    }
    {
        let _span = tracing::trace_span!("update session id", session_id = ?session_id).entered();
        batch
            .put(
                KeySpace::Infra,
                Cow::Borrowed(IntKey::new(META_KEY_SESSION_ID).as_ref()),
                Cow::Borrowed(&session_id.to_le_bytes()),
            )
            .with_context(|| anyhow!("Unable to write next session id"))?;
    }
    {
        let _span =
            tracing::trace_span!("update operations", operations = operations.len()).entered();
        let operations = POT_CONFIG
            .serialize(&operations)
            .with_context(|| anyhow!("Unable to serialize operations"))?;
        batch
            .put(
                KeySpace::Infra,
                Cow::Borrowed(IntKey::new(META_KEY_OPERATIONS).as_ref()),
                operations.into(),
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

type SerializedTasks = Vec<Vec<(TaskId, Vec<u8>)>>;
type TaskUpdates =
    FxHashMap<CachedDataItemKey, (Option<CachedDataItemValue>, Option<CachedDataItemValue>)>;

fn process_task_data<'a, B: ConcurrentWriteBatch<'a> + Send + Sync>(
    database: &(impl KeyValueDatabase + Sync),
    key_space: KeySpace,
    updates: Vec<ChunkedVec<CachedDataUpdate>>,
    batch: Option<&B>,
) -> Result<SerializedTasks> {
    let span = Span::current();
    let turbo_tasks = turbo_tasks::turbo_tasks();
    let handle = tokio::runtime::Handle::current();
    updates
        .into_par_iter()
        .with_max_len(1)
        .map(|updates| {
            let _span = span.clone().entered();
            let _guard = handle.clone().enter();
            turbo_tasks_scope(turbo_tasks.clone(), || {
                let mut task_updates: FxHashMap<TaskId, TaskUpdates> =
                    FxHashMap::with_capacity_and_hasher(updates.len(), Default::default());

                {
                    let span = tracing::trace_span!(
                        "organize updates",
                        updates = updates.len(),
                        tasks = tracing::field::Empty
                    )
                    .entered();

                    // The store the last task data and the last value as pointers to avoid looking
                    // them up in the map again. Everytime we modify the map the pointers are
                    // updated, so we never have a dangling pointer.
                    let mut current_task_data: Option<*mut TaskUpdates> = None;
                    let mut last_value: Option<*mut (
                        Option<CachedDataItemValue>,
                        Option<CachedDataItemValue>,
                    )> = None;

                    // Organize the updates by task
                    for update in updates.into_iter() {
                        match update {
                            CachedDataUpdate::Task { task } => {
                                current_task_data = Some(task_updates.entry(task).or_default())
                            }
                            CachedDataUpdate::New { item } => {
                                let data = current_task_data
                                    .expect("Task update must be before data updates");
                                // Safety: task_updates are not modified while we hold this pointer.
                                // We update the pointer every time we update the map.
                                let data = unsafe { &mut *data };
                                let (key, new_value) = item.into_key_and_value();
                                match data.entry(key) {
                                    Entry::Occupied(mut entry) => {
                                        let entry = entry.get_mut();
                                        entry.1 = Some(new_value);
                                        last_value = Some(entry);
                                    }
                                    Entry::Vacant(entry) => {
                                        last_value = Some(entry.insert((None, Some(new_value))));
                                    }
                                }
                            }
                            CachedDataUpdate::Removed { old_item } => {
                                let data = current_task_data
                                    .expect("Task update must be before data updates");
                                // Safety: task_updates are not modified while we hold this pointer.
                                // We update the pointer every time we update the map.
                                let data = unsafe { &mut *data };
                                let (key, old_value) = old_item.into_key_and_value();
                                match data.entry(key) {
                                    Entry::Occupied(mut entry) => {
                                        let entry = entry.get_mut();
                                        entry.1 = None;
                                        last_value = Some(entry);
                                    }
                                    Entry::Vacant(entry) => {
                                        last_value = Some(entry.insert((Some(old_value), None)));
                                    }
                                }
                            }
                            CachedDataUpdate::Replace1 { old_item } => {
                                let data = current_task_data
                                    .expect("Task update must be before data updates");
                                // Safety: task_updates are not modified while we hold this pointer.
                                // We update the pointer every time we update the map.
                                let data = unsafe { &mut *data };
                                let (key, old_value) = old_item.into_key_and_value();
                                match data.entry(key) {
                                    Entry::Occupied(mut entry) => {
                                        last_value = Some(entry.get_mut());
                                    }
                                    Entry::Vacant(entry) => {
                                        last_value = Some(entry.insert((Some(old_value), None)));
                                    }
                                }
                            }
                            CachedDataUpdate::Replace2 { value: new_value } => {
                                let last_value =
                                    last_value.expect("Task update must be before data updates");
                                // Safety: the inner map of task_updates is not modified while we
                                // hold this pointer. We update the
                                // pointer every time we update the map.
                                let last_value = unsafe { &mut *last_value };
                                last_value.1 = Some(new_value);
                            }
                        }
                    }

                    span.record("tasks", task_updates.len());
                }

                {
                    let span = tracing::trace_span!(
                        "dedupe updates",
                        before = task_updates.len(),
                        after = tracing::field::Empty
                    )
                    .entered();

                    // Remove no-op task updates (so we have less tasks to restore)
                    task_updates.retain(|_, data| {
                        data.retain(|_, (old_value, value)| *old_value != *value);
                        !data.is_empty()
                    });

                    span.record("after", task_updates.len());
                }

                let tx = database.begin_read_transaction()?;

                let span = tracing::trace_span!(
                    "restore, update and serialize",
                    tasks = task_updates.len(),
                    restored_tasks = tracing::field::Empty
                )
                .entered();
                let mut restored_tasks = 0;

                // Restore the old task data, apply the updates and serialize the new data
                let mut tasks = if batch.is_some() {
                    Vec::new()
                } else {
                    Vec::with_capacity(task_updates.len())
                };
                for (task, mut updates) in task_updates {
                    // Restore the old task data
                    if let Some(old_data) =
                        database.get(&tx, key_space, IntKey::new(*task).as_ref())?
                    {
                        let old_data: Vec<CachedDataItem> = match POT_CONFIG
                            .deserialize(old_data.borrow())
                        {
                            Ok(d) => d,
                            Err(_) => serde_path_to_error::deserialize(
                                &mut pot_de_symbol_list()
                                    .deserializer_for_slice(old_data.borrow())?,
                            )
                            .with_context(|| {
                                let old_data: &[u8] = old_data.borrow();
                                anyhow!("Unable to deserialize old value of {task}: {old_data:?}")
                            })?,
                        };

                        // Reserve capacity to avoid rehashing later
                        updates.reserve(old_data.len());

                        // Apply the old data to the updates, so updates includes the whole data
                        for item in old_data.into_iter() {
                            let (key, value) = item.into_key_and_value();
                            updates.entry(key).or_insert((None, Some(value)));
                        }
                        restored_tasks += 1;
                    }

                    // Remove all deletions
                    updates.retain(|_, (_, value)| value.is_some());

                    // Serialize new data
                    let value = serialize(task, &mut updates)?;

                    if let Some(batch) = batch {
                        batch.put(
                            key_space,
                            Cow::Borrowed(IntKey::new(*task).as_ref()),
                            Cow::Owned(value),
                        )?;
                    } else {
                        // Store the new task data
                        tasks.push((task, value));
                    }
                }

                span.record("restored_tasks", restored_tasks);
                Ok(tasks)
            })
        })
        .collect::<Result<Vec<_>>>()
}

fn serialize(task: TaskId, data: &mut TaskUpdates) -> Result<Vec<u8>> {
    Ok(
        match POT_CONFIG.serialize(&SerializeLikeVecOfCachedDataItem(data)) {
            #[cfg(not(feature = "verify_serialization"))]
            Ok(value) => value,
            _ => {
                let mut error = Ok(());
                data.retain(|key, (_, value)| {
                    let mut buf = Vec::<u8>::new();
                    let mut symbol_map = pot_ser_symbol_map();
                    let mut serializer = symbol_map.serializer_for(&mut buf).unwrap();
                    if let Err(err) = serde_path_to_error::serialize(
                        &SerializeLikeCachedDataItem(
                            key,
                            value
                                .as_ref()
                                .expect("serialize data must not contain None values"),
                        ),
                        &mut serializer,
                    ) {
                        if key.is_optional() {
                            #[cfg(feature = "verify_serialization")]
                            println!(
                                "Skipping non-serializable optional item: {key:?} = {value:?}"
                            );
                        } else {
                            error = Err(err).context({
                                anyhow!(
                                    "Unable to serialize data item for {task}: {key:?} = \
                                     {value:#?}"
                                )
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
                                    "Data item would not be deserializable {task}: \
                                     {err:?}\n{key:?} = {value:#?}"
                                );
                                return false;
                            }
                        }
                        true
                    }
                });
                error?;

                POT_CONFIG
                    .serialize(&SerializeLikeVecOfCachedDataItem(data))
                    .with_context(|| {
                        anyhow!("Unable to serialize data items for {task}: {data:#?}")
                    })?
            }
        },
    )
}

struct SerializeLikeVecOfCachedDataItem<'l>(&'l TaskUpdates);

impl Serialize for SerializeLikeVecOfCachedDataItem<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let map = &self.0;
        let mut seq = serializer.serialize_seq(Some(map.len()))?;
        for (key, (_, value)) in map.iter() {
            let value = value
                .as_ref()
                .expect("SerializeLikeVecOfCachedDataItem must not contain None values");
            seq.serialize_element(&SerializeLikeCachedDataItem(key, value))?;
        }
        seq.end()
    }
}

struct SerializeLikeCachedDataItem<'l>(&'l CachedDataItemKey, &'l CachedDataItemValue);

impl Serialize for SerializeLikeCachedDataItem<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        // TODO add CachedDataItemRef to avoid cloning
        let item = CachedDataItem::from_key_and_value(*self.0, self.1.clone());
        item.serialize(serializer)
    }
}
