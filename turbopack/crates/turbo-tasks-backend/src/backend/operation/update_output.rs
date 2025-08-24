use std::mem::take;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{RawVc, TaskId, backend::TurboTasksExecutionError};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregationUpdateQueue, ExecuteContext, Operation, TaskGuard,
            invalidate::{make_task_dirty, make_task_dirty_internal},
        },
        storage::{get, get_many},
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
        dependent_tasks: SmallVec<[TaskId; 4]>,
        children: SmallVec<[TaskId; 4]>,
        queue: AggregationUpdateQueue,
    },
    EnsureUnfinishedChildrenDirty {
        children: SmallVec<[TaskId; 4]>,
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
        output: Result<RawVc, TurboTasksExecutionError>,
        mut ctx: impl ExecuteContext,
    ) {
        let mut dependent_tasks = Default::default();
        let mut children = Default::default();
        let mut queue = AggregationUpdateQueue::new();

        'output: {
            let mut task = ctx.task(task_id, TaskDataCategory::All);
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
                break 'output;
            }
            if ctx.should_track_children() {
                children = new_children.iter().copied().collect();
            }

            let current_output = get!(task, Output);
            let output_value = match output {
                Ok(RawVc::TaskOutput(output_task_id)) => {
                    if let Some(OutputValue::Output(current_task_id)) = current_output
                        && *current_task_id == output_task_id
                    {
                        break 'output;
                    }
                    OutputValue::Output(output_task_id)
                }
                Ok(RawVc::TaskCell(output_task_id, cell)) => {
                    if let Some(OutputValue::Cell(CellRef {
                        task: current_task_id,
                        cell: current_cell,
                    })) = current_output
                        && *current_task_id == output_task_id
                        && *current_cell == cell
                    {
                        break 'output;
                    }
                    OutputValue::Cell(CellRef {
                        task: output_task_id,
                        cell,
                    })
                }
                Ok(RawVc::LocalOutput(..)) => {
                    panic!("Non-local tasks must not return a local Vc");
                }
                Err(err) => {
                    if let Some(OutputValue::Error(old_error)) = current_output
                        && old_error == &err
                    {
                        break 'output;
                    }
                    OutputValue::Error(err)
                }
            };
            let old_content = task.insert(CachedDataItem::Output {
                value: output_value,
            });

            if ctx.should_track_dependencies() {
                dependent_tasks = get_many!(task, OutputDependent { task } => task);
            }

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
        }

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
