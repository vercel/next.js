use std::{borrow::Cow, mem::take};

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use turbo_tasks::{util::SharedError, RawVc, TaskId};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        operation::{
            invalidate::{make_task_dirty, make_task_dirty_internal},
            AggregationUpdateQueue, ExecuteContext, Operation, TaskGuard,
        },
        storage::{get, get_many},
        TaskDataCategory,
    },
    data::{
        CachedDataItem, CachedDataItemKey, CellRef, InProgressState, InProgressStateInner,
        OutputValue,
    },
};

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum UpdateOutputOperation {
    MakeDependentTasksDirty {
        #[cfg(feature = "trace_task_dirty")]
        task_id: TaskId,
        dependent_tasks: Vec<TaskId>,
        children: Vec<TaskId>,
        queue: AggregationUpdateQueue,
    },
    EnsureUnfinishedChildrenDirty {
        children: Vec<TaskId>,
        queue: AggregationUpdateQueue,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl UpdateOutputOperation {
    pub fn run(
        task_id: TaskId,
        output: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        mut ctx: impl ExecuteContext,
    ) {
        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        let Some(InProgressState::InProgress(box InProgressStateInner {
            stale,
            new_children,
            ..
        })) = get!(task, InProgress)
        else {
            panic!("Task is not in progress while updating the output");
        };
        if *stale {
            // Skip updating the output when the task is stale
            return;
        }
        let children = ctx
            .should_track_children()
            .then(|| new_children.iter().copied().collect())
            .unwrap_or_default();

        let old_error = task.remove(&CachedDataItemKey::Error {});
        let current_output = get!(task, Output);
        let output_value = match output {
            Ok(Ok(RawVc::TaskOutput(output_task_id))) => {
                if let Some(OutputValue::Output(current_task_id)) = current_output {
                    if *current_task_id == output_task_id {
                        return;
                    }
                }
                OutputValue::Output(output_task_id)
            }
            Ok(Ok(RawVc::TaskCell(output_task_id, cell))) => {
                if let Some(OutputValue::Cell(CellRef {
                    task: current_task_id,
                    cell: current_cell,
                })) = current_output
                {
                    if *current_task_id == output_task_id && *current_cell == cell {
                        return;
                    }
                }
                OutputValue::Cell(CellRef {
                    task: output_task_id,
                    cell,
                })
            }
            Ok(Ok(RawVc::LocalOutput(_, _))) => {
                panic!("LocalOutput must not be output of a task");
            }
            Ok(Err(err)) => {
                task.insert(CachedDataItem::Error {
                    value: SharedError::new(err.context(format!(
                        "Execution of {} failed",
                        ctx.get_task_description(task_id)
                    ))),
                });
                OutputValue::Error
            }
            Err(panic) => {
                task.insert(CachedDataItem::Error {
                    value: SharedError::new(anyhow!(
                        "Panic in {}: {:?}",
                        ctx.get_task_description(task_id),
                        panic
                    )),
                });
                OutputValue::Panic
            }
        };
        let old_content = task.insert(CachedDataItem::Output {
            value: output_value,
        });

        let dependent_tasks = ctx
            .should_track_dependencies()
            .then(|| get_many!(task, OutputDependent { task } => task))
            .unwrap_or_default();

        let mut queue = AggregationUpdateQueue::new();

        make_task_dirty_internal(
            &mut task,
            task_id,
            false,
            #[cfg(feature = "trace_task_dirty")]
            TaskDirtyCause::InitialDirty,
            &mut queue,
            &ctx,
        );

        drop(task);
        drop(old_content);
        drop(old_error);

        UpdateOutputOperation::MakeDependentTasksDirty {
            #[cfg(feature = "trace_task_dirty")]
            task_id,
            dependent_tasks,
            children,
            queue,
        }
        .execute(&mut ctx);
    }
}

impl Operation for UpdateOutputOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                UpdateOutputOperation::MakeDependentTasksDirty {
                    #[cfg(feature = "trace_task_dirty")]
                    task_id,
                    ref mut dependent_tasks,
                    ref mut children,
                    ref mut queue,
                } => {
                    if let Some(dependent_task_id) = dependent_tasks.pop() {
                        make_task_dirty(
                            dependent_task_id,
                            #[cfg(feature = "trace_task_dirty")]
                            TaskDirtyCause::OutputChange { task_id },
                            queue,
                            ctx,
                        );
                    }
                    if dependent_tasks.is_empty() {
                        self = UpdateOutputOperation::EnsureUnfinishedChildrenDirty {
                            children: take(children),
                            queue: take(queue),
                        };
                    }
                }
                UpdateOutputOperation::EnsureUnfinishedChildrenDirty {
                    ref mut children,
                    ref mut queue,
                } => {
                    if let Some(child_id) = children.pop() {
                        let mut child_task = ctx.task(child_id, TaskDataCategory::Meta);
                        if !child_task.has_key(&CachedDataItemKey::Output {}) {
                            make_task_dirty_internal(
                                &mut child_task,
                                child_id,
                                false,
                                #[cfg(feature = "trace_task_dirty")]
                                TaskDirtyCause::InitialDirty,
                                queue,
                                ctx,
                            );
                        }
                    }
                    if children.is_empty() {
                        self = UpdateOutputOperation::AggregationUpdate { queue: take(queue) };
                    }
                }
                UpdateOutputOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = UpdateOutputOperation::Done;
                    }
                }
                UpdateOutputOperation::Done => {
                    return;
                }
            }
        }
    }
}
