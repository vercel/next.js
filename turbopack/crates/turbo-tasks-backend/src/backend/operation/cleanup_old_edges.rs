use std::mem::take;

use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{
    aggregation_update::{
        get_aggregation_number, get_uppers, is_aggregating_node, AggregationUpdateJob,
        AggregationUpdateQueue,
    },
    invalidate::make_task_dirty,
    ExecuteContext, Operation,
};
use crate::{
    backend::TaskDataCategory,
    data::{CachedDataItemKey, CellRef},
};

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum CleanupOldEdgesOperation {
    RemoveEdges {
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
        queue: AggregationUpdateQueue,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
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
    RemovedCellDependent(TaskId),
}

impl CleanupOldEdgesOperation {
    pub fn run(
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
        data_update: Option<AggregationUpdateJob>,
        ctx: ExecuteContext<'_>,
    ) {
        let mut queue = AggregationUpdateQueue::new();
        queue.extend(data_update);
        CleanupOldEdgesOperation::RemoveEdges {
            task_id,
            outdated,
            queue,
        }
        .execute(&ctx);
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
                    ref mut queue,
                } => {
                    if let Some(edge) = outdated.pop() {
                        match edge {
                            OutdatedEdge::Child(child_id) => {
                                let mut task = ctx.task(task_id, TaskDataCategory::All);
                                task.remove(&CachedDataItemKey::Child { task: child_id });
                                if is_aggregating_node(get_aggregation_number(&task)) {
                                    queue.push(AggregationUpdateJob::InnerLostFollower {
                                        upper_ids: vec![task_id],
                                        lost_follower_id: child_id,
                                    });
                                } else {
                                    let upper_ids = get_uppers(&task);
                                    queue.push(AggregationUpdateJob::InnerLostFollower {
                                        upper_ids,
                                        lost_follower_id: child_id,
                                    });
                                }
                            }
                            OutdatedEdge::CellDependency(CellRef {
                                task: cell_task_id,
                                cell,
                            }) => {
                                {
                                    let mut task = ctx.task(cell_task_id, TaskDataCategory::Data);
                                    task.remove(&CachedDataItemKey::CellDependent {
                                        cell,
                                        task: task_id,
                                    });
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
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
                                    let mut task = ctx.task(output_task_id, TaskDataCategory::Data);
                                    task.remove(&CachedDataItemKey::OutputDependent {
                                        task: task_id,
                                    });
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
                                    task.remove(&CachedDataItemKey::OutputDependency {
                                        target: output_task_id,
                                    });
                                }
                            }
                            OutdatedEdge::RemovedCellDependent(task_id) => {
                                make_task_dirty(task_id, queue, ctx);
                            }
                        }
                    }

                    if outdated.is_empty() {
                        self = CleanupOldEdgesOperation::AggregationUpdate { queue: take(queue) };
                    }
                }
                CleanupOldEdgesOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = CleanupOldEdgesOperation::Done;
                    }
                }
                CleanupOldEdgesOperation::Done => {
                    return;
                }
            }
        }
    }
}
