use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use crate::{
    backend::{
        get_mut,
        operation::{
            aggregation_update::{AggregationUpdateJob, AggregationUpdateQueue},
            ExecuteContext, Operation, TaskGuard,
        },
        TaskDataCategory,
    },
    data::{CachedDataItem, CachedDataItemKey, InProgressState, InProgressStateInner},
};

#[derive(Serialize, Deserialize, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum ConnectChildOperation {
    UpdateAggregation {
        aggregation_update: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl ConnectChildOperation {
    pub fn run(parent_task_id: TaskId, child_task_id: TaskId, mut ctx: impl ExecuteContext) {
        if !ctx.should_track_children() {
            let mut task = ctx.task(child_task_id, TaskDataCategory::All);
            if !task.has_key(&CachedDataItemKey::Output {}) {
                let description = ctx.get_task_desc_fn(child_task_id);
                let should_schedule = task.add(CachedDataItem::new_scheduled(description));
                drop(task);
                if should_schedule {
                    ctx.schedule(child_task_id);
                }
            }
            return;
        }
        let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::All);
        let Some(InProgressState::InProgress(box InProgressStateInner { new_children, .. })) =
            get_mut!(parent_task, InProgress)
        else {
            panic!("Task is not in progress while calling another task");
        };

        // Quick skip if the child was already connected before
        if !new_children.insert(child_task_id) {
            return;
        }
        if parent_task.has_key(&CachedDataItemKey::Child {
            task: child_task_id,
        }) {
            // It is already connected, we can skip the rest
            return;
        }
        drop(parent_task);

        let mut queue = AggregationUpdateQueue::new();

        // Handle the transient to persistent boundary by making the persistent task a root task
        if parent_task_id.is_transient() && !child_task_id.is_transient() {
            queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id: child_task_id,
                base_aggregation_number: u32::MAX,
                distance: None,
            });
        }

        if ctx.should_track_activeness() {
            queue.push(AggregationUpdateJob::IncreaseActiveCount {
                task: child_task_id,
            });
        } else {
            let mut task = ctx.task(child_task_id, TaskDataCategory::All);
            if !task.has_key(&CachedDataItemKey::Output {}) {
                let description = ctx.get_task_desc_fn(child_task_id);
                let should_schedule = task.add(CachedDataItem::new_scheduled(description));
                drop(task);
                if should_schedule {
                    ctx.schedule(child_task_id);
                }
            }
        }

        ConnectChildOperation::UpdateAggregation {
            aggregation_update: queue,
        }
        .execute(&mut ctx);
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
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
