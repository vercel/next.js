use bincode::{Decode, Encode};
use turbo_tasks::{TaskExecutionReason, TaskId, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, Operation, TaskGuard,
            aggregation_update::{
                AggregationUpdateJob, AggregationUpdateQueue, get_aggregation_number, is_root_node,
            },
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{InProgressState, InProgressStateInner},
};

#[derive(Encode, Decode, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum ConnectChildOperation {
    UpdateAggregation {
        aggregation_update: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl ConnectChildOperation {
    pub fn run(
        parent_task_id: Option<TaskId>,
        child_task_id: TaskId,
        mut ctx: impl ExecuteContext<'_>,
    ) {
        if let Some(parent_task_id) = parent_task_id {
            let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::Meta);
            let Some(InProgressState::InProgress(InProgressStateInner { new_children, .. })) =
                parent_task.get_in_progress()
            else {
                panic!("Task is not in progress while calling another task: {parent_task:?}");
            };

            // Quick skip if the child was already connected before
            // We defer the insert until after the aggregation queue is processed.
            if new_children.contains(&child_task_id) {
                return;
            }

            if parent_task.children_contains(&child_task_id) {
                // It is already connected, we can skip the rest
                // but we still need to update the new_children set
                let Some(InProgressState::InProgress(InProgressStateInner {
                    new_children, ..
                })) = parent_task.get_in_progress_mut()
                else {
                    unreachable!();
                };
                new_children.insert(child_task_id);
                return;
            }
        }

        let mut queue = AggregationUpdateQueue::new();

        // Handle the transient to persistent boundary by making the persistent task a root task
        let should_make_root =
            parent_task_id.is_none_or(|id| id.is_transient() && !child_task_id.is_transient());

        if ctx.should_track_activeness() && parent_task_id.is_some() {
            if should_make_root {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: u32::MAX,
                    distance: None,
                });
            }
            queue.push(AggregationUpdateJob::IncreaseActiveCount {
                task: child_task_id,
            });
        } else {
            // First connect of this child: its id is minted but the storage entry may not exist
            // yet, and concurrent connects race to be the one that first touches it.
            let mut child_task =
                ctx.open_or_create_task_storage(child_task_id, TaskDataCategory::Meta);
            let has_output = child_task.has_output();
            // An already constructed top-level task was made a root when it was first connected.
            // It may still be dirty and need to run; this only avoids repeating the idempotent
            // aggregation update.
            let is_already_constructed_root = parent_task_id.is_none()
                && has_output
                && is_root_node(get_aggregation_number(&child_task));

            if should_make_root && !is_already_constructed_root {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: u32::MAX,
                    distance: None,
                });
            }

            if !has_output
                && child_task.add_scheduled(
                    TaskExecutionReason::Connect,
                    EventDescription::new(|| child_task.get_task_desc_fn()),
                )
            {
                ctx.schedule_task(child_task, ctx.get_current_task_priority());
            }
        }

        if !queue.is_empty() {
            ConnectChildOperation::UpdateAggregation {
                aggregation_update: queue,
            }
            .execute(&mut ctx);
        }

        if let Some(parent_task_id) = parent_task_id {
            let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::Meta);
            let Some(InProgressState::InProgress(InProgressStateInner { new_children, .. })) =
                parent_task.get_in_progress_mut()
            else {
                panic!("Task is not in progress while calling another task: {parent_task:?}");
            };

            // Really add the child to the new children set
            if !new_children.insert(child_task_id) {
                drop(parent_task);

                // There was a concurrent connect child operation,
                // so we need to undo the active count update.
                AggregationUpdateQueue::run(
                    AggregationUpdateJob::DecreaseActiveCount {
                        task: child_task_id,
                    },
                    &mut ctx,
                );
            }
        }
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext<'_>) {
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
