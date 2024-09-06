use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{
    aggregation_update::{
        get_uppers, is_aggregating_node, is_root_node, AggregationUpdateJob, AggregationUpdateQueue,
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
        task_id: TaskId,
        aggregation_update: AggregationUpdateQueue,
    },
    ScheduleTask {
        task_id: TaskId,
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
            // Update the task aggregation
            let mut queue = AggregationUpdateQueue::new();
            let parent_aggregation = get!(parent_task, AggregationNumber)
                .copied()
                .unwrap_or_default();
            if parent_task_id.is_transient() && !child_task_id.is_transient() {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    aggregation_number: u32::MAX,
                });
            } else if !is_root_node(parent_aggregation) {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    aggregation_number: parent_aggregation + AGGREGATION_NUMBER_BUFFER_SPACE + 1,
                });
            }
            if is_aggregating_node(parent_aggregation) {
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
            ConnectChildOperation::UpdateAggregation {
                task_id: child_task_id,
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
                    task_id,
                    ref mut aggregation_update,
                } => {
                    if aggregation_update.process(ctx) {
                        // TODO check for active
                        self = ConnectChildOperation::ScheduleTask { task_id }
                    }
                }
                ConnectChildOperation::ScheduleTask { task_id } => {
                    let mut should_schedule;
                    {
                        let mut task = ctx.task(task_id);
                        should_schedule = !task.has_key(&CachedDataItemKey::Output {});
                        if should_schedule {
                            should_schedule = task.add(CachedDataItem::new_scheduled(
                                task.backend.get_task_desc_fn(task_id),
                            ));
                        }
                    }
                    if should_schedule {
                        ctx.schedule(task_id);
                    }

                    self = ConnectChildOperation::Done;
                }

                ConnectChildOperation::Done => {
                    return;
                }
            }
        }
    }
}
