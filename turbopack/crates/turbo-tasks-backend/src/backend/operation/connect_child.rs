use bincode::{Decode, Encode};
use turbo_tasks::{TaskExecutionReason, TaskId, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, Operation, TaskGuard,
            aggregation_update::{AggregationUpdateJob, AggregationUpdateQueue, ParentCountBump},
            invalidate::make_task_dirty,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{InProgressState, InProgressStateInner},
};

/// If `task_id` was marked soft-deleted by GC (collected, awaiting tombstone + hard-delete) but is
/// being connected as a child again, bring it back to life: clear the `deleted` marker and make it
/// dirty so it re-executes. GC's `CleanupOldEdges` scrubbed all of the task's edges (children +
/// forward dependencies) when it was collected, so its cells/output are stale and it must recompute
/// to rebuild them — the resurrection is a real re-validation, not just un-flagging. This is the
/// single chokepoint through which every re-entry (a `task_cache` hit or a disk hit in
/// `get_or_create_task`) flows, so no `deleted` task can be returned to live use without reviving.
fn resurrect_if_deleted(task_id: TaskId, ctx: &mut impl ExecuteContext<'_>) {
    // Cheap Meta-only check first; only escalate on a hit. `deleted` is a Meta-category flag, so a
    // Meta guard suffices to test/clear it — `immutable()` (a Data-category flag) is NOT checked
    // here to avoid forcing a Data restore on the common not-deleted path.
    let deleted = {
        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        let deleted = task.deleted();
        if deleted {
            task.set_deleted(false);
        }
        deleted
    };
    // Only now (rare) open with the Data category `immutable()` needs.
    let immutable = deleted && ctx.task(task_id, TaskDataCategory::All).immutable();
    if deleted && !immutable {
        // A mutable task's forward-dep edges were scrubbed when GC collected it, so it holds
        // stale/empty edges and must re-execute to rebuild them: make it dirty. An **immutable**
        // task cannot be made dirty (invariant enforced in `make_task_dirty`) and does not need to
        // be — its output is deterministic and still valid; clearing the marker is enough (any
        // child edges it lost are rebuilt if and when it is re-read, and its inlined output is
        // self-contained).
        let mut queue = AggregationUpdateQueue::new();
        make_task_dirty(
            task_id,
            #[cfg(feature = "task_dirty_cause")]
            crate::backend::operation::invalidate::TaskDirtyCause::Unknown,
            &mut queue,
            ctx,
        );
        queue.execute(ctx);
    }
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
        // Revive the child first if GC had soft-deleted it: it must be live (and re-executing)
        // before we wire it into the parent's children / aggregation below.
        resurrect_if_deleted(child_task_id, &mut ctx);

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

        // This child edge is genuinely new (it passed the dedup early-returns above), so it takes a
        // child-side reference-count **hold**: a persistent parent holds the child's durable
        // `parent_count`, a transient parent the session-only `transient_ref_count`. The hold is
        // taken OPTIMISTICALLY here (before the `new_children.insert` below confirms we won),
        // riding a guard we take anyway — exactly like the active-count hold. It is
        // balanced by: the undo on a concurrent-connect race (below), a release on a
        // stale/cancel discard (see `ExecuteContext::release_children_holds`), or — on
        // success — by becoming permanent when `connect_children` commits the edge (and
        // eventually the `-1` in `CleanupOldEdges`). Transient children are never
        // collected, so they take no hold.
        let bump = match parent_task_id {
            Some(parent) if !child_task_id.is_transient() => {
                if parent.is_transient() {
                    ParentCountBump::BumpTransientParent
                } else {
                    ParentCountBump::BumpParent
                }
            }
            _ => ParentCountBump::NoBump,
        };

        if ctx.should_track_activeness() && parent_task_id.is_some() {
            // The active-count bump's handler (`increase_active_count`) already opens a Meta guard
            // on the child; the `bump` token makes it take the parent_count hold under that same
            // guard — free.
            queue.push(AggregationUpdateJob::IncreaseActiveCount {
                task: child_task_id,
                bump,
            });
        } else {
            let mut child_task = ctx.task(child_task_id, TaskDataCategory::Meta);

            // Take the hold under the guard we open here anyway (no active-count bump on this
            // branch). `NoBump` (transient child / no parent) does nothing.
            match bump {
                ParentCountBump::NoBump => {}
                ParentCountBump::BumpParent => {
                    child_task.update_and_get_parent_count(1);
                }
                ParentCountBump::BumpTransientParent => {
                    child_task.update_and_get_transient_ref_count(1);
                }
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

                // There was a concurrent connect child operation, so this call did NOT win the
                // edge. Undo both optimistic holds taken above: the active count, and the
                // parent_count / transient_ref_count (the winning call keeps its own +1).
                AggregationUpdateQueue::run(
                    AggregationUpdateJob::DecreaseActiveCount {
                        task: child_task_id,
                    },
                    &mut ctx,
                );
                match bump {
                    ParentCountBump::NoBump => {}
                    ParentCountBump::BumpParent => {
                        ctx.task(child_task_id, TaskDataCategory::Meta)
                            .update_and_get_parent_count(-1);
                    }
                    ParentCountBump::BumpTransientParent => {
                        ctx.task(child_task_id, TaskDataCategory::Meta)
                            .update_and_get_transient_ref_count(-1);
                    }
                }
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
