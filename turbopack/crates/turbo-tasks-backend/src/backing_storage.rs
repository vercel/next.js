use std::cmp::max;

use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{
    DynTaskInputs, RawVc, TaskId, backend::CachedTaskType, macro_helpers::NativeFunction,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

pub type TaskTypeHash = [u8; 8];

/// A single item yielded by the snapshot iterator during persistence: either a put (persist a
/// modified task's meta/data + optionally register a new task's type) or a delete (tombstone a
/// GC-collected task's on-disk copy). Both ride the one iterator `save_snapshot` consumes, so
/// tombstones are applied in the same commit and batch as the puts.
pub enum SnapshotItem {
    Put {
        task_id: TaskId,
        /// Serialized task meta data, if modified
        meta: Option<TurboBincodeBuffer>,
        /// Serialized task data, if modified
        data: Option<TurboBincodeBuffer>,
        /// Task type for new tasks that need to be added to the task cache
        task_type_hash: Option<TaskTypeHash>,
    },
    // Constructed by the GC pass that emits `Delete` for soft-deleted tasks, which lands in a
    // later PR in the stack.
    #[allow(dead_code)]
    Delete {
        task_id: TaskId,
        /// The deleted task's `TaskCache` key. Always present: only persistent tasks are
        /// collected, and those always have a task type.
        task_type_hash: TaskTypeHash,
    },
}

impl SnapshotItem {
    /// The task this item persists or tombstones. (Currently only used by tests, which assert on
    /// the id of items yielded by the snapshot iterator.)
    #[cfg(test)]
    pub fn task_id(&self) -> TaskId {
        match self {
            SnapshotItem::Put { task_id, .. } | SnapshotItem::Delete { task_id, .. } => *task_id,
        }
    }
}

/// Computes a deterministic 64-bit hash of a CachedTaskType for use as a TaskCache key.
///
/// This encodes the task type directly to a hasher, avoiding intermediate buffer allocation.
/// The encoding is deterministic (function IDs from registry, bincode argument encoding).
pub fn compute_task_type_hash(task_type: &CachedTaskType) -> TaskTypeHash {
    let mut hasher = Xxh3Hash64Hasher::new();
    task_type.hash_encode(&mut hasher);
    let hash = hasher.finish();
    if cfg!(feature = "verify_serialization") {
        hasher = Xxh3Hash64Hasher::new();
        task_type.hash_encode(&mut hasher);
        let hash2 = hasher.finish();
        assert_eq!(
            hash, hash2,
            "Hashing TaskType twice was non-deterministic: \n{:?}\ngot hashes {} != {}",
            task_type, hash, hash2
        );
    }
    hash.to_le_bytes()
}

/// Computes a deterministic 64-bit hash from task type components for use as a TaskCache key.
///
/// Like [`compute_task_type_hash`], but works with borrowed components so the caller does not need
/// to construct (and box-allocate) a full [`CachedTaskType`] first.
pub fn compute_task_type_hash_from_components(
    native_fn: &'static NativeFunction,
    this: Option<RawVc>,
    arg: &dyn DynTaskInputs,
) -> TaskTypeHash {
    let mut hasher = Xxh3Hash64Hasher::new();
    CachedTaskType::hash_encode_components(native_fn, this, arg, &mut hasher);
    hasher.finish().to_le_bytes()
}

#[derive(Copy, Clone, Debug, Default)]
pub struct SnapshotMeta {
    pub data_items: usize,
    pub meta_items: usize,
    pub task_cache_items: usize,
    /// Physical on-disk bytes written by the commit.
    pub bytes_written: u64,
    /// Physical on-disk bytes of files removed by the commit.
    pub bytes_deleted: u64,
    pub max_next_task_id: u32,
}

impl SnapshotMeta {
    /// Merge two snapshots, summing the counts and `max`'ing the task id
    pub fn merge(&self, rhs: Self) -> Self {
        Self {
            data_items: self.data_items + rhs.data_items,
            meta_items: self.meta_items + rhs.meta_items,
            task_cache_items: self.task_cache_items + rhs.task_cache_items,
            bytes_written: self.bytes_written + rhs.bytes_written,
            bytes_deleted: self.bytes_deleted + rhs.bytes_deleted,
            max_next_task_id: max(self.max_next_task_id, rhs.max_next_task_id),
        }
    }
}

impl std::fmt::Display for SnapshotMeta {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let SnapshotMeta {
            data_items,
            meta_items,
            task_cache_items,
            bytes_written,
            bytes_deleted,
            max_next_task_id,
        } = self;
        write!(
            f,
            "data_items={data_items} meta_items={meta_items} task_cache_items={task_cache_items} \
             bytes_written={bytes_written} bytes_deleted={bytes_deleted} \
             next_task_id={max_next_task_id}"
        )
    }
}
