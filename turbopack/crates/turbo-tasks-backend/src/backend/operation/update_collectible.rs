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
    /// A collectible the previous execution emitted only stops being outdated (outdated
    /// collectibles are removed when the execution completes), and emitting a collectible again is
    /// a no-op. Neither changes the uppers.
    pub fn run(task_id: TaskId, collectible: CollectibleRef, mut ctx: ExecuteContext<'_>) {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        if task.remove_outdated_collectibles(&collectible) || !task.add_collectibles(collectible) {
            return;
        }
        let mut queue = AggregationUpdateQueue::new();
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
        let mut update =
            AggregatedDataUpdate::new().collectibles_update(smallvec![(collectible, 1)]);
        stage_outgoing_collectibles(&mut task, &mut update);
        queue.extend(AggregationUpdateJob::data_update(&mut task, update));

        drop(task);

        queue.execute(&mut ctx);
    }
}
