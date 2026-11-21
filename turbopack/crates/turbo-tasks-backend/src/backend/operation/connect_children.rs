use rustc_hash::FxHashSet;
use smallvec::{SmallVec, smallvec};
#[cfg(feature = "task_dirty_cause")]
use turbo_tasks::TaskDirtyCause;
use turbo_tasks::{
    TaskId,
    scope_bounded::scope_bounded,
    util::{good_chunk_size, into_chunks},
};

use crate::backend::{
    operation::{
        AggregationUpdateJob, AggregationUpdateQueue, ExecuteContext, TaskGuard,
        aggregation_update::{InnerOfUppersHasNewFollowersJob, publish_pending_addition},
        get_aggregation_number, get_uppers,
        invalidate::make_task_dirty_internal,
        is_aggregating_node,
    },
    storage_schema::TaskStorageAccessors,
};

// Connecting a child varies a lot, but it's in the range of 10-30µs.
// Usually many tasks run in parallel and so it this operation.
// But sometimes there is only one task running and everybody waits on it.
// In this case we want to avoid a long single threaded operation.
// Where there are more than 10k children we parallelize the operation.
// This avoids long pauses of more than 30µs * 10k = 300ms.
// We don't want to parallelize too eagerly as spawning tasks and the temporary allocations have
// a cost as well.
const CONNECT_CHILDREN_PARALLELIZATION_THRESHOLD: usize = 10000;

/// New children of a parent, which are propagated together in one queue.
struct NewChildren {
    new_follower_ids: SmallVec<[TaskId; 4]>,
    /// The uppers of a leaf parent, which get the new children as followers. `None` for an
    /// aggregating parent, which gets them itself.
    upper_ids: Option<SmallVec<[TaskId; 4]>>,
    /// Whether the parent counted the addition of the new children to `upper_ids` as pending.
    /// The queue that applies it settles it.
    pending: bool,
}

pub fn connect_children(
    ctx: &mut ExecuteContext<'_>,
    parent_task_id: TaskId,
    parent_task: TaskGuard<'_>,
    new_children: FxHashSet<TaskId>,
    parent_has_active_count: bool,
    should_track_activeness: bool,
) {
    let chunks = publish_new_children(parent_task_id, parent_task, new_children);

    if chunks.len() > 1 {
        let _ = scope_bounded(chunks.len(), |scope| {
            for chunk in chunks {
                let child_ctx = ctx.child_context();
                scope.spawn(move || {
                    let mut ctx = child_ctx.create();
                    let mut queue = prepare_new_children(
                        &mut ctx,
                        AggregationUpdateQueue::new(),
                        chunk,
                        parent_task_id,
                        parent_has_active_count,
                        should_track_activeness,
                    );
                    execute(&mut queue, &mut ctx);
                });
            }
        });
    } else {
        for chunk in chunks {
            let mut queue = prepare_new_children(
                ctx,
                AggregationUpdateQueue::new(),
                chunk,
                parent_task_id,
                parent_has_active_count,
                should_track_activeness,
            );
            execute(&mut queue, ctx);
        }
    }
}

/// Adds `new_children` to the children of the locked parent and captures what's needed to
/// propagate them. For a leaf parent, counts the addition of the children to its uppers as
/// pending, per chunk that is propagated by a separate queue.
fn publish_new_children(
    parent_task_id: TaskId,
    mut parent_task: TaskGuard<'_>,
    new_children: FxHashSet<TaskId>,
) -> SmallVec<[NewChildren; 1]> {
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

    let aggregating_node = is_aggregating_node(parent_aggregation);
    let upper_ids = (!aggregating_node).then(|| get_uppers(&parent_task));

    let len = new_children.len();
    let chunks: SmallVec<[SmallVec<[TaskId; 4]>; 1]> =
        if len >= CONNECT_CHILDREN_PARALLELIZATION_THRESHOLD {
            into_chunks(new_children.into_iter().collect(), good_chunk_size(len))
                .map(|chunk| chunk.collect())
                .collect()
        } else {
            smallvec![new_children.into_iter().collect()]
        };

    chunks
        .into_iter()
        .map(|new_follower_ids| {
            // The children of a leaf parent are followers of its uppers. The parent publishes
            // their addition here, and it's applied after the lock is released.
            let pending = upper_ids
                .as_ref()
                .is_some_and(|upper_ids| !upper_ids.is_empty());
            if pending {
                publish_pending_addition(&mut parent_task, &new_follower_ids);
            }
            NewChildren {
                new_follower_ids,
                upper_ids: upper_ids.clone(),
                pending,
            }
        })
        .collect()
}

