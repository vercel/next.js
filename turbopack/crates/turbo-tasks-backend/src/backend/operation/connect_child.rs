use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{ExecuteContext, Operation};
use crate::{data::CachedDataItem, suspend_point};

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum ConnectChildOperation {
    AddChild {
        parent_task: TaskId,
        child_task: TaskId,
    },
    #[default]
    Done,
    // TODO Add aggregated edge
}

impl ConnectChildOperation {
    pub fn new(parent_task: TaskId, child_task: TaskId) -> Self {
        ConnectChildOperation::AddChild {
            parent_task,
            child_task,
        }
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: ExecuteContext<'_>) {
        loop {
            match self {
                ConnectChildOperation::AddChild {
                    parent_task,
                    child_task,
                } => {
                    let mut parent_task = ctx.task(parent_task);
                    if parent_task.add(CachedDataItem::Child {
                        task: child_task,
                        value: (),
                    }) {
                        // TODO add aggregated edge
                        suspend_point!(self, ctx, ConnectChildOperation::Done);
                    } else {
                        suspend_point!(self, ctx, ConnectChildOperation::Done);
                    }
                }
                ConnectChildOperation::Done => {
                    return;
                }
            }
        }
    }
}
