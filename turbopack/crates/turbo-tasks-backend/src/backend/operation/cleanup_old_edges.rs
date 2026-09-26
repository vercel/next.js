use std::mem::take;

use auto_hash_map::AutoSet;
use bincode::{Decode, Encode};
use rustc_hash::{FxBuildHasher, FxHashSet};
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
    /// Reverse cell and output edges: some other task reads a cell of the task being deleted by GC.
    /// Not modeled as a reversed `CellDependency` since the cleanup is assymetric, one side is
    /// being deleted so we just tear down the other side.
    CellDependentOfDeleted(CellRef),
    HashedCellDependentOfDeleted(CellRef, u64),
    OutputDependentOfDeleted(TaskId),
}

impl OutdatedEdge {
    /// Whether the other end of this edge is a transient task. The persisted task graph omits such
    /// edges, so there is nothing to tear down for them in a later session.
    fn references_transient_task(&self) -> bool {
        match self {
            OutdatedEdge::Child(task_id)
            | OutdatedEdge::OutputDependency(task_id)
            | OutdatedEdge::OutputDependentOfDeleted(task_id) => task_id.is_transient(),
            OutdatedEdge::Collectible(collectible, _) => collectible.is_transient(),
            OutdatedEdge::CellDependency(cell)
            | OutdatedEdge::HashedCellDependency(cell, _)
            | OutdatedEdge::CellDependentOfDeleted(cell)
            | OutdatedEdge::HashedCellDependentOfDeleted(cell, _) => cell.is_transient(),
            OutdatedEdge::CollectiblesDependency(collectibles) => collectibles.is_transient(),
        }
    }
}

/// Captures *every* edge incident to a task -- both directions -- as [`OutdatedEdge`]s.
pub fn capture_all_edges(task: &impl TaskStorageAccessors) -> Vec<OutdatedEdge> {
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
    // Reverse direction: the edges *into* this task.
    old_edges.extend(
        task.iter_cell_dependents()
            .map(OutdatedEdge::CellDependentOfDeleted),
    );
    old_edges.extend(
        task.iter_cell_dependents_hashed()
            .map(|(r, k)| OutdatedEdge::HashedCellDependentOfDeleted(r, k)),
    );
    old_edges.extend(
        task.iter_output_dependent()
            .map(OutdatedEdge::OutputDependentOfDeleted),
    );
    old_edges
}

#[cfg(feature = "trace_aggregation_update_stats")]
type Stats = super::aggregation_update::AggregationUpdateQueueStats;
#[cfg(not(feature = "trace_aggregation_update_stats"))]
type Stats = ();

/// Work a GC-phase edge teardown produced but deliberately did not run, because it is unsafe while
/// other collect workers are still running. The caller replays it once the pass is quiescent.
#[derive(Default)]
pub struct DeferredCleanup {
    /// Rebalance jobs. `balance_edge` *adds* aggregation edges, which must not happen mid-cascade.
    pub balance_edges: Vec<(TaskId, TaskId)>,
    /// Dependents whose forward edge to the torn-down task was scrubbed. They must be dirtied: the
    /// value they were derived from no longer exists, so their cached result cannot be trusted.
    pub dirty_dependents: AutoSet<TaskId, FxBuildHasher, 2>,
}

impl CleanupOldEdgesOperation {
    /// Drops the references to transient tasks, before the operation is persisted.
    pub fn retain_persistent(&mut self) {
        let task_is_transient = match self {
            Self::RemoveEdges {
                task_id,
                outdated,
                queue,
            } => {
                outdated.retain(|edge| !edge.references_transient_task());
                queue.retain_persistent();
                task_id.is_transient()
            }
            Self::AggregationUpdate { queue } => {
                queue.retain_persistent();
                false
            }
            Self::Done { .. } => false,
        };
        if task_is_transient {
            // The task does not outlive the session, so neither do its edges; only the
            // aggregation work is left.
            let Self::RemoveEdges { queue, .. } = self else {
                unreachable!("only RemoveEdges references a task")
            };
            *self = Self::AggregationUpdate { queue: take(queue) };
        }
    }

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

    /// GC variant: tears down `outdated`, running only the edge deletions.
    ///
    /// Returns the work the deletions produced but did not run, for the caller to replay once the
    /// parallel collect is quiescent. Deletion is safe to run concurrently; the deferred work is
    /// not. `balance_edge` *adds* edges, and dirtying propagates through the aggregation graph --
    /// neither is safe while other workers are still collecting.
    pub fn run_edge_deletions_only<'a, C: ExecuteContext<'a>>(
        task_id: TaskId,
        outdated: Vec<OutdatedEdge>,
        ctx: &mut C,
    ) -> DeferredCleanup {
        let op = CleanupOldEdgesOperation::RemoveEdges {
            task_id,
            outdated,
            queue: AggregationUpdateQueue::new_without_optimizations(),
        };
        let (_, stopped) = op.execute_inner(ctx, true);
        // the option must be Some when stop_when_only_rebalance
        stopped.unwrap()
    }

