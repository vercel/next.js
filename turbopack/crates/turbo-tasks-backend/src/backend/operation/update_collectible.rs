use std::cmp::min;

use smallvec::SmallVec;
use turbo_tasks::TaskId;

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue, ExecuteContext,
            Operation,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::CollectibleRef,
};

pub struct UpdateCollectibleOperation;

impl UpdateCollectibleOperation {
    pub fn run(
        task_id: TaskId,
        collectible: CollectibleRef,
        mut count: i32,
        mut ctx: impl ExecuteContext<'_>,
    ) {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        if count < 0
            && task
                .get_persistent_task_type()
                .is_some_and(|t| !t.native_fn.is_root)
        {
            drop(task);
            panic!(
                "Removing collectibles from non-root task {} (emitting task: {}). The `root` \
                 attribute is missing on the task.",
                ctx.debug_get_task_description(task_id),
                ctx.debug_get_task_description(task_id)
            );
        }
        let mut queue = AggregationUpdateQueue::new();
        let outdated = task.get_outdated_collectibles(&collectible).copied();
        if let Some(outdated) = outdated {
            if count > 0 && outdated > 0 {
                let shared = min(count, outdated);
                let _ = task.update_outdated_collectibles_positive_crossing(collectible, -shared);
                count -= shared;
            } else if count < 0 && outdated < 0 {
                let shared = min(-count, -outdated);
                let _ = task.update_outdated_collectibles_positive_crossing(collectible, shared);
                count += shared;
            } else {
                // Not reduced from outdated
            }
        }
        if count != 0 {
            if task.update_collectibles_positive_crossing(collectible, count) {
                let ty = collectible.collectible_type;
                let dependent: SmallVec<[TaskId; 4]> = task
                    .iter_collectibles_dependents()
                    .filter_map(|(collectible_type, task)| (collectible_type == ty).then_some(task))
                    .collect();
                if !dependent.is_empty() {
                    queue.push(AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                        task_ids: dependent,
                        #[cfg(feature = "task_dirty_cause")]
                        collectible_type: ty,
                    })
                }
            }
            queue.extend(AggregationUpdateJob::data_update(
                &mut task,
                AggregatedDataUpdate::new().collectibles_update(vec![(collectible, count)]),
            ));
        }

        drop(task);

        queue.execute(&mut ctx);
    }
}
