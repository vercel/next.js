use smallvec::{SmallVec, smallvec};
use turbo_tasks::TaskId;

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue, ExecuteContext,
            stage_outgoing_collectibles,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::CollectibleRef,
};

pub struct UpdateCollectibleOperation;

impl UpdateCollectibleOperation {
    /// Emits `collectible` from the executing task `task_id`.
    ///
    /// A collectible emitted again by a re-execution only consumes its outdated entry (left by the
    /// previous execution, removed at completion if it isn't emitted again), so its count doesn't
    /// change and nothing is propagated.
    pub fn run(task_id: TaskId, collectible: CollectibleRef, mut ctx: ExecuteContext<'_>) {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        if task
            .get_outdated_collectibles(&collectible)
            .is_some_and(|&outdated| outdated > 0)
        {
            let _ = task.update_outdated_collectibles_positive_crossing(collectible, -1);
            return;
        }
        let mut queue = AggregationUpdateQueue::new();
        if task.update_collectibles_positive_crossing(collectible, 1) {
            let ty = collectible.collectible_type;
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
        let mut update =
            AggregatedDataUpdate::new().collectibles_update(smallvec![(collectible, 1)]);
        stage_outgoing_collectibles(&mut task, &mut update);
        queue.extend(AggregationUpdateJob::data_update(&mut task, update));

        drop(task);

        queue.execute(&mut ctx);
    }
}
