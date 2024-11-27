use turbo_tasks::TaskId;

use crate::{
    data::{CachedDataItemKey, CachedDataItemValue, CachedDataUpdate},
    utils::{chunked_vec::ChunkedVec, sharded::Sharded},
};

pub struct PersistedStorageLog {
    data: Sharded<ChunkedVec<CachedDataUpdate>>,
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
        let update = CachedDataUpdate {
            task,
            key,
            old_value,
            value: new_value,
        };
        self.data.lock(&task).push(update);
    }

    pub fn push_batch(
        &self,
        task: TaskId,
        updates: impl IntoIterator<
            Item = (
                CachedDataItemKey,
                Option<CachedDataItemValue>,
                Option<CachedDataItemValue>,
            ),
        >,
    ) {
        let updates = updates
            .into_iter()
            .map(|(key, old_value, value)| CachedDataUpdate {
                task,
                key,
                old_value,
                value,
            });
        self.data.lock(&task).extend(updates);
    }

    pub fn take(&self) -> Vec<ChunkedVec<CachedDataUpdate>> {
        self.data.take()
    }
}
