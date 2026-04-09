use std::{
    cmp::Reverse,
    collections::{BinaryHeap, hash_map::Entry},
};

use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
#[cfg(feature = "trace_leaf_distance_update")]
use tracing::{span::Span, trace_span};
use turbo_tasks::TaskId;

use crate::backend::{
    TaskDataCategory,
    operation::{ExecuteContext, Operation},
    storage_schema::TaskStorageAccessors,
};

/// The maximum number of leaf distance updates to process before yielding back to the executor.
/// This prevents long blocking operations and allows to interrupt the processing for persistent
/// caching.
const MAX_COUNT_BEFORE_YIELD: usize = 1000;

/// We avoid incrementing the leaf distance by 1 each time to avoid frequent updates.
/// Instead we use a buffer zone that shrinks as the leaf distance increases.
/// This constant defines the size of that buffer zone at leaf distance 0.
const BASE_LEAF_DISTANCE_BUFFER: u32 = 128;

/// An leaf distance update job that is enqueued.
#[derive(Encode, Decode, Clone)]
struct LeafDistanceUpdate {
    dependencies_distance: u32,
    dependencies_max_distance_in_buffer: u32,
    done: bool,
    #[cfg(feature = "trace_leaf_distance_update")]
    #[bincode(skip)]
    span: Option<Span>,
}

impl LeafDistanceUpdate {
    fn add(&mut self, dependency_distance: u32, dependency_max_distance_in_buffer: u32) {
        self.dependencies_distance = self.dependencies_distance.max(dependency_distance);
        self.dependencies_max_distance_in_buffer = self
            .dependencies_max_distance_in_buffer
            .max(dependency_max_distance_in_buffer);
    }
}

/// A queue of leaf distance update jobs.
/// It will execute these jobs in order of their minimum dependency leaf distance.
/// This ensures that we never have to re-process a task.
#[derive(Default, Encode, Decode, Clone)]
pub struct LeafDistanceUpdateQueue {
    queue: BinaryHeap<(Reverse<u32>, TaskId)>,
    leaf_distance_updates: FxHashMap<TaskId, LeafDistanceUpdate>,
}

impl LeafDistanceUpdateQueue {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_empty(&self) -> bool {
        self.queue.is_empty()
    }

    pub fn push(
        &mut self,
        task_id: TaskId,
        dependency_distance: u32,
        dependency_max_distance_in_buffer: u32,
    ) {
        match self.leaf_distance_updates.entry(task_id) {
            Entry::Occupied(mut entry) => {
                let update = entry.get_mut();
                if update.done && update.dependencies_distance < dependency_distance {
                    update.done = false;
                    self.queue.push((Reverse(dependency_distance), task_id));
                }
                update.add(dependency_distance, dependency_max_distance_in_buffer);
            }
            Entry::Vacant(entry) => {
                entry.insert(LeafDistanceUpdate {
                    dependencies_distance: dependency_distance,
                    dependencies_max_distance_in_buffer: dependency_max_distance_in_buffer,
                    done: false,
                });
                self.queue.push((Reverse(dependency_distance), task_id));
            }
        };
    }

    /// Executes a single step of the queue. Returns true, when the queue is empty.
    pub fn process(&mut self, ctx: &mut impl ExecuteContext) -> bool {
        let mut remaining = MAX_COUNT_BEFORE_YIELD;
        while remaining > 0 {
            if let Some((Reverse(queue_dependencies_distance), task_id)) = self.queue.pop() {
                let &mut LeafDistanceUpdate {
                    dependencies_distance,
                    dependencies_max_distance_in_buffer,
                    ref mut done,
                    #[cfg(feature = "trace_leaf_distance_update")]
                    span,
                } = self.leaf_distance_updates.get_mut(&task_id).unwrap();
                if queue_dependencies_distance != dependencies_distance {
                    // Stale entry in queue
                    // Re-enqueue to keep the ordering correct
                    self.queue.push((Reverse(dependencies_distance), task_id));
                    continue;
                }
                #[cfg(feature = "trace_leaf_distance_update")]
                let _guard = span.map(|s| s.entered());
                *done = true;
                self.update_leaf_distance(
                    ctx,
                    task_id,
                    dependencies_distance,
                    dependencies_max_distance_in_buffer,
                );
                remaining -= 1;
            } else {
                return true;
            }
        }
        false
    }

    fn update_leaf_distance(
        &mut self,
        ctx: &mut impl ExecuteContext,
        task_id: TaskId,
        dependencies_distance: u32,
        dependencies_max_distance_in_buffer: u32,
    ) {
        #[cfg(feature = "trace_leaf_distance_update")]
        let _span = trace_span!(
            "update leaf distance",
            dependencies_distance,
            dependencies_max_distance_in_buffer
        )
        .entered();
        let mut task = ctx.task(
            task_id,
            // For performance reasons this should stay `Data` and not `All`
            TaskDataCategory::Data,
        );
        debug_assert!(dependencies_max_distance_in_buffer < u32::MAX / 2);
        let mut leaf_distance = task.get_leaf_distance().copied().unwrap_or_default();
        if leaf_distance.distance > dependencies_distance {
            // It is strictly monotonic. No need to update.
            return;
        }
        // It's not strictly monotonic, we need to update
        if leaf_distance.max_distance_in_buffer <= dependencies_distance {
            // We overshoot the buffer zone.
            let old_value = leaf_distance.distance;
            leaf_distance.distance = dependencies_max_distance_in_buffer + 1;
            let buffer_size = BASE_LEAF_DISTANCE_BUFFER
                - BASE_LEAF_DISTANCE_BUFFER.saturating_mul(old_value) / leaf_distance.distance;
            leaf_distance.max_distance_in_buffer = leaf_distance.distance + buffer_size;
        } else {
            // We are within the buffer zone, keep the max as is
            leaf_distance.distance = dependencies_distance + 1;
        }
        // TODO Technically CellDependent is also needed, but there are cycles in the CellDependent
        // graph. So we need to handle that properly first. When enabling this, make sure to also
        // call the leaf update queue when adding CellDependents.
        for dependent_id in task.iter_output_dependent() {
            self.push(
                dependent_id,
                leaf_distance.distance,
                leaf_distance.max_distance_in_buffer,
            );
        }
        task.set_leaf_distance(leaf_distance);
    }
}

impl Operation for LeafDistanceUpdateQueue {
    fn execute(mut self, ctx: &mut impl ExecuteContext<'_>) {
        if self.is_empty() {
            return;
        }
        loop {
            ctx.operation_suspend_point(&self);
            if self.process(ctx) {
                return;
            }
        }
    }
}
