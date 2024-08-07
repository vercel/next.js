use std::borrow::Cow;

use anyhow::{anyhow, Result};
use turbo_tasks::{util::SharedError, RawVc, TaskId};

use super::{ExecuteContext, InvalidateOperation};
use crate::data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, CellRef, OutputValue};

pub struct UpdateOutputOperation;

impl UpdateOutputOperation {
    pub fn run(
        task_id: TaskId,
        output: Result<Result<RawVc>, Option<Cow<'static, str>>>,
        ctx: ExecuteContext<'_>,
    ) {
        let mut task = ctx.task(task_id);
        let old_error = task.remove(&CachedDataItemKey::Error {});
        let current_output = task.get(&CachedDataItemKey::Output {});
        let output_value = match output {
            Ok(Ok(RawVc::TaskOutput(output_task_id))) => {
                if let Some(CachedDataItemValue::Output {
                    value: OutputValue::Output(current_task_id),
                }) = current_output
                {
                    if *current_task_id == output_task_id {
                        return;
                    }
                }
                OutputValue::Output(output_task_id)
            }
            Ok(Ok(RawVc::TaskCell(output_task_id, cell))) => {
                if let Some(CachedDataItemValue::Output {
                    value:
                        OutputValue::Cell(CellRef {
                            task: current_task_id,
                            cell: current_cell,
                        }),
                }) = current_output
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
            Ok(Ok(RawVc::LocalCell(_, _))) => {
                panic!("LocalCell must not be output of a task");
            }
            Ok(Err(err)) => {
                task.insert(CachedDataItem::Error {
                    value: SharedError::new(err),
                });
                OutputValue::Error
            }
            Err(panic) => {
                task.insert(CachedDataItem::Error {
                    value: SharedError::new(anyhow!("Panic: {:?}", panic)),
                });
                OutputValue::Panic
            }
        };
        let old_content = task.insert(CachedDataItem::Output {
            value: output_value,
        });

        let dependent = task
            .iter()
            .filter_map(|(key, _)| {
                if let CachedDataItemKey::OutputDependent { task } = *key {
                    Some(task)
                } else {
                    None
                }
            })
            .collect();

        drop(task);
        drop(old_content);
        drop(old_error);

        InvalidateOperation::run(dependent, ctx);
    }
}