    fn execute_with_stats(self, ctx: &mut impl ExecuteContext<'_>) -> Stats {
        self.execute_inner(ctx, false).0
    }

    fn execute_inner(
        mut self,
        ctx: &mut impl ExecuteContext<'_>,
        stop_when_only_rebalance_remains: bool,
    ) -> (Stats, Option<DeferredCleanup>) {
        let mut dirty_dependents = AutoSet::default();
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
                                children.retain(|child_id| {
                                    if task.remove_children(child_id) {
                                        if parent_is_transient || child_id.is_transient() {
                                            removed_transient.push(*child_id);
                                        } else {
                                            removed_durable.push(*child_id);
                                        }
                                        true
                                    } else {
                                        false
                                    }
                                });
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
                                    let mut task = ctx.task(cell_task_id, TaskDataCategory::Data);
                                    task.remove_cell_dependents(&CellRef {
                                        task: task_id,
                                        cell,
                                    });
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
                                    let mut task = ctx.task(cell_task_id, TaskDataCategory::Data);
                                    task.remove_cell_dependents_hashed(&(
                                        CellRef {
                                            task: task_id,
                                            cell,
                                        },
                                        key,
                                    ));
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
                                    let mut task = ctx.task(output_task_id, TaskDataCategory::Data);
                                    task.remove_output_dependent(&task_id);
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
                                    let mut task =
                                        ctx.task(dependent_task_id, TaskDataCategory::Meta);
                                    task.remove_collectibles_dependents(&(
                                        collectible_type,
                                        task_id,
                                    ));
                                }
                                {
                                    let mut task = ctx.task(task_id, TaskDataCategory::Data);
                                    task.remove_collectibles_dependencies(&CollectiblesRef {
                                        collectible_type,
                                        task: dependent_task_id,
                                    });
                                }
                            }
                            // Handle reverse edges, we remove these when `task_id` is being
                            // deleted.  The reverse dependents must exist and we dirty them as we
                            // go.  We also don't bother removing cell_dependents from `task_id`
                            // since that task is being deleted.
                            OutdatedEdge::CellDependentOfDeleted(CellRef {
                                task: dependent_task_id,
                                cell,
                            }) => {
                                // Orientation flip: the stored entry names the dependent, the
                                // forward entry we remove names `task_id`.
                                let forward = CellRef {
                                    task: task_id,
                                    cell,
                                };
                                let mut task = ctx.task(dependent_task_id, TaskDataCategory::Data);
                                task.remove_cell_dependencies(&forward);
                                task.remove_outdated_cell_dependencies(&forward);
                                drop(task);
                                dirty_dependents.insert(dependent_task_id);
                            }
                            OutdatedEdge::HashedCellDependentOfDeleted(
                                CellRef {
                                    task: dependent_task_id,
                                    cell,
                                },
                                key,
                            ) => {
                                let forward = CellRef {
                                    task: task_id,
                                    cell,
                                };
                                let mut task = ctx.task(dependent_task_id, TaskDataCategory::Data);
                                task.remove_cell_dependencies_hashed(&(forward, key));
                                task.remove_outdated_cell_dependencies_hashed(&(forward, key));
                                drop(task);
                                dirty_dependents.insert(dependent_task_id);
                            }
                            OutdatedEdge::OutputDependentOfDeleted(dependent_task_id) => {
                                let mut task = ctx.task(dependent_task_id, TaskDataCategory::Data);
                                task.remove_output_dependencies(&task_id);
                                task.remove_outdated_output_dependencies(&task_id);
                                drop(task);
                                dirty_dependents.insert(dependent_task_id);
                            }
                        }
                    }

                    // If we accumulated any dirty_dependents flush them to the aggregation update
                    // queue before suspending.
                    if !stop_when_only_rebalance_remains && !dirty_dependents.is_empty() {
                        queue.push(AggregationUpdateJob::InvalidateDueToDependencyTornDown {
                            task_ids: take(&mut dirty_dependents).into_iter().collect(),
                        });
                    }

                    if outdated.is_empty() {
                        self = CleanupOldEdgesOperation::AggregationUpdate { queue: take(queue) };
                    }
                }
                CleanupOldEdgesOperation::AggregationUpdate { ref mut queue } => {
                    if stop_when_only_rebalance_remains && queue.only_rebalance_remains() {
                        // Edge removal is done; hand the rebalance back to the caller. Any
                        // other pending work would be dropped here, so `only_rebalance_remains`
                        // asserts that nothing else is left.
                        return (
                            Default::default(),
                            Some(DeferredCleanup {
                                balance_edges: queue.take_deferred_balance_edges().collect(),
                                dirty_dependents,
                            }),
                        );
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
                    return (stats, None);
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
