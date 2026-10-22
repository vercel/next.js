use std::cmp::min;

use smallvec::{SmallVec, smallvec};
use turbo_tasks::{TaskId, TraitTypeId};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue, ExecuteContext,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::CollectibleRef,
};

pub struct UpdateCollectibleOperation;

impl UpdateCollectibleOperation {
    pub fn run(task_id: TaskId, collectible: CollectibleRef, count: i32, ctx: ExecuteContext<'_>) {
        Self::run_batch(task_id, smallvec![(collectible, count)], ctx);
    }

    /// Applies all count changes of `collectibles` to the task in a single operation: the task is
    /// locked once, and a single aggregated data update is propagated through the aggregation
    /// graph.
    pub fn run_batch(
        task_id: TaskId,
        mut collectibles: SmallVec<[(CollectibleRef, i32); 1]>,
        mut ctx: ExecuteContext<'_>,
    ) {
        if collectibles.is_empty() {
            return;
        }
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        if collectibles.iter().any(|&(_, count)| count < 0)
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
        let mut invalidated_types: SmallVec<[TraitTypeId; 1]> = SmallVec::new();
        collectibles.retain(|(collectible, count)| {
            let collectible = *collectible;
            let outdated = task.get_outdated_collectibles(&collectible).copied();
            if let Some(outdated) = outdated {
                if *count > 0 && outdated > 0 {
                    let shared = min(*count, outdated);
                    let _ =
                        task.update_outdated_collectibles_positive_crossing(collectible, -shared);
                    *count -= shared;
                } else if *count < 0 && outdated < 0 {
                    let shared = min(-*count, -outdated);
                    let _ =
                        task.update_outdated_collectibles_positive_crossing(collectible, shared);
                    *count += shared;
                } else {
                    // Not reduced from outdated
                }
            }
            if *count == 0 {
                return false;
            }
            if task.update_collectibles_positive_crossing(collectible, *count)
                && !invalidated_types.contains(&collectible.collectible_type)
            {
                invalidated_types.push(collectible.collectible_type);
            }
            true
        });
        for ty in invalidated_types {
            let dependent: SmallVec<[TaskId; 4]> = task
                .iter_collectibles_dependents()
                .filter_map(|(collectible_type, task)| (collectible_type == ty).then_some(task))
                .collect();
            if !dependent.is_empty() {
                queue.push(AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                    task_ids: dependent,
                    collectibles_task: task_id,
                    collectible_type: ty,
                })
            }
        }
        if !collectibles.is_empty() {
            queue.extend(AggregationUpdateJob::data_update(
                &mut task,
                AggregatedDataUpdate::new().collectibles_update(collectibles.into_vec()),
            ));
        }

        drop(task);

        queue.execute(&mut ctx);
    }
}
