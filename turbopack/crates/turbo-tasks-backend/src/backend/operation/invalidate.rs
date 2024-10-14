use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use crate::{
    backend::{
        operation::{
            aggregation_update::{
                AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue,
            },
            ExecuteContext, Operation,
        },
        storage::{get, get_mut},
        TaskDataCategory,
    },
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, DirtyState, InProgressState},
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
    #[default]
    Done,
}

impl InvalidateOperation {
    pub fn run(task_ids: SmallVec<[TaskId; 4]>, mut ctx: ExecuteContext<'_>) {
        InvalidateOperation::MakeDirty { task_ids }.execute(&mut ctx)
    }
}

impl Operation for InvalidateOperation {
    fn execute(mut self, ctx: &mut ExecuteContext<'_>) {
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

pub fn make_task_dirty(
    task_id: TaskId,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut ExecuteContext,
) {
    if ctx.is_once_task(task_id) {
        return;
    }

    let mut task = ctx.task(task_id, TaskDataCategory::All);

    make_task_dirty_internal(&mut task, task_id, true, queue, ctx);
}

pub fn make_task_dirty_internal(
    task: &mut super::TaskGuard,
    task_id: TaskId,
    make_stale: bool,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut ExecuteContext,
) {
    if make_stale {
        if let Some(InProgressState::InProgress { stale, .. }) = get_mut!(task, InProgress) {
            *stale = true;
        }
    }
    let old = task.insert(CachedDataItem::Dirty {
        value: DirtyState {
            clean_in_session: None,
        },
    });
    let mut dirty_container = match old {
        Some(CachedDataItemValue::Dirty {
            value: DirtyState {
                clean_in_session: None,
            },
        }) => {
            // already dirty
            return;
        }
        Some(CachedDataItemValue::Dirty {
            value: DirtyState {
                clean_in_session: Some(session_id),
            },
        }) => {
            // Got dirty in that one session only
            let mut dirty_container = get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default();
            dirty_container.update_session_dependent(session_id, 1);
            dirty_container
        }
        None => {
            // Get dirty for all sessions
            get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default()
        }
        _ => unreachable!(),
    };
    let aggregated_update = dirty_container.update_with_dirty_state(&DirtyState {
        clean_in_session: None,
    });
    if !aggregated_update.is_zero() {
        queue.extend(AggregationUpdateJob::data_update(
            task,
            AggregatedDataUpdate::new().dirty_container_update(task_id, aggregated_update),
        ));
    }
    let root = task.has_key(&CachedDataItemKey::AggregateRoot {});
    if root {
        let description = ctx.backend.get_task_desc_fn(task_id);
        if task.add(CachedDataItem::new_scheduled(description)) {
            ctx.schedule(task_id);
        }
    }
}
