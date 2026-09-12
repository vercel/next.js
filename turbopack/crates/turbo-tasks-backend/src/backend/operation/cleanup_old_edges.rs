use std::mem::take;

use bincode::{Decode, Encode};
use rustc_hash::FxHashSet;
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregatedDataUpdate, ExecuteContext, Operation,
            aggregation_update::{
                AggregationUpdateJob, AggregationUpdateQueue, InnerOfUppersLostFollowersJob,
                get_aggregation_number, get_uppers, is_aggregating_node,
            },
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{CellRef, CollectibleRef, CollectiblesRef},
};

#[derive(Encode, Decode, Clone)]
pub enum CleanupOldEdgesOperation {
    RemoveEdges {
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
        queue: AggregationUpdateQueue,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
    },
    Done {
        stats: Stats,
    },
    // TODO Add aggregated edge
}

impl Default for CleanupOldEdgesOperation {
    fn default() -> Self {
        Self::Done {
            stats: Default::default(),
        }
    }
}

#[derive(Encode, Decode, Clone)]
pub enum OutdatedEdge {
    Child(TaskId),
    Collectible(CollectibleRef, i32),
    CellDependency(CellRef),
    HashedCellDependency(CellRef, u64),
    OutputDependency(TaskId),
    CollectiblesDependency(CollectiblesRef),
}

/// Captures *all* of a task's outgoing edges as [`OutdatedEdge`]s
pub fn capture_all_outgoing_edges(task: &impl TaskStorageAccessors) -> Vec<OutdatedEdge> {
    let mut old_edges: Vec<OutdatedEdge> = Vec::new();
    old_edges.extend(task.iter_children().map(OutdatedEdge::Child));
    old_edges.extend(
        task.iter_output_dependencies()
            .map(OutdatedEdge::OutputDependency),
    );
    old_edges.extend(
        task.iter_cell_dependencies()
            .map(OutdatedEdge::CellDependency),
    );
    old_edges.extend(
        task.iter_cell_dependencies_hashed()
            .map(|(r, k)| OutdatedEdge::HashedCellDependency(r, k)),
    );
    old_edges.extend(
        task.iter_collectibles_dependencies()
            .map(OutdatedEdge::CollectiblesDependency),
    );
    old_edges
}

/// The category to open a dependency *target* with when scrubbing its incoming edge.
fn dependent_scrub_category<'e, C: ExecuteContext<'e>>(ctx: &C) -> TaskDataCategory {
    if ctx.collects_gc_candidates() {
        // Under GC we need to query meta fields so be sure to recover Meta also
        TaskDataCategory::All
    } else {
        TaskDataCategory::Data
    }
}

#[cfg(feature = "trace_aggregation_update_stats")]
type Stats = super::aggregation_update::AggregationUpdateQueueStats;
#[cfg(not(feature = "trace_aggregation_update_stats"))]
type Stats = ();

impl CleanupOldEdgesOperation {
    pub fn run(
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
        queue: AggregationUpdateQueue,
        ctx: &mut impl ExecuteContext<'_>,
    ) -> Stats {
        CleanupOldEdgesOperation::RemoveEdges {
            task_id,
            outdated,
            queue,
        }
        .execute_with_stats(ctx)
    }

    /// GC variant: tears down `outdated` and drains only the edge-removal work, returning the
    /// queue with its rebalance (`balance_edge` / `optimize`) jobs still pending.
    ///
    /// GC accumulates this remainder across the whole parallel phase and drains it once collection
    /// is quiescent: collection only removes nodes, and every removal path is correct on its own,
    /// but `balance_edge` *adds* edges, which is unsafe while other workers are still deleting
    /// tasks. See `TurboTasksBackend::gc_collect`.
    pub fn run_edges_only(
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
        queue: AggregationUpdateQueue,
        ctx: &mut impl ExecuteContext<'_>,
    ) -> Option<AggregationUpdateQueue> {
        let op = CleanupOldEdgesOperation::RemoveEdges {
            task_id,
            outdated,
            queue,
        };
        let mut deferred = None;
        op.execute_inner(ctx, &mut Some(&mut deferred));
        deferred
    }

