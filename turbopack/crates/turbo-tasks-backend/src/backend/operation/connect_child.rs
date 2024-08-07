use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{ExecuteContext, Operation};
use crate::data::CachedDataItem;

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum ConnectChildOperation {
    Todo,
    #[default]
    Done,
    // TODO Add aggregated edge
}

impl ConnectChildOperation {
    pub fn run(parent_task: TaskId, child_task: TaskId, ctx: ExecuteContext<'_>) {
        let mut parent_task = ctx.task(parent_task);
        if parent_task.add(CachedDataItem::Child {
            task: child_task,
            value: (),
        }) {
            // TODO add aggregated edge
            ConnectChildOperation::Todo.execute(ctx);
        }
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                ConnectChildOperation::Todo => {
                    self = ConnectChildOperation::Done;
                    continue;
                }
                ConnectChildOperation::Done => {
                    return;
                }
            }
        }
    }
}
