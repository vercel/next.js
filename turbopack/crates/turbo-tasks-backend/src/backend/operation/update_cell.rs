use std::mem::take;

use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{CellId, TaskId, backend::CellContent};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregationUpdateQueue, ExecuteContext, Operation, TaskGuard,
            invalidate::make_task_dirty_internal,
        },
        storage::{get_many, remove},
    },
    data::{CachedDataItem, CachedDataItemKey, CellRef},
};

#[derive(Serialize, Deserialize, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum UpdateCellOperation {
    InvalidateWhenCellDependency {
        cell_ref: CellRef,
        dependent_tasks: SmallVec<[TaskId; 4]>,
        queue: AggregationUpdateQueue,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl UpdateCellOperation {
    pub fn run(task_id: TaskId, cell: CellId, content: CellContent, mut ctx: impl ExecuteContext) {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let old_content = if let CellContent(Some(new_content)) = content {
            task.insert(CachedDataItem::CellData {
                cell,
                value: new_content.into_typed(cell.type_id),
            })
        } else {
            task.remove(&CachedDataItemKey::CellData { cell })
        };

        if let Some(in_progress) = remove!(task, InProgressCell { cell }) {
            in_progress.event.notify(usize::MAX);
        }

        // We need to detect recomputation, because here the content has not actually changed (even
        // if it's not equal to the old content, as not all values implement Eq). We have to
        // assume that tasks are deterministic and pure.

        if ctx.should_track_dependencies()
            && (task.has_key(&CachedDataItemKey::Dirty {})
                ||
                // This is a hack for the streaming hack. Stateful tasks are never recomputed, so this forces invalidation for them in case of this hack.
                task.has_key(&CachedDataItemKey::Stateful {}))
        {
            let dependent_tasks = get_many!(
                task,
                CellDependent { cell: dependent_cell, task }
                if dependent_cell == cell
                => task
            );

            drop(task);
            drop(old_content);

            UpdateCellOperation::InvalidateWhenCellDependency {
                cell_ref: CellRef {
                    task: task_id,
                    cell,
                },
                dependent_tasks,
                queue: AggregationUpdateQueue::new(),
            }
            .execute(&mut ctx);
        } else {
            drop(task);
            drop(old_content);
        }
    }
}

impl Operation for UpdateCellOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                UpdateCellOperation::InvalidateWhenCellDependency {
                    cell_ref,
                    ref mut dependent_tasks,
                    ref mut queue,
                } => {
                    if let Some(dependent_task_id) = dependent_tasks.pop() {
                        if ctx.is_once_task(dependent_task_id) {
                            // once tasks are never invalidated
                            continue;
                        }
                        let dependent = ctx.task(dependent_task_id, TaskDataCategory::All);
                        if dependent.has_key(&CachedDataItemKey::OutdatedCellDependency {
                            target: cell_ref,
                        }) {
                            // cell dependency is outdated, so it hasn't read the cell yet
                            // and doesn't need to be invalidated
                            continue;
                        }
                        if !dependent
                            .has_key(&CachedDataItemKey::CellDependency { target: cell_ref })
                        {
                            // cell dependency has been removed, so the task doesn't depend on the
                            // cell anymore and doesn't need to be
                            // invalidated
                            continue;
                        }
                        make_task_dirty_internal(
                            dependent,
                            dependent_task_id,
                            true,
                            #[cfg(feature = "trace_task_dirty")]
                            TaskDirtyCause::CellChange {
                                value_type: cell_ref.cell.type_id,
                            },
                            queue,
                            ctx,
                        );
                    }
                    if dependent_tasks.is_empty() {
                        self = UpdateCellOperation::AggregationUpdate { queue: take(queue) };
                    }
                }
                UpdateCellOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = UpdateCellOperation::Done
                    }
                }
                UpdateCellOperation::Done => {
                    return;
                }
            }
        }
    }
}
