#[cfg(feature = "trace_aggregation_update_stats")]
use std::mem::take;

use rustc_hash::FxHashSet;
use smallvec::SmallVec;
use turbo_tasks::TaskId;

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregatedDataUpdate, ExecuteContext, TaskGuard,
            aggregation_update::{
                AggregationUpdateJob, AggregationUpdateQueue, InnerOfUppersLostFollowersJob,
                get_aggregation_number, get_uppers, is_aggregating_node,
            },
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{CellRef, CollectibleRef, CollectiblesRef},
};

pub enum OutdatedEdge {
    Child(TaskId),
    Collectible(CollectibleRef, i32),
    /// `dependent` reads `cell`. Cleanup removes both halves of the edge, whichever side it was
    /// captured from.
    CellDependency {
        dependent: TaskId,
        cell: CellRef,
    },
    HashedCellDependency {
        dependent: TaskId,
        cell: CellRef,
        key: u64,
    },
    /// `dependent` reads the output of `output_task`.
    OutputDependency {
        dependent: TaskId,
        output_task: TaskId,
    },
    CollectiblesDependency(CollectiblesRef),
}

/// Captures *every* edge incident to `task` -- both directions -- as [`OutdatedEdge`]s.
pub fn capture_all_edges(task: &TaskGuard<'_>) -> Vec<OutdatedEdge> {
    let task_id = task.id();
    let mut old_edges: Vec<OutdatedEdge> = Vec::new();
    old_edges.extend(task.iter_children().map(OutdatedEdge::Child));
    old_edges.extend(task.iter_output_dependencies().map(|output_task| {
        OutdatedEdge::OutputDependency {
            dependent: task_id,
            output_task,
        }
    }));
    old_edges.extend(
        task.iter_cell_dependencies()
            .map(|cell| OutdatedEdge::CellDependency {
                dependent: task_id,
                cell,
            }),
    );
    old_edges.extend(task.iter_cell_dependencies_hashed().map(|(cell, key)| {
        OutdatedEdge::HashedCellDependency {
            dependent: task_id,
            cell,
            key,
        }
    }));
    old_edges.extend(
        task.iter_collectibles_dependencies()
            .map(OutdatedEdge::CollectiblesDependency),
    );
    // Reverse direction: the edges *into* this task. A stored dependent entry names the dependent
    // in `CellRef.task` and this task's cell in `CellRef.cell`.
    old_edges.extend(
        task.iter_cell_dependents()
            .map(|entry| OutdatedEdge::CellDependency {
                dependent: entry.task,
                cell: CellRef {
                    task: task_id,
                    cell: entry.cell,
                },
            }),
    );
    old_edges.extend(task.iter_cell_dependents_hashed().map(|(entry, key)| {
        OutdatedEdge::HashedCellDependency {
            dependent: entry.task,
            cell: CellRef {
                task: task_id,
                cell: entry.cell,
            },
            key,
        }
    }));
    old_edges.extend(task.iter_output_dependent().map(|dependent| {
        OutdatedEdge::OutputDependency {
            dependent,
            output_task: task_id,
        }
    }));
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
}

pub fn cleanup_old_edges(
    task_id: TaskId,
    outdated: Vec<OutdatedEdge>,
    queue: AggregationUpdateQueue,
    ctx: &mut ExecuteContext<'_>,
) -> Stats {
    cleanup_old_edges_inner(task_id, outdated, queue, ctx, false).0
}

/// GC variant: tears down `outdated`, running only the edge deletions.
///
/// Returns the work the deletions produced but did not run, for the caller to replay once the
/// parallel collect is quiescent. Deletion is safe to run concurrently; the deferred work is
/// not: `balance_edge` *adds* edges, which is unsafe while other workers are still collecting.
pub fn cleanup_old_edges_deletions_only(
    task_id: TaskId,
    outdated: Vec<OutdatedEdge>,
    ctx: &mut ExecuteContext<'_>,
) -> DeferredCleanup {
    let (_, stopped) = cleanup_old_edges_inner(
        task_id,
        outdated,
        AggregationUpdateQueue::new_without_optimizations(),
        ctx,
        true,
    );
    // the option must be Some when stop_when_only_rebalance
    stopped.unwrap()
}

