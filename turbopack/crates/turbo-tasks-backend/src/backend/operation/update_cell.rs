use turbo_tasks::{backend::CellContent, CellId, TaskId};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        operation::{ExecuteContext, InvalidateOperation, TaskGuard},
        storage::{get_many, remove},
        TaskDataCategory,
    },
    data::{CachedDataItem, CachedDataItemKey},
};

pub struct UpdateCellOperation;

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
            let dependent = get_many!(
                task,
                CellDependent { cell: dependent_cell, task }
                if dependent_cell == cell
                => task
            );

            drop(task);
            drop(old_content);

            InvalidateOperation::run(
                dependent,
                #[cfg(feature = "trace_task_dirty")]
                TaskDirtyCause::CellChange {
                    value_type: cell.type_id,
                },
                ctx,
            );
        } else {
            drop(task);
            drop(old_content);
        }
    }
}
