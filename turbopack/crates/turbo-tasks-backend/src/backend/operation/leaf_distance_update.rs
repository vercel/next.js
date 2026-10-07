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

/// The maximum number of leaf distance updates processed in one step.
const MAX_COUNT_BEFORE_YIELD: usize = 1000;

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

    /// Executes a single step of the queue. Returns true, when the queue is empty.
    pub fn process(&mut self, ctx: &mut ExecuteContext<'_>) -> bool {
        let mut remaining = MAX_COUNT_BEFORE_YIELD;
        while remaining > 0 {
            if let Some((Reverse(queue_dependencies_distance), task_id)) = self.queue.pop() {
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
                remaining -= 1;
            } else {
                return true;
            }
        }
        false
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

    pub fn execute(&mut self, ctx: &mut ExecuteContext<'_>) {
        if self.is_empty() {
            return;
        }
        while !self.process(ctx) {}
    }
}

#[cfg(test)]
mod tests {
    use std::cmp::Reverse;

    use turbo_tasks::TaskId;

    use super::{BASE_LEAF_DISTANCE_BUFFER, LeafDistanceUpdateQueue, compute_leaf_distance_update};
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

    /// Verbatim copy of the arithmetic `update_leaf_distance` used before it was extracted into
    /// `compute_leaf_distance_update`, used as a reference.
    fn reference(current: LeafDistance, dep: u32, dep_max: u32) -> Option<LeafDistance> {
        let mut leaf_distance = current;
        if leaf_distance.distance > dep {
            return None;
        }
        if leaf_distance.max_distance_in_buffer <= dep {
            let old_value = leaf_distance.distance;
            leaf_distance.distance = dep_max + 1;
            let buffer_size = BASE_LEAF_DISTANCE_BUFFER
                - BASE_LEAF_DISTANCE_BUFFER.saturating_mul(old_value) / leaf_distance.distance;
            leaf_distance.max_distance_in_buffer = leaf_distance.distance + buffer_size;
        } else {
            leaf_distance.distance = dep + 1;
        }
        Some(leaf_distance)
    }

    #[test]
    fn no_update_when_already_strictly_greater() {
        assert_eq!(compute_leaf_distance_update(ld(5, 100), 4, 50), None);
        assert_eq!(compute_leaf_distance_update(ld(1, 0), 0, 0), None);
    }

    #[test]
    fn updates_when_equal() {
        // The call site used to enqueue when `reader.distance <= dependency.distance`.
        assert!(compute_leaf_distance_update(ld(3, 100), 3, 50).is_some());
    }

    #[test]
    fn within_buffer_zone_keeps_max() {
        assert_eq!(
            compute_leaf_distance_update(ld(2, 100), 10, 60),
            Some(ld(11, 100))
        );
    }

    #[test]
    fn overshoot_recomputes_buffer() {
        // Fresh (default) reader reading a dependency at (0, 0).
        assert_eq!(
            compute_leaf_distance_update(LeafDistance::default(), 0, 0),
            Some(ld(1, 1 + BASE_LEAF_DISTANCE_BUFFER))
        );
        // Reader at (10, 20) reading a dependency at (20, 150): overshoots its buffer zone.
        let distance = 151;
        let buffer = BASE_LEAF_DISTANCE_BUFFER - BASE_LEAF_DISTANCE_BUFFER * 10 / distance;
        assert_eq!(
            compute_leaf_distance_update(ld(10, 20), 20, 150),
            Some(ld(distance, distance + buffer))
        );
    }

    #[test]
    fn matches_reference_arithmetic() {
        let values = [0u32, 1, 2, 3, 7, 50, 127, 128, 129, 200, 1000, 100_000];
        for &distance in &values {
            for &max in &values {
                for &dep in &values {
                    for &dep_max in &values {
                        if dep_max < dep {
                            continue;
                        }
                        let current = ld(distance, max);
                        let result = compute_leaf_distance_update(current, dep, dep_max);
                        assert_eq!(
                            result,
                            reference(current, dep, dep_max),
                            "current={current:?} dep={dep} dep_max={dep_max}"
                        );
                        if let Some(new) = result {
                            assert!(new.distance > dep, "must be strictly monotonic");
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn matches_reference_arithmetic_near_upper_bound() {
        // `dependency_max_distance_in_buffer` is asserted to be below `u32::MAX / 2`; exercise the
        // saturating multiplication with large current distances.
        let max_dep = u32::MAX / 2 - 1;
        for &distance in &[max_dep / 2, max_dep - 1, max_dep] {
            for &max in &[0, distance, max_dep] {
                for &(dep, dep_max) in &[(distance, max_dep), (max_dep, max_dep), (0, max_dep)] {
                    let current = ld(distance, max);
                    assert_eq!(
                        compute_leaf_distance_update(current, dep, dep_max),
                        reference(current, dep, dep_max),
                        "current={current:?} dep={dep} dep_max={dep_max}"
                    );
                }
            }
        }
    }

    #[test]
    fn push_dependents_with_no_dependents_keeps_queue_empty() {
        let mut queue = LeafDistanceUpdateQueue::new();
        queue.push_dependents([], ld(3, 130));
        assert!(queue.is_empty());
        assert!(queue.leaf_distance_updates.is_empty());
    }

    #[test]
    fn reader_already_ahead_does_not_propagate() {
        // Mirrors the call site in `try_read_task_output`: dependents are only enqueued when
        // the reader's leaf distance was updated.
        let dependency = ld(4, 140);
        let reader = ld(9, 140);
        assert_eq!(
            compute_leaf_distance_update(
                reader,
                dependency.distance,
                dependency.max_distance_in_buffer
            ),
            None
        );
    }

    #[test]
    fn push_dependents_seeds_with_new_leaf_distance() {
        // A fresh reader reads a dependency; its updated leaf distance is what is propagated.
        let dependency = ld(6, 134);
        let new_leaf_distance = compute_leaf_distance_update(
            LeafDistance::default(),
            dependency.distance,
            dependency.max_distance_in_buffer,
        )
        .unwrap();
        assert!(new_leaf_distance.distance > dependency.distance);

        let mut queue = LeafDistanceUpdateQueue::new();
        queue.push_dependents([task_id(1), task_id(2)], new_leaf_distance);
        assert!(!queue.is_empty());
        assert_eq!(queue.leaf_distance_updates.len(), 2);
        for id in [task_id(1), task_id(2)] {
            let update = &queue.leaf_distance_updates[&id];
            assert_eq!(update.dependencies_distance, new_leaf_distance.distance);
            assert_eq!(
                update.dependencies_max_distance_in_buffer,
                new_leaf_distance.max_distance_in_buffer
            );
            assert!(!update.done);
        }
        let mut queued: Vec<_> = queue.queue.iter().copied().collect();
        queued.sort();
        let mut expected = vec![
            (Reverse(new_leaf_distance.distance), task_id(1)),
            (Reverse(new_leaf_distance.distance), task_id(2)),
        ];
        expected.sort();
        assert_eq!(queued, expected);
    }
}
