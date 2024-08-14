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
use turbo_tasks::{backend::CachedTaskType, KeyValuePair, TaskId};

use crate::{
    backend::AnyOperation,
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
    meta_db: Database,
    data_db: Database,
    forward_task_cache_db: Database,
    reverse_task_cache_db: Database,
}

impl LmdbBackingStorage {
    pub fn new(path: &Path) -> Result<Self> {
        create_dir_all(path)?;
        println!("opening lmdb {:?}", path);
        let env = Environment::new()
            .set_flags(EnvironmentFlags::WRITE_MAP | EnvironmentFlags::NO_META_SYNC)
            .set_max_readers((available_parallelism().map_or(16, |v| v.get()) * 8) as u32)
            .set_max_dbs(4)
            .set_map_size(20 * 1024 * 1024 * 1024)
            .open(path)?;
        let meta_db = env.create_db(Some("meta"), DatabaseFlags::INTEGER_KEY)?;
        let data_db = env.create_db(Some("data"), DatabaseFlags::INTEGER_KEY)?;
        let forward_task_cache_db =
            env.create_db(Some("forward_task_cache"), DatabaseFlags::empty())?;
        let reverse_task_cache_db =
            env.create_db(Some("reverse_task_cache"), DatabaseFlags::INTEGER_KEY)?;
        Ok(Self {
            env,
            meta_db,
            data_db,
            forward_task_cache_db,
            reverse_task_cache_db,
        })
    }
}

impl BackingStorage for LmdbBackingStorage {
    fn next_free_task_id(&self) -> TaskId {
        fn get(this: &LmdbBackingStorage) -> Result<u32> {
            let tx = this.env.begin_rw_txn()?;
            let next_free_task_id =
                as_u32(tx.get(this.meta_db, &IntKey::new(META_KEY_NEXT_FREE_TASK_ID)))?;
            Ok(next_free_task_id)
        }
        TaskId::from(get(self).unwrap_or(1))
    }

    fn uncompleted_operations(&self) -> Vec<AnyOperation> {
        fn get(this: &LmdbBackingStorage) -> Result<Vec<AnyOperation>> {
            let tx = this.env.begin_ro_txn()?;
            let operations = tx.get(this.meta_db, &IntKey::new(META_KEY_OPERATIONS))?;
            let operations = bincode::deserialize(operations)?;
            Ok(operations)
        }
        get(self).unwrap_or_default()
    }

