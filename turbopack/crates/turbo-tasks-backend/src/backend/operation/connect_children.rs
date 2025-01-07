use std::{cmp::max, num::NonZeroU32};

use rustc_hash::FxHashSet;
use turbo_tasks::TaskId;

use crate::{
    backend::{
        get,
        operation::{
            get_uppers, is_aggregating_node, is_root_node, AggregationUpdateJob,
            AggregationUpdateQueue, TaskGuard,
        },
    },
    data::CachedDataItem,
};

const AGGREGATION_NUMBER_BUFFER_SPACE: u32 = 3;

pub fn connect_children(
    parent_task_id: TaskId,
    parent_task: &mut impl TaskGuard,
    mut new_children: FxHashSet<TaskId>,
    queue: &mut AggregationUpdateQueue,
    active_count: i32,
) {
    if new_children.is_empty() {
        return;
    }
    let children_count = new_children.len();

    // Compute future parent aggregation number based on the number of children
    let current_parent_aggregation = get!(parent_task, AggregationNumber)
        .copied()
        .unwrap_or_default();
    let (parent_aggregation, future_parent_aggregation) =
        if is_root_node(current_parent_aggregation.base) {
            (u32::MAX, u32::MAX)
        } else {
            let target_distance = children_count.ilog2() * 2;
            if target_distance > current_parent_aggregation.distance {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: parent_task_id,
                    base_aggregation_number: 0,
                    distance: NonZeroU32::new(target_distance),
                })
            }
            (
                current_parent_aggregation.effective,
                current_parent_aggregation
                    .base
                    .saturating_add(max(target_distance, current_parent_aggregation.distance)),
            )
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

    for &new_child in new_children.iter() {
        parent_task.add_new(CachedDataItem::Child {
            task: new_child,
            value: (),
        });
    }

    let new_follower_ids: Vec<_> = new_children.iter().copied().collect();

    let aggregating_node = is_aggregating_node(parent_aggregation);
    let upper_ids = (!aggregating_node).then(|| get_uppers(&*parent_task));

    // Handle the transient to persistent boundary by making the persistent task a root task
    if parent_task_id.is_transient() || !aggregating_node {
        new_children.retain(|&child_task_id| {
            if parent_task_id.is_transient() && !child_task_id.is_transient() {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: u32::MAX,
                    distance: None,
                });
                false
            } else {
                true
            }
        });
    }

    if let Some(upper_ids) = upper_ids {
        if !upper_ids.is_empty() {
            queue.push(AggregationUpdateJob::InnerOfUppersHasNewFollowers {
                upper_ids,
                new_follower_ids: new_follower_ids.clone(),
            });
        }
    } else {
        queue.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
            upper_id: parent_task_id,
            new_follower_ids: new_follower_ids.clone(),
        });
    }

    if active_count == 0 {
        queue.push(AggregationUpdateJob::DecreaseActiveCounts {
            task_ids: new_follower_ids,
        })
    }
}
