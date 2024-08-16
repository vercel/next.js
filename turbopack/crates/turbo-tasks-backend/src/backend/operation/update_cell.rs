use turbo_tasks::{backend::CellContent, CellId, TaskId};

use super::{ExecuteContext, InvalidateOperation};
use crate::{
    data::{CachedDataItem, CachedDataItemKey},
    remove,
};

pub struct UpdateCellOperation;

impl UpdateCellOperation {
    pub fn run(task_id: TaskId, cell: CellId, content: CellContent, ctx: ExecuteContext<'_>) {
        let mut task = ctx.task(task_id);
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

        let dependent = task
            .iter()
            .filter_map(|(key, _)| {
                if let CachedDataItemKey::CellDependent {
                    cell: dependent_cell,
                    task,
                } = *key
                {
                    (dependent_cell == cell).then_some(task)
                } else {
                    None
                }
            })
            .collect();

        drop(task);
        drop(old_content);

        let _span = tracing::trace_span!(
            "cell changed",
            task = ctx.backend.get_task_desc_fn(task_id)(),
            cell = ?cell
        )
        .entered();
        InvalidateOperation::run(dependent, ctx);
    }
}
