use bincode::{Decode, Encode};
use turbo_tasks::{TaskExecutionReason, TaskId, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, Operation, TaskGuard,
            aggregation_update::{
                AggregationUpdateJob, AggregationUpdateQueue, get_aggregation_number, is_root_node,
            },
            invalidate::make_task_dirty_internal,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{InProgressState, InProgressStateInner},
};

/// Revive `task_id` if it was GC-soft-deleted, given a guard the caller already holds during the
/// connect handshake. The caller passes that guard **by value** and unconditionally rebinds the
/// result: `guard = resurrect_deleted(guard, ..)`. When the task is not deleted (the common case)
/// this is a no-op that returns the same guard untouched — one `deleted()` flag read, no extra
/// acquisition. Otherwise it revives the task and returns a freshly re-acquired guard of
/// `category`.
///
/// On the revival path the guard is dropped and an `All` guard re-acquired (needed for the
/// `immutable()` read), under which `deleted` is **re-checked** — double-checked locking: between
/// the peek and this re-acquire, a concurrent connect of the same task could have already revived
/// it. When still deleted, the clear and the re-dirty happen **under that single `All` guard
/// without an intervening drop**, so no operation can observe the intermediate `!deleted && !dirty`
/// state (a task that looks live but still holds the stale/empty edges GC scrubbed). A **mutable**
/// task is cleared and made dirty so it re-executes and rebuilds those edges; an **immutable** task
/// cannot be made dirty (invariant in `make_task_dirty`) and does not need to be — its output is
/// deterministic and its edges self-contained — so clearing the marker alone suffices.
///
/// GC is the only producer of the `deleted` flag and runs under an exclusion, so once cleared here
/// it cannot be re-set concurrently.
pub(super) fn resurrect_deleted<'e, C: ExecuteContext<'e>>(
    guard: C::TaskGuardImpl,
    task_id: TaskId,
    category: TaskDataCategory,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut C,
) -> C::TaskGuardImpl {
    // Common path: not deleted — hand the guard straight back, no drop/re-acquire.
    if !guard.deleted() {
        return guard;
    }
    // Release the caller's guard so we can re-acquire `All` for the `immutable()` read.
    drop(guard);
    {
        // `MustExist`: the task is resident here (the early `deleted()` peek only proceeds for a
        // soft-deleted, still-resident task). `MustExist` no longer asserts `!deleted()`, so
        // opening this deliberately-deleted task is fine.
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
                    turbo_tasks::TaskDirtyCause::Resurrected,
                    queue,
                    ctx,
                );
            }
        }
    }
    // Hand back a guard of the caller's category so it can continue the handshake. The task is
    // resident (we only reach here for a soft-deleted, still-resident task).
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

        // Handle the transient to persistent boundary by making the persistent task a root task.
        let should_make_root =
            parent_task_id.is_none_or(|id| id.is_transient() && !child_task_id.is_transient());

        if ctx.should_track_activeness() && parent_task_id.is_some() {
            if should_make_root {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: u32::MAX,
                    distance: None,
                });
            }
            // Resurrection (if the child was GC-soft-deleted) rides the child guard
            // `increase_active_count` takes anyway.
            queue.push(AggregationUpdateJob::IncreaseActiveCount {
                task: child_task_id,
            });
        } else {
            // Connecting a genuinely-new child: this may be the first time the child's storage is
            // materialized (threads can race to first-touch a freshly-created task), so it may
            // legitimately not be resident yet — the one create-capable open here.
            let child_task = ctx.get_or_create_task(child_task_id, TaskDataCategory::Meta);

            // Revive the child if GC soft-deleted it, before the schedule/root decisions below
            // (matching the resurrect-first order). No-op on the common not-deleted path.
            let mut child_task = resurrect_deleted(
                child_task,
                child_task_id,
                TaskDataCategory::Meta,
                &mut queue,
                &mut ctx,
            );

            let has_output = child_task.has_output();
            // An already constructed top-level task was made a root when it was first connected.
            // It may still be dirty and need to run; this only avoids repeating the idempotent
            // aggregation update.
            let is_already_constructed_root = parent_task_id.is_none()
                && has_output
                && is_root_node(get_aggregation_number(&child_task));

            if should_make_root && !is_already_constructed_root {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: u32::MAX,
                    distance: None,
                });
            }

            if !has_output
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
