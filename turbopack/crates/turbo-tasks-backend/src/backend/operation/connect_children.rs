use rustc_hash::FxHashSet;
use turbo_tasks::TaskId;

use crate::{
    backend::operation::{
        get_aggregation_number, get_uppers, is_aggregating_node, AggregationUpdateJob,
        AggregationUpdateQueue, TaskGuard,
    },
    data::CachedDataItem,
};

pub fn connect_children(
    parent_task_id: TaskId,
    parent_task: &mut impl TaskGuard,
    mut new_children: FxHashSet<TaskId>,
    queue: &mut AggregationUpdateQueue,
    active_count: i32,
) {
    for &new_child in new_children.iter() {
        parent_task.add_new(CachedDataItem::Child {
            task: new_child,
            value: (),
        });
    }

    let new_follower_ids: Vec<_> = new_children.iter().copied().collect();

    let aggregating_node = is_aggregating_node(get_aggregation_number(parent_task));
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
