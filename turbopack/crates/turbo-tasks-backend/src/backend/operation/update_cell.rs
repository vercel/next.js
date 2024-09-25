use turbo_tasks::{backend::CellContent, CellId, TaskId};

use super::{ExecuteContext, InvalidateOperation};
use crate::{
    backend::TaskDataCategory,
    data::{CachedDataItem, CachedDataItemKey},
    get_many, remove,
};

pub struct UpdateCellOperation;

impl UpdateCellOperation {
    pub fn run(task_id: TaskId, cell: CellId, content: CellContent, ctx: ExecuteContext<'_>) {
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

        let recomputed = old_content.is_none() && !task.has_key(&CachedDataItemKey::Dirty {});

        if recomputed {
            // Task wasn't invalidated, so we just recompute, so the content has not actually
            // changed (At least we have to assume that tasks are deterministic and
            // pure).
            drop(task);
            drop(old_content);
            return;
        }

        let dependent = get_many!(
            task,
            CellDependent { cell: dependent_cell, task } _value
            if dependent_cell == cell
            => task
        );

        drop(task);
        drop(old_content);

        InvalidateOperation::run(dependent, ctx);
    }
}
