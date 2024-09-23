use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{
    aggregation_update::{
        get_uppers, is_aggregating_node, AggregationUpdateJob, AggregationUpdateQueue,
    },
    ExecuteContext, Operation,
};
use crate::{
    data::{CachedDataItem, CachedDataItemKey},
    get,
};

const AGGREGATION_NUMBER_BUFFER_SPACE: u32 = 2;

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum ConnectChildOperation {
    UpdateAggregation {
        aggregation_update: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl ConnectChildOperation {
    pub fn run(parent_task_id: TaskId, child_task_id: TaskId, ctx: ExecuteContext<'_>) {
        let mut parent_task = ctx.task(parent_task_id);
        parent_task.remove(&CachedDataItemKey::OutdatedChild {
            task: child_task_id,
        });
        if parent_task.add(CachedDataItem::Child {
            task: child_task_id,
            value: (),
        }) {
            // When task is added to a AggregateRoot is need to be scheduled,
            // indirect connections are handled by the aggregation update.
            let mut should_schedule = false;
            if parent_task.has_key(&CachedDataItemKey::AggregateRoot {}) {
                should_schedule = true;
            }
            // Update the task aggregation
            let mut queue = AggregationUpdateQueue::new();
            let parent_aggregation = get!(parent_task, AggregationNumber)
                .copied()
                .unwrap_or_default();
            let is_aggregating_node = is_aggregating_node(parent_aggregation);
            if parent_task_id.is_transient() && !child_task_id.is_transient() {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    aggregation_number: u32::MAX,
                });
            } else if !is_aggregating_node {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    aggregation_number: parent_aggregation + AGGREGATION_NUMBER_BUFFER_SPACE + 1,
                });
            }
            if is_aggregating_node {
                queue.push(AggregationUpdateJob::InnerHasNewFollower {
                    upper_ids: vec![parent_task_id],
                    new_follower_id: child_task_id,
                });
            } else {
                let upper_ids = get_uppers(&parent_task);
                queue.push(AggregationUpdateJob::InnerHasNewFollower {
                    upper_ids,
                    new_follower_id: child_task_id,
                });
            }
            drop(parent_task);

            {
                let mut task = ctx.task(child_task_id);
                should_schedule = should_schedule || !task.has_key(&CachedDataItemKey::Output {});
                if should_schedule {
                    let description = ctx.backend.get_task_desc_fn(child_task_id);
                    should_schedule = task.add(CachedDataItem::new_scheduled(description));
                }
            }
            if should_schedule {
                ctx.schedule(child_task_id);
            }

            ConnectChildOperation::UpdateAggregation {
                aggregation_update: queue,
            }
            .execute(&ctx);
        }
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: &ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                ConnectChildOperation::UpdateAggregation {
                    ref mut aggregation_update,
                } => {
                    if aggregation_update.process(ctx) {
                        self = ConnectChildOperation::Done
                    }
                }

                ConnectChildOperation::Done => {
                    return;
                }
            }
        }
    }
}