/// Prepares the propagation of new children to the graph: updates the children and pushes the
/// propagation to the uppers to `queue`.
fn prepare_new_children(
    ctx: &mut ExecuteContext<'_>,
    mut queue: AggregationUpdateQueue,
    new_children: NewChildren,
    parent_task_id: TaskId,
    parent_has_active_count: bool,
    should_track_activeness: bool,
) -> AggregationUpdateQueue {
    let NewChildren {
        new_follower_ids,
        upper_ids,
        pending,
    } = new_children;
    debug_assert!(!new_follower_ids.is_empty());

    // Single pass over the newly-connected children, two things per child under one guard:
    //
    // 1. Bump the child-side parent reference count before graph propagation.
    //
    // 2. Make any child that has not produced output yet dirty, so it gets scheduled and computes.
    let parent_is_transient = parent_task_id.is_transient();
    ctx.for_each_task_all(
        new_follower_ids.iter().copied(),
        "connect_children parent_count + dirty",
        |mut child, ctx| {
            // Bump before `make_task_dirty_internal`, which consumes the guard.
            //
            // `parent_count` is the *durable* count, so it may only track an edge that will itself
            // be persisted: a persistent parent holding a persistent child. Every other
            // combination is session-only and belongs in `transient_ref_count` -- including a
            // transient child, whose incoming edges can never outlive the session no matter what
            // kind of parent holds them.
            if parent_is_transient || child.id().is_transient() {
                child.update_and_get_transient_ref_count(1);
            } else {
                child.update_and_get_parent_count(1);
            }
            if !child.has_output() {
                make_task_dirty_internal(
                    &mut child,
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

        if pending {
            queue.add_pending_addition(parent_task_id, &new_follower_ids);
        }
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
    queue
}

fn execute(queue: &mut AggregationUpdateQueue, ctx: &mut ExecuteContext<'_>) {
    #[cfg(any(
        feature = "trace_task_completion",
        feature = "trace_aggregation_update_stats"
    ))]
    let _span =
        tracing::trace_span!("connect new children", stats = tracing::field::Empty).entered();
    #[cfg(feature = "trace_aggregation_update_stats")]
    {
        let stats = queue.execute_with_stats(ctx);
        _span.record("stats", tracing::field::debug(stats));
    }
    #[cfg(not(feature = "trace_aggregation_update_stats"))]
    queue.execute(ctx);
}

/// Like [`connect_children`] with fewer children than the parallelization threshold and without
/// active count changes, but returns the queue that propagates the children instead of running
/// it.
#[cfg(test)]
pub fn connect_children_without_propagation(
    ctx: &mut ExecuteContext<'_>,
    parent_task: TaskGuard<'_>,
    new_children: FxHashSet<TaskId>,
) -> AggregationUpdateQueue {
    let parent_task_id = parent_task.id();
    let mut chunks = publish_new_children(parent_task_id, parent_task, new_children);
    assert_eq!(chunks.len(), 1, "too many children for a single queue");
    let chunk = chunks.pop().unwrap();
    prepare_new_children(
        ctx,
        AggregationUpdateQueue::new_without_optimizations(),
        chunk,
        parent_task_id,
        false,
        false,
    )
}
