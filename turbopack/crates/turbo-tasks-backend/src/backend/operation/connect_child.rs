use bincode::{Decode, Encode};
use turbo_tasks::{TaskExecutionReason, TaskId, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, Operation, TaskGuard,
            aggregation_update::{AggregationUpdateJob, AggregationUpdateQueue},
            invalidate::make_task_dirty_internal,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{InProgressState, InProgressStateInner},
};

/// Revive a task the caller observed as GC-soft-deleted (via `guard.deleted()` on a guard it
/// already holds during the connect handshake). The caller passes that guard **by value**; this
/// consumes it, performs the revival, and returns a freshly re-acquired guard of the same
/// `category`, so the call site is simply `guard = resurrect_deleted(guard, ..)` with the
/// drop/re-acquire encapsulated here.
///
/// The passed guard is dropped and an `All` guard re-acquired (needed for the `immutable()` read),
/// under which `deleted` is **re-checked** — double-checked locking: between the caller's cheap
/// peek and this re-acquire, a concurrent connect of the same task could have already revived it,
/// in which case there is nothing to do. When still deleted, the clear and the re-dirty happen
/// **under that single `All` guard without an intervening drop**, so no operation can observe the
/// intermediate `!deleted && !dirty` state (a task that looks live but still holds the stale/empty
/// edges GC scrubbed). A **mutable** task is cleared and made dirty so it re-executes and rebuilds
/// those edges; an **immutable** task cannot be made dirty (invariant in `make_task_dirty`) and
/// does not need to be — its output is deterministic and its edges self-contained — so clearing the
/// marker alone suffices, leaving it immediately valid for any concurrent observer.
///
/// GC collection is the single producer of the `deleted` flag and runs under an exclusion that
/// stops all operations, so once cleared here the flag cannot be re-set concurrently.
pub(super) fn resurrect_deleted<'e, C: ExecuteContext<'e>>(
    guard: C::TaskGuardImpl,
    task_id: TaskId,
    category: TaskDataCategory,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut C,
) -> C::TaskGuardImpl {
    // Release the caller's (Meta-ish) guard so we can re-acquire `All` for the `immutable()` read.
    drop(guard);
    {
        let mut task = ctx.task(task_id, TaskDataCategory::All);
        // Double-check under the re-acquired guard: a concurrent connect may have revived it in the
        // gap.
        if task.deleted() {
            // Clear + re-dirty atomically under this single guard so no observer sees `!deleted`
            // before the task has been re-validated.
            task.set_deleted(false);
            if !task.immutable() {
                make_task_dirty_internal(
                    task,
                    task_id,
                    true,
                    #[cfg(feature = "task_dirty_cause")]
                    crate::backend::operation::invalidate::TaskDirtyCause::Unknown,
                    queue,
                    ctx,
                );
            }
        }
    }
    // Hand back a guard of the caller's category so it can continue the handshake.
    ctx.task(task_id, category)
}

#[derive(Encode, Decode, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum ConnectChildOperation {
    UpdateAggregation {
        aggregation_update: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl ConnectChildOperation {
    pub fn run(
        parent_task_id: Option<TaskId>,
        child_task_id: TaskId,
        mut ctx: impl ExecuteContext<'_>,
    ) {
        // Resurrection of a GC-soft-deleted child (clearing the `deleted` marker + re-dirtying it)
        // is folded into the child guard the connect handshake takes below — the activeness path
        // does it in `increase_active_count`, the non-activeness path inline — so the common
        // (not-deleted) case costs only a Meta flag read on a guard we hold anyway, with no extra
        // acquisition. A `deleted` child is always in NEITHER the parent's `children` nor its
        // `new_children` when first connected (GC only collects `parent_count == 0` tasks, so it is
        // in no live parent's children; and a prior connect in this execution would have already
        // staged+resurrected it), so the dedup early-returns below never skip a needed
        // resurrection.

        if let Some(parent_task_id) = parent_task_id {
            let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::Meta);
            let Some(InProgressState::InProgress(box InProgressStateInner {
                new_children, ..
            })) = parent_task.get_in_progress()
            else {
                panic!("Task is not in progress while calling another task: {parent_task:?}");
            };

            // Quick skip if the child was already connected before
            // We defer the insert until after the aggregation queue is processed.
            if new_children.contains(&child_task_id) {
                return;
            }

            if parent_task.children_contains(&child_task_id) {
                // It is already connected, we can skip the rest
                // but we still need to update the new_children set
                let Some(InProgressState::InProgress(box InProgressStateInner {
                    new_children,
                    ..
                })) = parent_task.get_in_progress_mut()
                else {
                    unreachable!();
                };
                new_children.insert(child_task_id);
                return;
            }
        }

        let mut queue = AggregationUpdateQueue::new();

        // Handle the transient to persistent boundary by making the persistent task a root task
        if parent_task_id.is_none_or(|id| id.is_transient() && !child_task_id.is_transient()) {
            queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id: child_task_id,
                base_aggregation_number: u32::MAX,
                distance: None,
            });
        }

        if ctx.should_track_activeness() && parent_task_id.is_some() {
            // Resurrection rides the child guard `increase_active_count` takes (see the
            // `resurrect` flag on the job).
            queue.push(AggregationUpdateJob::IncreaseActiveCount {
                task: child_task_id,
                resurrect: true,
            });
        } else {
            let mut child_task = ctx.task(child_task_id, TaskDataCategory::Meta);

            // Peek for GC soft-deletion on the guard we already hold — common path: one Meta flag
            // read, no extra lock. Rare (was deleted): `resurrect_deleted` consumes this guard,
            // re-acquires `All` to double-check and atomically clear+re-dirty, and hands back a
            // fresh Meta guard for the schedule decision below. Resurrection thus completes before
            // scheduling, matching the original resurrect-first order.
            if child_task.deleted() {
                child_task = resurrect_deleted(
                    child_task,
                    child_task_id,
                    TaskDataCategory::Meta,
                    &mut queue,
                    &mut ctx,
                );
            }

            if !child_task.has_output()
                && child_task.add_scheduled(
                    TaskExecutionReason::Connect,
                    EventDescription::new(|| child_task.get_task_desc_fn()),
                )
            {
                ctx.schedule_task(child_task, ctx.get_current_task_priority());
            }
        }

        ConnectChildOperation::UpdateAggregation {
            aggregation_update: queue,
        }
        .execute(&mut ctx);

        if let Some(parent_task_id) = parent_task_id {
            let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::Meta);
            let Some(InProgressState::InProgress(box InProgressStateInner {
                new_children, ..
            })) = parent_task.get_in_progress_mut()
            else {
                panic!("Task is not in progress while calling another task: {parent_task:?}");
            };

            // Really add the child to the new children set
            if !new_children.insert(child_task_id) {
                drop(parent_task);

                // There was a concurrent connect child operation,
                // so we need to undo the active count update.
                AggregationUpdateQueue::run(
                    AggregationUpdateJob::DecreaseActiveCount {
                        task: child_task_id,
                    },
                    &mut ctx,
                );
            }
        }
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext<'_>) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                ConnectChildOperation::UpdateAggregation {
                    ref mut aggregation_update,
                } => {
                    if aggregation_update.process(ctx) {
                        self = ConnectChildOperation::Done
                    }
                }

                ConnectChildOperation::Done => {
                    return;
                }
            }
        }
    }
}
