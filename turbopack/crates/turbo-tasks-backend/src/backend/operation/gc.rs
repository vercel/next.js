use bincode::{Decode, Encode};
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use crate::backend::{
    TaskDataCategory,
    operation::{
        AggregationUpdateJob, AggregationUpdateQueue, ExecuteContext, Operation,
        aggregation_update::{
            InnerOfUppersLostFollowersJob, get_aggregation_number, get_uppers, is_aggregating_node,
        },
    },
    storage_schema::TaskStorageAccessors,
};

#[derive(Encode, Decode, Clone, Default)]
pub enum GcOperation {
    /// Process a batch of task IDs from the GC queue.
    ProcessTasks {
        task_ids: Vec<TaskId>,
        queue: AggregationUpdateQueue,
    },
    /// Run pending aggregation updates after disconnecting tasks.
    AggregationUpdate { queue: AggregationUpdateQueue },
    #[default]
    Done,
}

impl GcOperation {
    pub fn run(task_ids: Vec<TaskId>, ctx: &mut impl ExecuteContext<'_>) {
        if task_ids.is_empty() {
            return;
        }
        GcOperation::ProcessTasks {
            task_ids,
            queue: AggregationUpdateQueue::new(),
        }
        .execute(ctx);
    }
}

impl Operation for GcOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                GcOperation::ProcessTasks {
                    ref mut task_ids,
                    ref mut queue,
                } => {
                    if let Some(task_id) = task_ids.pop() {
                        gc_single_task(task_id, queue, ctx);
                    }
                    if task_ids.is_empty() {
                        self = GcOperation::AggregationUpdate {
                            queue: std::mem::take(queue),
                        };
                    }
                }
                GcOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = GcOperation::Done;
                    }
                }
                GcOperation::Done => {
                    return;
                }
            }
        }
    }
}

/// Process a single task for GC.
///
/// Steps:
/// 1. Re-verify GC eligibility (a new edge may have been added since enqueue)
/// 2. Read aggregation tree state and outgoing edges
/// 3. Disconnect from aggregation tree using existing machinery
/// 4. Remove outgoing dependency edges (may trigger GC of target tasks)
/// 5. Final re-verify (aggregation rebalancing may have added new edges)
/// 6. Remove from task_cache, mark for DB deletion, remove from Storage
fn gc_single_task(
    task_id: TaskId,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut impl ExecuteContext<'_>,
) {
    // Step 1: Re-verify GC eligibility under lock
    let task = ctx.task(task_id, TaskDataCategory::All);
    if !task.typed().is_gc_eligible() {
        return;
    }

    // Step 2: Read all state needed for disconnection
    let aggregation_number = get_aggregation_number(&task);
    let upper_ids = get_uppers(&task);
    let follower_ids: SmallVec<[TaskId; 4]> = task
        .followers()
        .map(|f| f.iter().map(|(&id, _)| id).collect())
        .unwrap_or_default();
    let children: SmallVec<[TaskId; 4]> = task
        .children()
        .map(|c| c.iter().copied().collect())
        .unwrap_or_default();

    // Note: active_counter should be 0 since is_gc_eligible() passed
    // (no activeness state), but we check anyway for safety
    let has_active_count = ctx.should_track_activeness()
        && task.get_activeness().is_some_and(|a| a.active_counter > 0);

    let output_deps: SmallVec<[TaskId; 4]> = task
        .output_dependencies()
        .map(|d| d.iter().copied().collect())
        .unwrap_or_default();
    let cell_deps: SmallVec<[(crate::data::CellRef, Option<u64>); 4]> = task
        .cell_dependencies()
        .map(|d| d.iter().cloned().collect())
        .unwrap_or_default();
    let collectibles_deps: SmallVec<[crate::data::CollectiblesRef; 4]> = task
        .collectibles_dependencies()
        .map(|d| d.iter().cloned().collect())
        .unwrap_or_default();

    // Drop the task lock before modifying other tasks
    drop(task);

    // Step 3: Disconnect from aggregation tree
    // Same pattern as cleanup_old_edges.rs:75-114
    if is_aggregating_node(aggregation_number) && !follower_ids.is_empty() {
        queue.push(AggregationUpdateJob::InnerOfUpperLostFollowers {
            upper_id: task_id,
            lost_follower_ids: follower_ids,
            retry: 0,
        });
    }
    if !upper_ids.is_empty() {
        if has_active_count {
            queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                task_ids: SmallVec::from_slice(&[task_id]),
            });
        }
        queue.push(
            InnerOfUppersLostFollowersJob {
                upper_ids,
                lost_follower_ids: SmallVec::from_slice(&[task_id]),
            }
            .into(),
        );
    }

    // Propagate active count decrease to children
    if has_active_count && !children.is_empty() {
        queue.push(AggregationUpdateJob::DecreaseActiveCounts { task_ids: children });
    }

    // Step 4: Remove outgoing dependency edges on other tasks
    // This may trigger GC eligibility on those tasks
    for dep_task_id in output_deps {
        let mut dep_task = ctx.task(dep_task_id, TaskDataCategory::Data);
        dep_task.remove_output_dependent(&task_id);
        if dep_task.typed().is_gc_eligible() {
            drop(dep_task);
            ctx.enqueue_gc(dep_task_id);
        }
    }

    for (cell_ref, key) in cell_deps {
        let mut dep_task = ctx.task(cell_ref.task, TaskDataCategory::Data);
        dep_task.remove_cell_dependents(&(cell_ref.cell, key, task_id));
        if dep_task.typed().is_gc_eligible() {
            drop(dep_task);
            ctx.enqueue_gc(cell_ref.task);
        }
    }

    for collectibles_ref in collectibles_deps {
        let mut dep_task = ctx.task(collectibles_ref.task, TaskDataCategory::Data);
        dep_task.remove_collectibles_dependents(&(collectibles_ref.collectible_type, task_id));
        if dep_task.typed().is_gc_eligible() {
            drop(dep_task);
            ctx.enqueue_gc(collectibles_ref.task);
        }
    }

    // Step 5: Final re-verify under lock
    // Aggregation rebalancing (triggered by step 3) may have added new edges
    {
        let task = ctx.task(task_id, TaskDataCategory::All);
        if !task.typed().is_gc_eligible() {
            // Something reconnected this task during aggregation processing
            return;
        }
    }

    // Step 6: Remove from task_cache, mark for DB deletion, remove from Storage
    ctx.gc_remove_task(task_id);
}
