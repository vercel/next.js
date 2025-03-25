use rustc_hash::FxHashSet;
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use crate::{
    backend::operation::{
        aggregation_update::InnerOfUppersHasNewFollowersJob, get_aggregation_number, get_uppers,
        is_aggregating_node, AggregationUpdateJob, AggregationUpdateQueue, TaskGuard,
    },
    data::CachedDataItem,
};

pub fn connect_children(
    parent_task_id: TaskId,
    parent_task: &mut impl TaskGuard,
    new_children: FxHashSet<TaskId>,
    queue: &mut AggregationUpdateQueue,
    has_active_count: bool,
    should_track_activeness: bool,
) {
    if new_children.is_empty() {
        return;
    }

    let parent_aggregation = get_aggregation_number(parent_task);

    for &new_child in new_children.iter() {
        parent_task.add_new(CachedDataItem::Child {
            task: new_child,
            value: (),
        });
    }

    let new_follower_ids: SmallVec<_> = new_children.iter().copied().collect();

    let aggregating_node = is_aggregating_node(parent_aggregation);
    let upper_ids = (!aggregating_node).then(|| get_uppers(&*parent_task));

    if let Some(upper_ids) = upper_ids {
        // Parent is a leaf node, the children are followers of it now.
        if !upper_ids.is_empty() {
            queue.push(
                InnerOfUppersHasNewFollowersJob {
                    upper_ids,
                    new_follower_ids: new_follower_ids.clone(),
                }
                .into(),
            );
        }
        // We need to decrease the active count because we temporarily increased it during
        // connect_child. We need to increase the active count when the parent has active
        // count, because it's added as follower.
        if should_track_activeness && !has_active_count {
            queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                task_ids: new_follower_ids,
            })
        }
    } else {
        // Parent is an aggregating node. We run the normal code to connect the children.
        queue.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
            upper_id: parent_task_id,
            new_follower_ids: new_follower_ids.clone(),
        });
        // We need to decrease the active count because we temporarily increased it during
        // connect_child.
        if should_track_activeness {
            queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                task_ids: new_follower_ids,
            });
        }
    }
}
