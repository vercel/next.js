use std::cmp::max;

use smallvec::SmallVec;
use turbo_bincode::TurboBincodeBuffer;
use turbo_tasks::{
    DynTaskInputs, FxDashMap, RawVc, TaskId,
    backend::{CachedTaskType, CachedTaskTypeArc},
    macro_helpers::NativeFunction,
};
use turbo_tasks_hash::Xxh3Hash64Hasher;

pub type TaskTypeHash = [u8; 8];
pub type TaskIdBucket = SmallVec<[TaskId; 3]>;
pub type TaskCache = FxDashMap<TaskTypeHash, TaskCacheBucket>;

/// All task types and IDs sharing one persistent task-type hash.
///
/// Hash collisions are exceptionally rare, so almost every bucket contains exactly one entry.
/// One `(CachedTaskTypeArc, TaskId)` pair fits inline; a second, exceptionally rare collision
/// spills to the heap. Complete buckets permit restore lookups without a persistence read.
#[derive(Clone, Default)]
pub struct TaskCacheBucket {
    entries: SmallVec<[(CachedTaskTypeArc, TaskId); 1]>,
    /// A by-type restore has read every on-disk candidate for this hash.
    complete: bool,
}

impl TaskCacheBucket {
    pub fn find(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> Option<(TaskId, CachedTaskTypeArc)> {
        self.entries
            .iter()
            .find(|(task_type, _)| task_type.eq_components(native_fn, this, arg))
            .map(|(task_type, task_id)| (*task_id, task_type.clone()))
    }

    pub fn insert(&mut self, task_type: CachedTaskTypeArc, task_id: TaskId) {
        if !self
            .entries
            .iter()
            .any(|(candidate, _)| candidate == &task_type)
        {
            self.entries.push((task_type, task_id));
        }
    }

    pub fn task_ids(&self) -> TaskIdBucket {
        self.entries.iter().map(|(_, task_id)| *task_id).collect()
    }

    pub fn remove_id(&mut self, task_id: TaskId) -> bool {
        let len = self.entries.len();
        self.entries.retain(|(_, id)| *id != task_id);
        self.entries.len() != len
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn is_complete(&self) -> bool {
        self.complete
    }

    pub fn mark_complete(&mut self) {
        self.complete = true;
    }

    pub fn is_singleton_id(&self, task_id: TaskId) -> bool {
        self.entries.len() == 1 && self.entries[0].1 == task_id
    }
}

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
        /// TaskCache hash for a newly created task. The task ID is the enclosing `task_id`.
        task_type_hash: Option<TaskTypeHash>,
    },
    Delete {
        task_id: TaskId,
        /// The deleted task's TaskCache hash. The authoritative in-memory bucket supplies the
        /// surviving IDs during persistence.
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
