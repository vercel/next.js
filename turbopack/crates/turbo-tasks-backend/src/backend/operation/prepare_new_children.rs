use std::{cmp::max, num::NonZeroU32};

use rustc_hash::FxHashSet;
use turbo_tasks::TaskId;

use crate::backend::{
    get,
    operation::{
        is_aggregating_node, is_root_node, AggregationUpdateJob, AggregationUpdateQueue, TaskGuard,
    },
};

const AGGREGATION_NUMBER_BUFFER_SPACE: u32 = 3;

pub fn prepare_new_children(
    parent_task_id: TaskId,
    parent_task: &mut impl TaskGuard,
    new_children: &FxHashSet<TaskId>,
    queue: &mut AggregationUpdateQueue,
) {
    if new_children.is_empty() {
        return;
    }
    let children_count = new_children.len();

    // Compute future parent aggregation number based on the number of children
    let current_parent_aggregation = get!(parent_task, AggregationNumber)
        .copied()
        .unwrap_or_default();
    let future_parent_aggregation = if is_root_node(current_parent_aggregation.base) {
        u32::MAX
    } else {
        let target_distance = children_count.ilog2() * 2;
        if target_distance > current_parent_aggregation.distance {
            queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id: parent_task_id,
                base_aggregation_number: 0,
                distance: NonZeroU32::new(target_distance),
            })
        }
        current_parent_aggregation
            .base
            .saturating_add(max(target_distance, current_parent_aggregation.distance))
    };

    // When the parent is a leaf node, we need to increase the aggregation number of the children to
    // be counting from the parent's aggregation number.
    if !is_aggregating_node(future_parent_aggregation) {
        let child_base_aggregation_number =
            future_parent_aggregation + AGGREGATION_NUMBER_BUFFER_SPACE;
        for &new_child in new_children.iter() {
            queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id: new_child,
                base_aggregation_number: child_base_aggregation_number,
                distance: None,
            });
        }
    };
}
