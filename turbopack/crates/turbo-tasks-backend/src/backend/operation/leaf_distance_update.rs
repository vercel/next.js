use std::{
    cmp::Reverse,
    collections::{BinaryHeap, hash_map::Entry},
};

use rustc_hash::FxHashMap;
#[cfg(feature = "trace_leaf_distance_update")]
use tracing::{span::Span, trace_span};
use turbo_tasks::TaskId;

use crate::{
    backend::{TaskDataCategory, operation::ExecuteContext, storage_schema::TaskStorageAccessors},
    data::LeafDistance,
};

/// We avoid incrementing the leaf distance by 1 each time to avoid frequent updates.
/// Instead we use a buffer zone that shrinks as the leaf distance increases.
/// This constant defines the size of that buffer zone at leaf distance 0.
const BASE_LEAF_DISTANCE_BUFFER: u32 = 128;

/// Computes the new leaf distance of a task that depends (via an output dependency) on a task with
/// the given `dependency_distance` and `dependency_max_distance_in_buffer`.
///
/// Returns `None` when `current` is already strictly greater than the dependency distance, i.e.
/// the leaf distance is already strictly monotonic along this edge and no update is needed.
pub fn compute_leaf_distance_update(
    current: LeafDistance,
    dependency_distance: u32,
    dependency_max_distance_in_buffer: u32,
) -> Option<LeafDistance> {
    debug_assert!(dependency_max_distance_in_buffer < u32::MAX / 2);
    if current.distance > dependency_distance {
        // It is strictly monotonic. No need to update.
        return None;
    }
    // It's not strictly monotonic, we need to update
    let mut leaf_distance = current;
    if leaf_distance.max_distance_in_buffer <= dependency_distance {
        // We overshoot the buffer zone.
        let old_value = leaf_distance.distance;
        leaf_distance.distance = dependency_max_distance_in_buffer + 1;
        let buffer_size = BASE_LEAF_DISTANCE_BUFFER
            - BASE_LEAF_DISTANCE_BUFFER.saturating_mul(old_value) / leaf_distance.distance;
        leaf_distance.max_distance_in_buffer = leaf_distance.distance + buffer_size;
    } else {
        // We are within the buffer zone, keep the max as is
        leaf_distance.distance = dependency_distance + 1;
    }
    Some(leaf_distance)
}

/// An leaf distance update job that is enqueued.
struct LeafDistanceUpdate {
    dependencies_distance: u32,
    dependencies_max_distance_in_buffer: u32,
    done: bool,
    #[cfg(feature = "trace_leaf_distance_update")]
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
#[derive(Default)]
pub struct LeafDistanceUpdateQueue {
    queue: BinaryHeap<(Reverse<u32>, TaskId)>,
    leaf_distance_updates: FxHashMap<TaskId, LeafDistanceUpdate>,
}

impl LeafDistanceUpdateQueue {
    pub fn new() -> Self {
        Self::default()
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
                    #[cfg(feature = "trace_leaf_distance_update")]
                    span: Some(Span::current()),
                });
                self.queue.push((Reverse(dependency_distance), task_id));
            }
        };
    }

    /// Enqueues leaf distance updates for all `dependents` of a task whose leaf distance has just
    /// been updated to `leaf_distance`.
    pub fn push_dependents(
        &mut self,
        dependents: impl IntoIterator<Item = TaskId>,
        leaf_distance: LeafDistance,
    ) {
        for dependent_id in dependents {
            self.push(
                dependent_id,
                leaf_distance.distance,
                leaf_distance.max_distance_in_buffer,
            );
        }
    }

    /// Executes all jobs in the queue.
    pub fn execute(&mut self, ctx: &mut ExecuteContext<'_>) {
        while let Some((Reverse(queue_dependencies_distance), task_id)) = self.queue.pop() {
            let &mut LeafDistanceUpdate {
                dependencies_distance,
                dependencies_max_distance_in_buffer,
                ref mut done,
                #[cfg(feature = "trace_leaf_distance_update")]
                ref span,
            } = self.leaf_distance_updates.get_mut(&task_id).unwrap();
            if queue_dependencies_distance != dependencies_distance {
                // Stale entry in queue
                // Re-enqueue to keep the ordering correct
                self.queue.push((Reverse(dependencies_distance), task_id));
                continue;
            }
            #[cfg(feature = "trace_leaf_distance_update")]
            let _guard = span.as_ref().map(|s| s.clone().entered());
            *done = true;
            self.update_leaf_distance(
                ctx,
                task_id,
                dependencies_distance,
                dependencies_max_distance_in_buffer,
            );
        }
    }

    fn update_leaf_distance(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
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
        let Some(leaf_distance) = compute_leaf_distance_update(
            task.get_leaf_distance().copied().unwrap_or_default(),
            dependencies_distance,
            dependencies_max_distance_in_buffer,
        ) else {
            return;
        };
        // TODO Technically CellDependent is also needed, but there are cycles in the CellDependent
        // graph. So we need to handle that properly first. When enabling this, make sure to also
        // call the leaf update queue when adding CellDependents.
        self.push_dependents(task.iter_output_dependent(), leaf_distance);
        task.set_leaf_distance(leaf_distance);
    }
}

#[cfg(test)]
mod tests {
    use turbo_tasks::TaskId;

    use super::{LeafDistanceUpdateQueue, compute_leaf_distance_update};
    use crate::data::LeafDistance;

    fn ld(distance: u32, max_distance_in_buffer: u32) -> LeafDistance {
        LeafDistance {
            distance,
            max_distance_in_buffer,
        }
    }

    fn task_id(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    #[test]
    fn reader_ahead_of_dependency_is_not_updated() {
        assert_eq!(compute_leaf_distance_update(ld(5, 100), 4, 50), None);
    }

    #[test]
    fn reader_at_or_behind_dependency_moves_past_it() {
        for (reader, dependency) in [
            (ld(0, 0), ld(0, 0)),
            (ld(3, 100), ld(3, 50)),
            (ld(10, 20), ld(20, 150)),
        ] {
            let updated = compute_leaf_distance_update(
                reader,
                dependency.distance,
                dependency.max_distance_in_buffer,
            )
            .unwrap();
            assert!(
                updated.distance > dependency.distance,
                "{reader:?} {dependency:?}"
            );
            assert!(updated.max_distance_in_buffer >= updated.distance);
        }
    }

    #[test]
    fn updates_within_buffer_keep_buffer_ceiling() {
        let first = compute_leaf_distance_update(ld(2, 100), 10, 60).unwrap();
        assert_eq!(first, ld(11, 100));
        let second = compute_leaf_distance_update(first, 12, 70).unwrap();
        assert_eq!(second, ld(13, 100));
    }

    #[test]
    fn push_dependents_without_dependents_enqueues_nothing() {
        let mut queue = LeafDistanceUpdateQueue::new();
        queue.push_dependents([], ld(3, 130));
        assert!(queue.queue.is_empty());
        assert!(queue.leaf_distance_updates.is_empty());
    }

    #[test]
    fn push_dependents_propagates_new_distance() {
        let reader = compute_leaf_distance_update(ld(0, 0), 6, 134).unwrap();
        let mut queue = LeafDistanceUpdateQueue::new();
        queue.push_dependents([task_id(1), task_id(2)], reader);

        assert_eq!(queue.queue.len(), 2);
        for id in [task_id(1), task_id(2)] {
            let update = &queue.leaf_distance_updates[&id];
            assert_eq!(update.dependencies_distance, reader.distance);
            assert_eq!(
                update.dependencies_max_distance_in_buffer,
                reader.max_distance_in_buffer
            );
        }
    }
}
