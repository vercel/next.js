use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use super::{
    aggregation_update::{AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue},
    ExecuteContext, Operation,
};
use crate::{
    data::{CachedDataItem, InProgressState},
    get, update,
};

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum InvalidateOperation {
    // TODO DetermineActiveness
    MakeDirty {
        task_ids: SmallVec<[TaskId; 4]>,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
    },
    // TODO Add to dirty tasks list
    #[default]
    Done,
}

impl InvalidateOperation {
    pub fn run(task_ids: SmallVec<[TaskId; 4]>, ctx: ExecuteContext<'_>) {
        InvalidateOperation::MakeDirty { task_ids }.execute(&ctx)
    }
}

impl Operation for InvalidateOperation {
    fn execute(mut self, ctx: &ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                InvalidateOperation::MakeDirty { task_ids } => {
                    let mut queue = AggregationUpdateQueue::new();
                    for task_id in task_ids {
                        make_task_dirty(task_id, &mut queue, ctx);
                    }
                    if queue.is_empty() {
                        self = InvalidateOperation::Done
                    } else {
                        self = InvalidateOperation::AggregationUpdate { queue }
                    }
                    continue;
                }
                InvalidateOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = InvalidateOperation::Done
                    }
                }
                InvalidateOperation::Done => {
                    return;
                }
            }
        }
    }
}

pub fn make_task_dirty(task_id: TaskId, queue: &mut AggregationUpdateQueue, ctx: &ExecuteContext) {
    let mut task = ctx.task(task_id);

    if task.add(CachedDataItem::Dirty { value: () }) {
        let in_progress = match get!(task, InProgress) {
            Some(InProgressState::Scheduled { clean, .. }) => {
                if *clean {
                    update!(task, InProgress, |in_progress| {
                        let Some(InProgressState::Scheduled {
                            clean: _,
                            done_event,
                            start_event,
                        }) = in_progress
                        else {
                            unreachable!();
                        };
                        Some(InProgressState::Scheduled {
                            clean: false,
                            done_event,
                            start_event,
                        })
                    });
                }
                true
            }
            Some(InProgressState::InProgress { clean, stale, .. }) => {
                if *clean || !*stale {
                    update!(task, InProgress, |in_progress| {
                        let Some(InProgressState::InProgress {
                            clean: _,
                            stale: _,
                            done_event,
                        }) = in_progress
                        else {
                            unreachable!();
                        };
                        Some(InProgressState::InProgress {
                            clean: false,
                            stale: true,
                            done_event,
                        })
                    });
                }
                true
            }
            None => false,
        };
        if !in_progress && task.add(CachedDataItem::new_scheduled(task_id)) {
            ctx.turbo_tasks.schedule(task_id)
        }
        queue.push(AggregationUpdateJob::DataUpdate {
            task_id,
            update: AggregatedDataUpdate::dirty_task(task_id),
        })
    }
}
