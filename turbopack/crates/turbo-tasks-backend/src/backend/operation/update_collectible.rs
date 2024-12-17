use std::cmp::min;

use turbo_tasks::TaskId;

use crate::{
    backend::{
        operation::{
            AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue, ExecuteContext,
            Operation,
        },
        storage::{get, update_count},
        TaskDataCategory,
    },
    data::CollectibleRef,
};

pub struct UpdateCollectibleOperation;

impl UpdateCollectibleOperation {
    pub fn run(
        task_id: TaskId,
        collectible: CollectibleRef,
        mut count: i32,
        mut ctx: impl ExecuteContext,
    ) {
        if !ctx.should_track_children() {
            // Collectibles are not supported without children tracking
            return;
        }
        let mut queue = AggregationUpdateQueue::new();
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        let outdated = get!(task, OutdatedCollectible { collectible }).copied();
        if let Some(outdated) = outdated {
            if count > 0 && outdated > 0 {
                let shared = min(count, outdated);
                update_count!(task, OutdatedCollectible { collectible }, -shared);
                count -= shared;
            } else if count < 0 && outdated < 0 {
                let shared = min(-count, -outdated);
                update_count!(task, OutdatedCollectible { collectible }, shared);
                count += shared;
            } else {
                // Not reduced from outdated
            }
        }
        if count != 0 {
            update_count!(task, Collectible { collectible }, count);
            queue.extend(AggregationUpdateJob::data_update(
                &mut task,
                AggregatedDataUpdate::new().collectibles_update(vec![(collectible, count)]),
            ));
        }

        drop(task);

        queue.execute(&mut ctx);
    }
}
