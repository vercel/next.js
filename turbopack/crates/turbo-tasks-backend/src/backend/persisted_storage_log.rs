use turbo_tasks::{KeyValuePair, TaskId};

use crate::{
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CachedDataUpdate},
    utils::{chunked_vec::ChunkedVec, sharded::Sharded},
};

#[derive(Default)]
struct ShardData {
    last_task: Option<TaskId>,
    data: ChunkedVec<CachedDataUpdate>,
}

impl ShardData {
    fn set_task(&mut self, task: TaskId) {
        if self.last_task != Some(task) {
            self.data.push(CachedDataUpdate::Task { task });
            self.last_task = Some(task);
        }
    }
}

pub struct PersistedStorageLog {
    data: Sharded<ShardData>,
}

impl PersistedStorageLog {
    pub fn new(shard_amount: usize) -> Self {
        Self {
            data: Sharded::new(shard_amount),
        }
    }

    pub fn push(
        &self,
        task: TaskId,
        key: CachedDataItemKey,
        old_value: Option<CachedDataItemValue>,
        new_value: Option<CachedDataItemValue>,
    ) {
        let mut guard = self.data.lock(task);
        guard.set_task(task);
        match (old_value, new_value) {
            (None, None) => {}
            (None, Some(new_value)) => guard.data.push(CachedDataUpdate::New {
                item: CachedDataItem::from_key_and_value(key, new_value),
            }),
            (Some(old_value), None) => guard.data.push(CachedDataUpdate::Removed {
                old_item: CachedDataItem::from_key_and_value(key, old_value),
            }),
            (Some(old_value), Some(new_value)) => {
                guard.data.push(CachedDataUpdate::Replace1 {
                    old_item: CachedDataItem::from_key_and_value(key, old_value),
                });
                guard
                    .data
                    .push(CachedDataUpdate::Replace2 { value: new_value });
            }
        }
    }

    pub fn push_batch_insert(
        &self,
        task: TaskId,
        updates: impl IntoIterator<Item = CachedDataItem>,
    ) {
        let updates = updates
            .into_iter()
            .map(|item| CachedDataUpdate::New { item });
        let mut guard = self.data.lock(task);
        guard.set_task(task);
        guard.data.extend(updates);
    }

    pub fn take(&self) -> Vec<ChunkedVec<CachedDataUpdate>> {
        self.data.take(|shard| shard.data)
    }
}
