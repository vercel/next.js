use rustc_hash::FxHashSet;
use smallvec::SmallVec;
#[cfg(feature = "task_dirty_cause")]
use turbo_tasks::TaskDirtyCause;
use turbo_tasks::{
    TaskId,
    scope::scope_and_block,
    util::{good_chunk_size, into_chunks},
};

use crate::backend::{
    operation::{
        AggregationUpdateJob, AggregationUpdateQueue, ChildExecuteContext, ExecuteContext,
        Operation, TaskGuard, aggregation_update::InnerOfUppersHasNewFollowersJob,
        get_aggregation_number, get_uppers, invalidate::make_task_dirty_internal,
        is_aggregating_node,
    },
    storage_schema::TaskStorageAccessors,
};

pub fn connect_children(
    ctx: &mut impl ExecuteContext<'_>,
    parent_task_id: TaskId,
    mut parent_task: impl TaskGuard,
    new_children: FxHashSet<TaskId>,
    parent_has_active_count: bool,
    should_track_activeness: bool,
) {
    debug_assert!(!new_children.is_empty());

    let parent_aggregation = get_aggregation_number(&parent_task);

    let old_children = parent_task.children_len();
    parent_task.extend_children(new_children.iter().copied());
    debug_assert!(
        old_children + new_children.len() == parent_task.children_len(),
        "Attempted to connect {len} new children, but some of them were already present in \
         {parent_task_id}",
        len = new_children.len()
    );

    let new_follower_ids: SmallVec<_> = new_children.into_iter().collect();

    let aggregating_node = is_aggregating_node(parent_aggregation);
    let upper_ids = (!aggregating_node).then(|| get_uppers(&parent_task));

    drop(parent_task);

    fn process_new_children(
        ctx: &mut impl ExecuteContext<'_>,
        new_follower_ids: SmallVec<[TaskId; 4]>,
        upper_ids: Option<SmallVec<[TaskId; 4]>>,
        parent_task_id: TaskId,
        parent_has_active_count: bool,
        should_track_activeness: bool,
    ) {
        debug_assert!(!new_follower_ids.is_empty());

        let mut queue = AggregationUpdateQueue::new();

        // Single pass over the newly-connected children doing two things per child under one guard,
        // so we don't lock each child twice (once to bump its ref count, once to dirty it):
        //
        // 1. Maintain the child-side parent reference count for **persistent** children: a
        //    persistent parent bumps the durable `parent_count`, a transient parent the
        //    session-only `transient_ref_count` (not persisted; transient parents re-establish
        //    their edges by re-executing on restart). Transient children are never collected, so
        //    they take no count.
        //
        //    CRITICAL: this is a **direct** adjustment, NOT a queued `AdjustParentCount` job, and
        // it    MUST run before `queue.execute` below (the first `operation_suspend_point`
        // this    function reaches). GC reads `parent_count` to decide collectibility and
        // only observes    state at suspend points (`begin_gc` drains operations to a
        // suspended/quiescent state).    If the `+1` rode the `AggregationUpdateQueue`
        // instead, that queue's per-iteration    suspend point could suspend with the `+1`
        // still pending — leaving a window where the    `children` edge is committed
        // (`extend_children` in the caller) but `parent_count` is    not yet incremented. A
        // GC pass landing in that window would read the under-counted    `parent_count ==
        // 0`, judge the (genuinely reachable) child collectible, and delete it.    There is
        // no `operation_suspend_point` between the caller's `extend_children` and here
        //    (`make_task_dirty_internal` only enqueues; the queue runs later), so no snapshot/GC
        // can    observe the edge without the count. In the parallelized path this runs on
        // a child    context (which never suspends — it holds no operation guard), inside
        // the    `scope_and_block` barrier that completes within the parent operation, so
        // the property    holds there too. (The `-1` on edge removal in `CleanupOldEdges`
        // has the opposite,    benign failure mode — a pending `-1` makes GC
        // *under*-collect for one pass,    self-correcting — so it stays on the durable
        // queue there.)
        //
        // 2. Make any child that has not produced output yet dirty, so it gets scheduled and
        //    computes. Runs only on the successful connect (not the stale/cancel early-returns in
        //    `task_execution_completed_connect`), which undo the children's temporarily-increased
        //    active count rather than keeping them.
        let parent_is_transient = parent_task_id.is_transient();
        ctx.for_each_task_all(
            new_follower_ids.iter().copied(),
            "connect_children parent_count + dirty",
            |mut child, ctx| {
                // Ref-count bump first (persistent children only), on the `&mut` borrow, before the
                // guard may be consumed by `make_task_dirty_internal` below.
                if !child.id().is_transient() {
                    if parent_is_transient {
                        child.update_and_get_transient_ref_count(1);
                    } else {
                        child.update_and_get_parent_count(1);
                    }
                }
                if !child.has_output() {
                    let child_id = child.id();
                    make_task_dirty_internal(
                        child,
                        child_id,
                        false,
                        #[cfg(feature = "task_dirty_cause")]
                        TaskDirtyCause::InitialDirty,
                        &mut queue,
                        ctx,
                    );
                }
            },
        );

        if let Some(upper_ids) = upper_ids {
            // We need to add new followers when there are upper ids as the parent is a leaf node
            // and new children are new followers.
            let add_followers = !upper_ids.is_empty();

            // And we need decrease the active count when parent doesn't have an active count as the
            // active count was temporarily increased during connect_child. We need to
            // increase the active count when the parent has active count, because it's
            // added as follower.
            let decrease_active_count = should_track_activeness && !parent_has_active_count;

            // We special case the situation when we need to do both operations to avoid
            // cloning the new follower ids unnecessarily.
            if decrease_active_count && add_followers {
                queue.push(
                    InnerOfUppersHasNewFollowersJob {
                        upper_ids,
                        new_follower_ids: new_follower_ids.clone(),
                    }
                    .into(),
                );
                queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: new_follower_ids,
                })
            } else if decrease_active_count {
                queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: new_follower_ids,
                })
            } else if add_followers {
                queue.push(
                    InnerOfUppersHasNewFollowersJob {
                        upper_ids,
                        new_follower_ids,
                    }
                    .into(),
                );
            }
        } else if should_track_activeness {
            // Parent is an aggregating node. We run the normal code to connect the children.
            queue.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                upper_id: parent_task_id,
                new_follower_ids: new_follower_ids.clone(),
            });
            // We need to decrease the active count because we temporarily increased it during
            // connect_child.
            queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                task_ids: new_follower_ids,
            });
        } else {
            // Parent is an aggregating node. We run the normal code to connect the children.
            queue.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                upper_id: parent_task_id,
                new_follower_ids,
            });
        }

        {
            #[cfg(any(
                feature = "trace_task_completion",
                feature = "trace_aggregation_update_stats"
            ))]
            let _span = tracing::trace_span!("connect new children", stats = tracing::field::Empty)
                .entered();
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                let stats = queue.execute_with_stats(ctx);
                _span.record("stats", tracing::field::debug(stats));
            }
            #[cfg(not(feature = "trace_aggregation_update_stats"))]
            queue.execute(ctx);
        }
    }

    // Connecting a child varies a lot, but it's in the range of 10-30µs.
    // Usually many tasks run in parallel and so it this operation.
    // But sometimes there is only one task running and everybody waits on it.
    // In this case we want to avoid a long single threaded operation.
    // Where there are more than 10k children we parallelize the operation.
    // This avoids long pauses of more than 30µs * 10k = 300ms.
    // We don't want to parallelize too eagerly as spawning tasks and the temporary allocations have
    // a cost as well.
    const CONNECT_CHILDREN_PARALLELIZATION_THRESHOLD: usize = 10000;

    let len = new_follower_ids.len();
    if len >= CONNECT_CHILDREN_PARALLELIZATION_THRESHOLD {
        let new_follower_ids = new_follower_ids.into_vec();
        let chunk_size = good_chunk_size(len);
        let _ = scope_and_block(len.div_ceil(chunk_size), |scope| {
            for chunk in into_chunks(new_follower_ids, chunk_size) {
                let upper_ids = &upper_ids;
                let child_ctx = ctx.child_context();
                scope.spawn(move || {
                    let mut ctx = child_ctx.create();
                    let new_follower_ids = chunk.collect::<SmallVec<[_; 4]>>();
                    process_new_children(
                        &mut ctx,
                        new_follower_ids,
                        upper_ids.clone(),
                        parent_task_id,
                        parent_has_active_count,
                        should_track_activeness,
                    );
                });
            }
        });
    } else {
        process_new_children(
            ctx,
            new_follower_ids,
            upper_ids,
            parent_task_id,
            parent_has_active_count,
            should_track_activeness,
        );
    }
}
