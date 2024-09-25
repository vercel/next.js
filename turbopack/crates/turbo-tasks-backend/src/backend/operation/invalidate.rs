use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use super::{
    aggregation_update::{AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue},
    ExecuteContext, Operation,
};
use crate::{
    backend::TaskDataCategory,
    data::{CachedDataItem, CachedDataItemKey},
    get,
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
    if ctx.is_once_task(task_id) {
        return;
    }

    let mut task = ctx.task(task_id, TaskDataCategory::All);

    if task.add(CachedDataItem::Dirty { value: () }) {
        let dirty_container = get!(task, AggregatedDirtyContainerCount)
            .copied()
            .unwrap_or_default();
        if dirty_container == 0 {
            queue.extend(AggregationUpdateJob::data_update(
                &mut task,
                AggregatedDataUpdate::dirty_container(task_id),
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
}