    fn execute_with_stats(self, ctx: &mut impl ExecuteContext<'_>) -> Stats {
        self.execute_inner(ctx, &mut None)
    }

    /// Shared driver. When `defer_rebalance` is `Some`, the loop stops as soon as only rebalance
    /// work is left and hands that queue out instead of draining it (the GC path); otherwise it
    /// runs to completion.
    fn execute_inner(
        mut self,
        ctx: &mut impl ExecuteContext<'_>,
        defer_rebalance: &mut Option<&mut Option<AggregationUpdateQueue>>,
    ) -> Stats {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                CleanupOldEdgesOperation::RemoveEdges {
                    task_id,
                    ref mut outdated,
                    ref mut queue,
                } => {
                    if let Some(edge) = outdated.pop() {
                        match edge {
                            OutdatedEdge::Child(child_id) => {
                                let mut children = SmallVec::new();
                                children.push(child_id);
                                outdated.retain(|e| match e {
                                    OutdatedEdge::Child(id) => {
                                        children.push(*id);
                                        false
                                    }
                                    _ => true,
                                });
                                let mut task = ctx.task(task_id, TaskDataCategory::All);

                                // Mirror `ConnectChildrenOperation`'s split exactly: an edge
                                // counted as durable is released from `parent_count`, everything
                                // else from `transient_ref_count`. Getting this wrong either
                                // strands a task forever or underflows the count.
                                let parent_is_transient = task_id.is_transient();
                                let mut removed_durable = SmallVec::<[TaskId; 4]>::new();
                                let mut removed_transient = SmallVec::<[TaskId; 4]>::new();
                                for child_id in children.iter() {
                                    if task.remove_children(child_id) {
                                        if parent_is_transient || child_id.is_transient() {
                                            removed_transient.push(*child_id);
                                        } else {
                                            removed_durable.push(*child_id);
                                        }
                                    }
                                }
                                if !removed_durable.is_empty() {
                                    queue.push(AggregationUpdateJob::AdjustParentCount {
                                        task_ids: removed_durable,
                                        delta: -1,
                                    });
                                }
                                if !removed_transient.is_empty() {
                                    queue.push(AggregationUpdateJob::AdjustTransientRefCount {
                                        task_ids: removed_transient,
                                        delta: -1,
                                    });
                                }
                                if is_aggregating_node(get_aggregation_number(&task)) {
                                    drop(task);
                                    queue.push(AggregationUpdateJob::InnerOfUpperLostFollowers {
                                        upper_id: task_id,
                                        lost_follower_ids: children,
                                        retry: 0,
                                    });
                                } else {
                                    let upper_ids = get_uppers(&task);
                                    let has_active_count = ctx.should_track_activeness()
                                        && task
                                            .get_activeness()
                                            .is_some_and(|a| a.active_counter > 0);
                                    drop(task);
                                    if has_active_count {
                                        // TODO combine both operations to avoid the clone
                                        queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                                            task_ids: children.clone(),
                                        });
                                    }
                                    queue.push(
                                        InnerOfUppersLostFollowersJob {
                                            upper_ids,
                                            lost_follower_ids: children,
                                        }
                                        .into(),
                                    );
                                }
                            }
                            OutdatedEdge::Collectible(collectible, count) => {
                                let mut collectibles = Vec::new();
                                collectibles.push((collectible, -count));
                                outdated.retain(|e| match e {
                                    OutdatedEdge::Collectible(collectible, count) => {
                                        collectibles.push((*collectible, -*count));
                                        false
                                    }
                                    _ => true,
                                });
                                let mut task = ctx.task(task_id, TaskDataCategory::All);
                                let mut emptied_collectables = FxHashSet::default();
                                for (collectible, count) in collectibles.iter_mut() {
                                    if task
                                        .update_collectibles_positive_crossing(*collectible, *count)
                                    {
                                        emptied_collectables.insert(collectible.collectible_type);
                                    }
                                }

                                for ty in emptied_collectables {
                                    let task_ids: SmallVec<[_; 4]> = task
                                        .iter_collectibles_dependents()
                                        .filter_map(|(collectible_type, task)| {
                                            (collectible_type == ty).then_some(task)
                                        })
                                        .collect();
                                    queue.push(
                                        AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                                            task_ids,
                                            #[cfg(feature = "task_dirty_cause")]
                                            collectible_type: ty,
                                        },
                                    );
                                }
                                queue.extend(AggregationUpdateJob::data_update(
                                    &mut task,
                                    AggregatedDataUpdate::new().collectibles_update(collectibles),
                                ));
                            }
                            OutdatedEdge::CellDependency(forward) => {
                                let CellRef {
                                    task: cell_task_id,
                                    cell,
                                } = forward;
                                {
                                    let category = dependent_scrub_category(ctx);
                                    let mut task = ctx.task(cell_task_id, category);
                                    let removed = task.remove_cell_dependents(&CellRef {
                                        task: task_id,
                                        cell,
                                    });
                                    if removed && task.is_cell_dependents_empty() {
                                        ctx.note_maybe_collectible(&task);
                                    }
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
                                    task.remove_cell_dependencies(&forward);
                                }
                            }
                            OutdatedEdge::HashedCellDependency(forward, key) => {
                                // ame as above but in the `_hashed` sets.
                                let CellRef {
                                    task: cell_task_id,
                                    cell,
                                } = forward;
                                {
                                    let category = dependent_scrub_category(ctx);
                                    let mut task = ctx.task(cell_task_id, category);
                                    let removed = task.remove_cell_dependents_hashed(&(
                                        CellRef {
                                            task: task_id,
                                            cell,
                                        },
                                        key,
                                    ));

                                    if removed && task.is_cell_dependents_hashed_empty() {
                                        ctx.note_maybe_collectible(&task);
                                    }
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
                                    task.remove_cell_dependencies_hashed(&(forward, key));
                                }
                            }
                            OutdatedEdge::OutputDependency(output_task_id) => {
                                #[cfg(feature = "trace_task_output_dependencies")]
                                let _span = tracing::trace_span!(
                                    "remove output dependency",
                                    task = %output_task_id,
                                    dependent_task = %task_id
                                )
                                .entered();
                                {
                                    let category = dependent_scrub_category(ctx);
                                    let mut task = ctx.task(output_task_id, category);
                                    let removed = task.remove_output_dependent(&task_id);
                                    if removed && task.is_output_dependent_empty() {
                                        ctx.note_maybe_collectible(&task);
                                    }
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
                                    task.remove_output_dependencies(&output_task_id);
                                }
                            }
                            OutdatedEdge::CollectiblesDependency(CollectiblesRef {
                                collectible_type,
                                task: dependent_task_id,
                            }) => {
                                {
                                    let category = dependent_scrub_category(ctx);
                                    let mut task = ctx.task(dependent_task_id, category);
                                    let removed = task.remove_collectibles_dependents(&(
                                        collectible_type,
                                        task_id,
                                    ));
                                    if removed && task.collectibles_dependents_len() == 0 {
                                        ctx.note_maybe_collectible(&task);
                                    }
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
                                    task.remove_collectibles_dependencies(&CollectiblesRef {
                                        collectible_type,
                                        task: dependent_task_id,
                                    });
                                }
                            }
                        }
                    }

                    if outdated.is_empty() {
                        self = CleanupOldEdgesOperation::AggregationUpdate { queue: take(queue) };
                    }
                }
                CleanupOldEdgesOperation::AggregationUpdate { ref mut queue } => {
                    if let Some(slot) = defer_rebalance.as_deref_mut()
                        && queue.only_rebalance_remains()
                    {
                        // Edge removal is done; hand the rebalance back to the caller.
                        let queue = take(queue);
                        if queue.has_rebalance_work() {
                            *slot = Some(queue);
                        }
                        return Default::default();
                    }
                    if queue.process(ctx) {
                        self = CleanupOldEdgesOperation::Done {
                            #[cfg(feature = "trace_aggregation_update_stats")]
                            stats: take(&mut queue.stats),
                            #[cfg(not(feature = "trace_aggregation_update_stats"))]
                            stats: (),
                        };
                    }
                }
                CleanupOldEdgesOperation::Done { stats } => {
                    return stats;
                }
            }
        }
    }
}

impl Operation for CleanupOldEdgesOperation {
    fn execute(self, ctx: &mut impl ExecuteContext<'_>) {
        self.execute_with_stats(ctx);
    }
}
