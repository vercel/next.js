use std::mem::take;

use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{CellId, TaskId, TypedSharedReference, backend::CellContent};

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
        content: Option<TypedSharedReference>,
        queue: AggregationUpdateQueue,
    },
    FinalCellChange {
        cell_ref: CellRef,
        content: Option<TypedSharedReference>,
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

        // We need to detect recomputation, because here the content has not actually changed (even
        // if it's not equal to the old content, as not all values implement Eq). We have to
        // assume that tasks are deterministic and pure.
        let should_invalidate = ctx.should_track_dependencies()
            && (task.has_key(&CachedDataItemKey::Dirty {}) ||
            // This is a hack for the streaming hack. Stateful tasks are never recomputed, so this forces invalidation for them in case of this hack.
            task.has_key(&CachedDataItemKey::Stateful {}));

        if should_invalidate {
            let dependent_tasks: SmallVec<[TaskId; 4]> = get_many!(
                task,
                CellDependent { cell: dependent_cell, task }
                if dependent_cell == cell
                => task
            );

            if !dependent_tasks.is_empty() {
                // Slow path: We need to invalidate tasks depending on this cell.
                // To avoid a race condition, we need to remove the old content first,
                // then invalidate dependent tasks and only then update the cell content.

                // The reason behind this is that we consider tasks that haven't the dirty flag set
                // as "recomputing" tasks. Recomputing tasks won't invalidate
                // dependent tasks, when a cell is changed. This would cause missing invalidating if
                // a task is recomputing while a dependency is in the middle of a cell update (where
                // the value has been changed, but the dependent tasks have not be flagged dirty
                // yet). So to avoid that we first remove the cell content, invalidate all dependent
                // tasks and after that set the new cell content. When the cell content is unset,
                // readers will wait for it to be set via InProgressCell.

                let old_content = task.remove(&CachedDataItemKey::CellData { cell });

                drop(task);
                drop(old_content);

                let content = if let CellContent(Some(new_content)) = content {
                    Some(new_content.into_typed(cell.type_id))
                } else {
                    None
                };

                UpdateCellOperation::InvalidateWhenCellDependency {
                    cell_ref: CellRef {
                        task: task_id,
                        cell,
                    },
                    dependent_tasks,
                    content,
                    queue: AggregationUpdateQueue::new(),
                }
                .execute(&mut ctx);
                return;
            }
        }

        // Fast path: We don't need to invalidate anything.
        // So we can just update the cell content.

        let old_content = if let CellContent(Some(new_content)) = content {
            let new_content = new_content.into_typed(cell.type_id);
            task.insert(CachedDataItem::CellData {
                cell,
                value: new_content,
            })
        } else {
            task.remove(&CachedDataItemKey::CellData { cell })
        };

        let in_progress_cell = remove!(task, InProgressCell { cell });

        drop(task);
        drop(old_content);

        if let Some(in_progress) = in_progress_cell {
            in_progress.event.notify(usize::MAX);
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
                    ref mut content,
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
                        self = UpdateCellOperation::FinalCellChange {
                            cell_ref,
                            content: take(content),
                            queue: take(queue),
                        };
                    }
                }
                UpdateCellOperation::FinalCellChange {
                    cell_ref: CellRef { task, cell },
                    content,
                    ref mut queue,
                } => {
                    let mut task = ctx.task(task, TaskDataCategory::Data);

                    if let Some(content) = content {
                        task.add_new(CachedDataItem::CellData {
                            cell,
                            value: content,
                        })
                    }

                    let in_progress_cell = remove!(task, InProgressCell { cell });

                    drop(task);

                    if let Some(in_progress) = in_progress_cell {
                        in_progress.event.notify(usize::MAX);
                    }

                    self = UpdateCellOperation::AggregationUpdate { queue: take(queue) };
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