    fn save_snapshot(
        &self,
        operations: Vec<Arc<AnyOperation>>,
        task_cache_updates: ChunkedVec<(Arc<CachedTaskType>, TaskId)>,
        data_updates: ChunkedVec<CachedDataUpdate>,
    ) -> Result<()> {
        println!(
            "Persisting {} operations, {} task cache updates, {} data updates...",
            operations.len(),
            task_cache_updates.len(),
            data_updates.len()
        );
        let start = Instant::now();
        let mut op_count = 0;
        let mut tx = self.env.begin_rw_txn()?;
        let mut next_task_id =
            as_u32(tx.get(self.meta_db, &IntKey::new(META_KEY_NEXT_FREE_TASK_ID))).unwrap_or(1);
        for (task_type, task_id) in task_cache_updates.iter() {
            let task_id = **task_id;
            let task_type_bytes = bincode::serialize(&task_type)
                .with_context(|| anyhow!("Unable to serialize task cache key {task_type:?}"))?;
            extended_key::put(
                &mut tx,
                self.forward_task_cache_db,
                &task_type_bytes,
                &task_id.to_be_bytes(),
                WriteFlags::empty(),
            )
            .with_context(|| anyhow!("Unable to write task cache {task_type:?} => {task_id}"))?;
            tx.put(
                self.reverse_task_cache_db,
                &IntKey::new(task_id),
                &task_type_bytes,
                WriteFlags::empty(),
            )
            .with_context(|| anyhow!("Unable to write task cache {task_id} => {task_type:?}"))?;
            op_count += 2;
            next_task_id = next_task_id.max(task_id + 1);
        }
        tx.put(
            self.meta_db,
            &IntKey::new(META_KEY_NEXT_FREE_TASK_ID),
            &next_task_id.to_be_bytes(),
            WriteFlags::empty(),
        )
        .with_context(|| anyhow!("Unable to write next free task id"))?;
        let operations = bincode::serialize(&operations)?;
        tx.put(
            self.meta_db,
            &IntKey::new(META_KEY_OPERATIONS),
            &operations,
            WriteFlags::empty(),
        )
        .with_context(|| anyhow!("Unable to write operations"))?;
        op_count += 2;

        let mut updated_items: HashMap<TaskId, HashMap<CachedDataItemKey, CachedDataItemValue>> =
            HashMap::new();
        for CachedDataUpdate { task, key, value } in data_updates.into_iter() {
            let data = match updated_items.entry(task) {
                Entry::Occupied(entry) => entry.into_mut(),
                Entry::Vacant(entry) => {
                    let mut map = HashMap::new();
                    if let Ok(old_data) = tx.get(self.data_db, &IntKey::new(*task)) {
                        let old_data: Vec<CachedDataItem> = bincode::deserialize(old_data)?;
                        for item in old_data {
                            let (key, value) = item.into_key_and_value();
                            map.insert(key, value);
                        }
                    }
                    entry.insert(map)
                }
            };
            if let Some(value) = value {
                data.insert(key, value);
            } else {
                data.remove(&key);
            }
        }
        for (task_id, data) in updated_items {
            let vec: Vec<CachedDataItem> = data
                .into_iter()
                .map(|(key, value)| CachedDataItem::from_key_and_value(key, value))
                .collect();
            let value = bincode::serialize(&vec).with_context(|| {
                anyhow!("Unable to serialize data items for {task_id}: {vec:#?}")
            })?;
            tx.put(
                self.data_db,
                &IntKey::new(*task_id),
                &value,
                WriteFlags::empty(),
            )
            .with_context(|| anyhow!("Unable to write data items for {task_id}"))?;
            op_count += 1;
        }
        tx.commit()
            .with_context(|| anyhow!("Unable to commit operations"))?;
        println!(
            "Persisted {op_count} db entries after {:?}",
            start.elapsed()
        );
        Ok(())
    }

    fn forward_lookup_task_cache(&self, task_type: &CachedTaskType) -> Option<TaskId> {
        let tx = self.env.begin_ro_txn().ok()?;
        let task_type = bincode::serialize(task_type).ok()?;
        let result = extended_key::get(&tx, self.forward_task_cache_db, &task_type)
            .ok()
            .and_then(|v| v.try_into().ok())
            .map(|v| TaskId::from(u32::from_be_bytes(v)));
        tx.commit().ok()?;
        result
    }

    fn reverse_lookup_task_cache(&self, task_id: TaskId) -> Option<Arc<CachedTaskType>> {
        let tx = self.env.begin_ro_txn().ok()?;
        let result = tx
            .get(self.reverse_task_cache_db, &(*task_id).to_be_bytes())
            .ok()
            .and_then(|v| v.try_into().ok())
            .and_then(|v: [u8; 4]| bincode::deserialize(&v).ok());
        tx.commit().ok()?;
        result
    }

    fn lookup_data(&self, task_id: TaskId) -> Vec<CachedDataItem> {
        fn lookup(this: &LmdbBackingStorage, task_id: TaskId) -> Result<Vec<CachedDataItem>> {
            let tx = this.env.begin_ro_txn()?;
            let bytes = match tx.get(this.data_db, &IntKey::new(*task_id)) {
                Ok(bytes) => bytes,
                Err(err) => {
                    if err == lmdb::Error::NotFound {
                        return Ok(Vec::new());
                    } else {
                        return Err(err.into());
                    }
                }
            };
            let result = bincode::deserialize(bytes)?;
            tx.commit()?;
            Ok(result)
        }
        let result = lookup(self, task_id)
            .inspect_err(|err| println!("Looking up data for {task_id} failed: {err:?}"))
            .unwrap_or_default();
        result
    }
}
