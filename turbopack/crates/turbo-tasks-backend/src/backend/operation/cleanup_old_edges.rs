use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{ExecuteContext, Operation};
use crate::data::{CachedDataItemKey, CellRef};

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum CleanupOldEdgesOperation {
    RemoveEdges {
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
    },
    #[default]
    Done,
    // TODO Add aggregated edge
}

#[derive(Serialize, Deserialize, Clone)]
pub enum OutdatedEdge {
    Child(TaskId),
    CellDependency(CellRef),
    OutputDependency(TaskId),
}

impl CleanupOldEdgesOperation {
    pub fn run(task_id: TaskId, outdated: Vec<OutdatedEdge>, ctx: ExecuteContext<'_>) {
        CleanupOldEdgesOperation::RemoveEdges { task_id, outdated }.execute(&ctx);
    }
}

impl Operation for CleanupOldEdgesOperation {
    fn execute(mut self, ctx: &ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                CleanupOldEdgesOperation::RemoveEdges {
                    task_id,
                    ref mut outdated,
                } => {
                    if let Some(edge) = outdated.pop() {
                        match edge {
                            OutdatedEdge::Child(child_id) => {
                                let mut task = ctx.task(task_id);
                                task.remove(&CachedDataItemKey::Child { task: child_id });
                                // TODO remove aggregated edge
                            }
                            OutdatedEdge::CellDependency(CellRef {
                                task: cell_task_id,
                                cell,
                            }) => {
                                {
                                    let mut task = ctx.task(cell_task_id);
                                    task.remove(&CachedDataItemKey::CellDependent {
                                        cell,
                                        task: task_id,
                                    });
                                }
                                {
                                    let mut task = ctx.task(task_id);
                                    task.remove(&CachedDataItemKey::CellDependency {
                                        target: CellRef {
                                            task: cell_task_id,
                                            cell,
                                        },
                                    });
                                }
                            }
                            OutdatedEdge::OutputDependency(output_task_id) => {
                                {
                                    let mut task = ctx.task(output_task_id);
                                    task.remove(&CachedDataItemKey::OutputDependent {
                                        task: task_id,
                                    });
                                }
                                {
                                    let mut task = ctx.task(task_id);
                                    task.remove(&CachedDataItemKey::OutputDependency {
                                        target: output_task_id,
                                    });
                                }
                            }
                        }
                    }

                    if outdated.is_empty() {
                        self = CleanupOldEdgesOperation::Done;
                    }
                    continue;
                }
                CleanupOldEdgesOperation::Done => {
                    return;
                }
            }
        }
    }
}