fn cleanup_old_edges_inner(
    task_id: TaskId,
    mut outdated: Vec<OutdatedEdge>,
    mut queue: AggregationUpdateQueue,
    ctx: &mut ExecuteContext<'_>,
    stop_when_only_rebalance_remains: bool,
) -> (Stats, Option<DeferredCleanup>) {
    while let Some(edge) = outdated.pop() {
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
                        && task.get_activeness().is_some_and(|a| a.active_counter > 0);
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
                    if task.update_collectibles_positive_crossing(*collectible, *count) {
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
                    queue.push(AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                        task_ids,
                        collectibles_task: task_id,
                        collectible_type: ty,
                    });
                }
                queue.extend(AggregationUpdateJob::data_update(
                    &mut task,
                    AggregatedDataUpdate::new().collectibles_update(collectibles),
                ));
            }
            OutdatedEdge::CellDependency { dependent, cell } => {
                {
                    let mut task = ctx.task(cell.task, TaskDataCategory::Data);
                    task.remove_cell_dependents(&CellRef {
                        task: dependent,
                        cell: cell.cell,
                    });
                }
                {
                    let mut task = ctx.task(dependent, TaskDataCategory::Data);
                    task.remove_cell_dependencies(&cell);
                    task.remove_outdated_cell_dependencies(&cell);
                }
            }
            OutdatedEdge::HashedCellDependency {
                dependent,
                cell,
                key,
            } => {
                // Same as above but in the `_hashed` sets.
                {
                    let mut task = ctx.task(cell.task, TaskDataCategory::Data);
                    task.remove_cell_dependents_hashed(&(
                        CellRef {
                            task: dependent,
                            cell: cell.cell,
                        },
                        key,
                    ));
                }
                {
                    let mut task = ctx.task(dependent, TaskDataCategory::Data);
                    task.remove_cell_dependencies_hashed(&(cell, key));
                    task.remove_outdated_cell_dependencies_hashed(&(cell, key));
                }
            }
            OutdatedEdge::OutputDependency {
                dependent,
                output_task,
            } => {
                #[cfg(feature = "trace_task_output_dependencies")]
                let _span = tracing::trace_span!(
                    "remove output dependency",
                    task = %output_task,
                    dependent_task = %dependent
                )
                .entered();
                {
                    let mut task = ctx.task(output_task, TaskDataCategory::Data);
                    task.remove_output_dependent(&dependent);
                }
                {
                    let mut task = ctx.task(dependent, TaskDataCategory::Data);
                    task.remove_output_dependencies(&output_task);
                    task.remove_outdated_output_dependencies(&output_task);
                }
            }
            OutdatedEdge::CollectiblesDependency(CollectiblesRef {
                collectible_type,
                task: dependent_task_id,
            }) => {
                {
                    let mut task = ctx.task(dependent_task_id, TaskDataCategory::Meta);
                    task.remove_collectibles_dependents(&(collectible_type, task_id));
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

    while !stop_when_only_rebalance_remains || !queue.only_rebalance_remains() {
        if queue.process(ctx) {
            #[cfg(feature = "trace_aggregation_update_stats")]
            let stats = take(&mut queue.stats);
            #[cfg(not(feature = "trace_aggregation_update_stats"))]
            let stats = ();
            return (stats, None);
        }
    }
    // Edge removal is done; hand the rebalance back to the caller. Any
    // other pending work would be dropped here, so `only_rebalance_remains`
    // asserts that nothing else is left.
    (
        Default::default(),
        Some(DeferredCleanup {
            balance_edges: queue.take_deferred_balance_edges().collect(),
        }),
    )
}
