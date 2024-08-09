use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use super::{ExecuteContext, Operation};
use crate::{
    data::{CachedDataItem, InProgressState},
    get, remove,
};

#[derive(Serialize, Deserialize, Clone, Default)]
pub enum InvalidateOperation {
    // TODO DetermineActiveness
    MakeDirty {
        task_ids: SmallVec<[TaskId; 4]>,
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
    fn execute(self, ctx: &ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                InvalidateOperation::MakeDirty { task_ids } => {
                    for task_id in task_ids {
                        let mut task = ctx.task(task_id);
                        let in_progress = match get!(task, InProgress) {
                            Some(InProgressState::Scheduled { clean, .. }) => {
                                if *clean {
                                    let Some(InProgressState::Scheduled {
                                        clean: _,
                                        done_event,
                                        start_event,
                                    }) = remove!(task, InProgress)
                                    else {
                                        unreachable!();
                                    };
                                    task.insert(CachedDataItem::InProgress {
                                        value: InProgressState::Scheduled {
                                            clean: false,
                                            done_event,
                                            start_event,
                                        },
                                    });
                                }
                                true
                            }
                            Some(InProgressState::InProgress { clean, stale, .. }) => {
                                if *clean || !*stale {
                                    let Some(InProgressState::InProgress {
                                        clean: _,
                                        stale: _,
                                        done_event,
                                    }) = remove!(task, InProgress)
                                    else {
                                        unreachable!();
                                    };
                                    task.insert(CachedDataItem::InProgress {
                                        value: InProgressState::InProgress {
                                            clean: false,
                                            stale: true,
                                            done_event,
                                        },
                                    });
                                }
                                true
                            }
                            None => false,
                        };
                        if task.add(CachedDataItem::Dirty { value: () })
                            && !in_progress
                            && task.add(CachedDataItem::new_scheduled(task_id))
                        {
                            ctx.turbo_tasks.schedule(task_id)
                        }
                    }
                    return;
                }
                InvalidateOperation::Done => {
                    return;
                }
            }
        }
    }
}
