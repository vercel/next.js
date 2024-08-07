use turbo_tasks::{backend::CellContent, CellId, TaskId};

use super::{ExecuteContext, InvalidateOperation};
use crate::data::{CachedDataItem, CachedDataItemKey};

pub struct UpdateCellOperation;

impl UpdateCellOperation {
    pub fn run(task: TaskId, cell: CellId, content: CellContent, ctx: ExecuteContext<'_>) {
        let mut task = ctx.task(task);
        let old_content = if let CellContent(Some(new_content)) = content {
            task.insert(CachedDataItem::CellData {
                cell,
                value: new_content,
            })
        } else {
            task.remove(&CachedDataItemKey::CellData { cell })
        };

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

        InvalidateOperation::run(dependent, ctx);
    }
}
