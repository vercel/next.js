//! Maintenance of the aggregation tree (`upper` / `followers` edges).
//!
//! # GC invariant: no aggregation edge may point at a GC-deleted task
//!
//! [`crate::backend::gc`] soft-deletes a task (`deleted` flag) and then removes all its outgoing
//! edges. For this to be correct all 'incoming edges' must be gone.  However GC is a highly
//! concurrent process. The snapshot waits for graph updates to finish before running GC. To assist
//! with GC aggregation updates need to be defensive about running on deleted tasks and also assist
//! GC by telling the context whenever an aggregation update queue operation may make a task
//! collectible (via [`ExecuteContext::note_maybe_collectible`] on `1->0` transitions), and also
//! as a safety check we [`TaskGuard::assert_not_deleted`] on every +1 transition
//!
//! # Removals that overtake additions: follower debt
//!
//! An edge between an upper task `U` and a task `F` is stored either as an inner edge
//! (`F.upper[U]`, unsigned) or as a follower edge (`U.followers[F]`, signed). Updates only lock one
//! or two tasks at a time and propagate through the graph as queued jobs, so the removal of an edge
//! can be processed before its addition (the addition may even be queued in the same queue).
//!
//! Such a removal doesn't wait for the addition. It records *debt*: a negative follower count. Only
//! `U.followers` can be negative, `F.upper` never is. Only counts `> 0` are real edges: readers of
//! followers (e.g. [`get_followers`]) ignore debt, and side effects (aggregated data, follower
//! propagation, active counts) only happen when a count crosses between `<= 0` and `> 0` (see
//! [`crate::backend::operation::aggregation_edge`]). Outgoing follower bookkeeping is not a GC
//! reference: debt does not pin its owning upper. When persistence is enabled, normal queues run
//! under an operation guard; snapshot/GC exclusion waits for these operations to settle. Within GC,
//! parallel deletion finishes before its deferred rebalancing runs (see [`crate::backend::gc`]).
//! These phase rules, not debt itself, keep GC from observing an in-flight normal update. If the
//! assumption below holds, no debt is left once all updates are processed. Removing the last raw
//! debt entry still reports possible collectibility, separately from semantic edge effects.
//!
//! A removal (`inner_of_upper(s)_lost_follower(s)`):
//! 1. Locks `F`. If `F.upper[U] > 0`, it decrements that inner edge.
//! 2. Otherwise it locks `U` and decrements `U.followers[F]`, possibly below zero.
//! 3. If that left debt, it locks `F` again and pushes a `BalanceEdge` when `F.upper[U] > 0` now.
//!
//! An addition (`inner_of_upper(s)_has_new_follower(s)`) always locks `U` first to read its
//! aggregation number:
//! - If `U.followers[F]` is debt, the addition is applied to the follower side, which pays the
//!   debt. If that makes the follower edge appear on the wrong side, a `BalanceEdge` is pushed.
//! - After it made an inner edge `F.upper[U]` appear, it locks `U` again and pushes a `BalanceEdge`
//!   when `U.followers[F]` is debt.
//!
//! The handlers for one or several uppers or followers share helpers for these steps:
//! - **Removal:** `remove_inner_edges` (step 1), then `on_inner_edges_disappeared`;
//!   `remove_follower_edges` (steps 2 and 3).
//! - **Addition:** `follower_add_side` and `add_follower_edge` (the follower side);
//!   `add_inner_edge`, then `on_inner_edges_appeared` (the inner side and the lock of `U` again).
//!
//! The handler for several followers locks `U` only once for all new inner edges
//! (`on_inner_edges_appeared_on_upper`).
//!
//! Debt and an inner edge can only coexist when an addition and a removal of the same edge run
//! concurrently. Both write their side first and read the other side afterwards, each under the
//! respective task lock (removal: write `U`, read `F`; addition: write `F`, read `U`). If the split
//! survives intervening operations, at least one sees the other's write and pushes a `BalanceEdge`.
//! Another update may already have paid the debt or removed the inner edge. `balance_edge` locks
//! both tasks and nets the debt against the inner count (see
//! [`crate::backend::operation::aggregation_edge::net_debt`]).
//!
//! ## Assumption: every debt is eventually paid
//!
//! Debt is only valid if the matching addition is eventually generated and processed. Producers
//! must push edge additions into a queue that their operation executes to completion. This is a
//! requirement on the producers, separate from the GC and snapshot rules above, and it only covers
//! normal completion: a panic or cancellation that drops a queue is outside this model. If an
//! addition is lost, the debt stays and a later, logically unrelated addition of the same task pair
//! silently pays it instead of creating the edge. That can leave a missing edge and skew
//! propagation. Unlike the previous retry loop, which panicked when the addition never arrived,
//! nothing reports this unless the `verify_aggregation_graph` feature is enabled; its stop-time
//! check reports residual debt on restored resident tasks.

use std::{
    cmp::max,
    collections::{VecDeque, hash_map::Entry as HashMapEntry},
    hash::Hash,
    mem::take,
    num::NonZeroU32,
};

use indexmap::map::Entry;
use ringmap::RingSet;
use rustc_hash::{FxBuildHasher, FxHashMap};
use smallvec::{SmallVec, smallvec};
#[cfg(feature = "trace_aggregation_update_queue")]
use tracing::span::Span;
#[cfg(any(
    feature = "trace_aggregation_update",
    feature = "trace_find_and_schedule"
))]
use tracing::trace_span;
#[cfg(feature = "task_dirty_cause")]
use turbo_tasks::TaskDirtyCause;
use turbo_tasks::{FxIndexMap, TaskExecutionReason, TaskId, TaskPriority, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, TaskGuard,
            aggregation_edge::{
                EdgeSide, EdgeTransition, FollowerCountChange, apply_follower_delta,
                edge_balance_side, edge_write_side, follower_delta, net_debt,
            },
            connect_child::resurrect_deleted,
            invalidate::make_task_dirty_internal,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{ActivenessState, AggregationNumber, CollectibleRef, CollectiblesRef},
    utils::swap_retain,
};

type FxRingSet<T> = RingSet<T, FxBuildHasher>;

pub const LEAF_NUMBER: u32 = 16;
const MAX_COUNT_BEFORE_YIELD: usize = 1000;
/// Batch size for find_and_schedule processing. These jobs are cheaper than aggregation
/// updates (they only read task metadata and optionally schedule a task), so we can process more
/// of them per `process()` call before yielding.
const FIND_AND_SCHEDULE_BATCH_SIZE: usize = 10000;
const MAX_UPPERS_FOLLOWER_PRODUCT: usize = 31;
/// Maximum number of `OptimizeJob`s held in the in-memory `optimize_queue` at one time.
/// When this is reached, further pushes are dropped and the affected tasks have their
/// `optimization_pending` flag set so the work is recovered later by
/// `check_optimization_pending`.
const MAX_OPTIMIZE_QUEUE_SIZE: usize = 10000;
/// Maximum number of optimizations executed by a single `AggregationUpdateQueue` instance
/// over its lifetime. Once exhausted, queued and newly pushed `OptimizeJob`s are dropped
/// the same way as when `MAX_OPTIMIZE_QUEUE_SIZE` is reached.
const MAX_OPTIMIZATIONS_PER_QUEUE: usize = 1000;
#[cfg(not(feature = "trace_aggregation_update"))]
const AGGREGATION_UPDATE_CATEGORY: TaskDataCategory = TaskDataCategory::Meta;
#[cfg(feature = "trace_aggregation_update")]
const AGGREGATION_UPDATE_CATEGORY: TaskDataCategory = TaskDataCategory::All;

type TaskIdVec = SmallVec<[TaskId; 4]>;
type TaskIdWithCountVec = SmallVec<[(TaskId, u32); 2]>;
/// Collectible count changes of an [`AggregatedDataUpdate`]. Most updates change a single
/// collectible, so one entry is stored inline.
pub type CollectiblesUpdateVec = SmallVec<[(CollectibleRef, i32); 1]>;

/// Returns true, when a node is aggregating its children and a partial subgraph.
pub fn is_aggregating_node(aggregation_number: u32) -> bool {
    aggregation_number >= LEAF_NUMBER
}

/// Returns true, when a node is aggregating the whole subgraph.
pub fn is_root_node(aggregation_number: u32) -> bool {
    aggregation_number == u32::MAX
}

/// Returns a list of tasks that are considered as "following" the task.
fn get_followers_with_aggregation_number(
    task: &TaskGuard<'_>,
    aggregation_number: u32,
) -> TaskIdVec {
    if is_aggregating_node(aggregation_number) {
        iter_positive_followers(task).collect()
    } else {
        task.iter_children().collect()
    }
}

/// Returns a list of tasks that are considered as "following" the task. The current tasks is not
/// aggregating over the follower tasks and they should be aggregated by all upper tasks.
fn get_followers(task: &TaskGuard<'_>) -> TaskIdVec {
    get_followers_with_aggregation_number(task, get_aggregation_number(task))
}

/// Iterates the real follower edges of a task, skipping debt (counts `<= 0`).
fn iter_positive_followers<'a>(task: &'a TaskGuard<'_>) -> impl Iterator<Item = TaskId> + 'a {
    task.iter_followers()
        .filter(|&(_, &count)| count > 0)
        .map(|(&id, _)| id)
}

/// Returns the follower count of `U.followers[F]`, `0` when there is no entry.
fn follower_count(upper: &TaskGuard<'_>, follower_id: TaskId) -> i32 {
    upper
        .get_followers(&follower_id)
        .copied()
        .unwrap_or_default()
}

/// Whether `U.followers[F]` is debt, i.e. removals of the edge were processed before its addition.
fn has_follower_debt(upper: &TaskGuard<'_>, follower_id: TaskId) -> bool {
    follower_count(upper, follower_id) < 0
}

/// Applies `delta` to `U.followers[F]`. The caller holds the lock of `upper` and handles the
/// returned transition. This is the only place that writes follower counts, except for
/// `balance_edge` which moves whole counts.
///
/// # Panics
///
/// When the count overflows, which would be a logic error.
fn update_follower_count(
    upper: &mut TaskGuard<'_>,
    follower_id: TaskId,
    delta: i32,
) -> FollowerCountChange {
    let upper_id = upper.id();
    let mut change = FollowerCountChange { old: 0, new: 0 };
    upper.update_followers(follower_id, |old| {
        let old = old.unwrap_or_default();
        change = apply_follower_delta(old, delta).unwrap_or_else(|| {
            panic!("follower count of {follower_id} in {upper_id} overflows ({old} + {delta})")
        });
        (change.new != 0).then_some(change.new)
    });
    change
}

/// Addition step 3: the side on which an addition of the edge between the locked `upper` and
/// `follower_id` is written. `write_side` is the side [`edge_write_side`] chose from the
/// aggregation numbers.
///
/// Debt of the edge is paid on the follower side, even when the edge should be an inner edge (see
/// module docs).
fn follower_add_side(upper: &TaskGuard<'_>, write_side: EdgeSide, follower_id: TaskId) -> EdgeSide {
    if write_side == EdgeSide::Follower || has_follower_debt(upper, follower_id) {
        EdgeSide::Follower
    } else {
        EdgeSide::Inner
    }
}

/// Addition step 6a: adds the inner edge `F.upper[U]` with `count` under the lock of `follower`.
/// Returns whether the inner edge is new; then it continues with
/// [`AggregationUpdateQueue::on_inner_edges_appeared`].
fn add_inner_edge(
    follower: &mut TaskGuard<'_>,
    upper_id: TaskId,
    count: u32,
    operation: &str,
) -> bool {
    follower.assert_not_deleted(operation);
    follower.update_upper_count(upper_id, count)
}

/// Returns a list of tasks that are considered as "upper" tasks of the task. The upper tasks are
/// aggregating over the task.
pub fn get_uppers(task: &TaskGuard<'_>) -> TaskIdVec {
    task.iter_upper().map(|(&id, _count)| id).collect()
}

/// Acquires a `Meta`-category guard for `task_id` and sets `optimization_pending`. Used in
/// the optimize-queue drop paths when the caller doesn't already hold a guard for the task.
fn lock_and_mark_optimization_pending(ctx: &mut ExecuteContext<'_>, task_id: TaskId) {
    let mut task = ctx.task(task_id, TaskDataCategory::Meta);
    task.set_optimization_pending(true);
}

/// Returns the aggregation number of the task.
pub fn get_aggregation_number(task: &TaskGuard<'_>) -> u32 {
    task.get_aggregation_number()
        .map(|a| a.effective)
        .unwrap_or_default()
}

#[derive(Debug)]
pub struct ComputeDirtyAndCleanUpdate {
    pub old_dirty_container_count: i32,
    pub new_dirty_container_count: i32,
    pub old_current_session_clean_container_count: i32,
    pub new_current_session_clean_container_count: i32,
    pub old_self_dirty: bool,
    pub new_self_dirty: bool,
    pub old_current_session_self_clean: bool,
    pub new_current_session_self_clean: bool,
}

pub struct ComputeDirtyAndCleanUpdateResult {
    pub dirty_count_update: i32,
    pub current_session_clean_update: i32,
}

impl ComputeDirtyAndCleanUpdate {
    pub fn compute(self) -> ComputeDirtyAndCleanUpdateResult {
        let ComputeDirtyAndCleanUpdate {
            old_dirty_container_count,
            new_dirty_container_count,
            old_current_session_clean_container_count,
            new_current_session_clean_container_count,
            old_self_dirty,
            new_self_dirty,
            old_current_session_self_clean,
            new_current_session_self_clean,
        } = self;
        let was_dirty_without_clean = old_self_dirty || old_dirty_container_count > 0;
        let is_dirty_without_clean = new_self_dirty || new_dirty_container_count > 0;
        let was_dirty = old_self_dirty && !old_current_session_self_clean
            || old_dirty_container_count > 0
                && old_dirty_container_count > old_current_session_clean_container_count;
        let is_dirty = new_self_dirty && !new_current_session_self_clean
            || new_dirty_container_count > 0
                && new_dirty_container_count > new_current_session_clean_container_count;
        let was_flagged_clean = was_dirty_without_clean && !was_dirty;
        let is_flagged_clean = is_dirty_without_clean && !is_dirty;

        fn before_after_to_diff_value(before: bool, after: bool) -> i32 {
            match (before, after) {
                (true, false) => -1,
                (false, true) => 1,
                _ => 0,
            }
        }
        let dirty_count_update =
            before_after_to_diff_value(was_dirty_without_clean, is_dirty_without_clean);
        let current_session_clean_update =
            before_after_to_diff_value(was_flagged_clean, is_flagged_clean);

        ComputeDirtyAndCleanUpdateResult {
            dirty_count_update,
            current_session_clean_update,
        }
    }
}

impl ComputeDirtyAndCleanUpdateResult {
    pub fn aggregated_update(&self, task_id: TaskId) -> Option<AggregatedDataUpdate> {
        if self.dirty_count_update != 0 || self.current_session_clean_update != 0 {
            Some(AggregatedDataUpdate::new().dirty_container_update(
                task_id,
                self.dirty_count_update,
                self.current_session_clean_update,
            ))
        } else {
            None
        }
    }
}

#[derive(Clone, Debug)]
pub struct InnerOfUppersHasNewFollowersJob {
    pub upper_ids: TaskIdVec,
    pub new_follower_ids: TaskIdVec,
}

impl From<InnerOfUppersHasNewFollowersJob> for AggregationUpdateJob {
    fn from(job: InnerOfUppersHasNewFollowersJob) -> Self {
        AggregationUpdateJob::InnerOfUppersHasNewFollowers(Box::new(job))
    }
}

#[derive(Clone, Debug)]
pub struct InnerOfUppersLostFollowersJob {
    pub upper_ids: TaskIdVec,
    pub lost_follower_ids: TaskIdVec,
}

impl From<InnerOfUppersLostFollowersJob> for AggregationUpdateJob {
    fn from(job: InnerOfUppersLostFollowersJob) -> Self {
        AggregationUpdateJob::InnerOfUppersLostFollowers(Box::new(job))
    }
}

#[derive(Clone, Debug)]
pub struct AggregatedDataUpdateJob {
    pub upper_ids: TaskIdVec,
    pub update: AggregatedDataUpdate,
}

impl From<AggregatedDataUpdateJob> for AggregationUpdateJob {
    fn from(job: AggregatedDataUpdateJob) -> Self {
        AggregationUpdateJob::AggregatedDataUpdate(Box::new(job))
    }
}

/// A job in the job queue for updating something in the aggregated graph.
#[derive(Clone, Debug)]
pub enum AggregationUpdateJob {
    /// Update the aggregation number of a task. This might result in balancing needed to update
    /// "upper" and "follower" edges.
    UpdateAggregationNumber {
        task_id: TaskId,
        base_aggregation_number: u32,
        distance: Option<NonZeroU32>,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has a new follower.
    InnerOfUppersHasNewFollower {
        upper_ids: TaskIdVec,
        new_follower_id: TaskId,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has a new follower.
    InnerOfUppersHasNewFollowerWithCount {
        upper_ids: TaskIdWithCountVec,
        new_follower_id: TaskId,
    },
    /// Notifies an upper task that one of its inner tasks has new followers.
    InnerOfUpperHasNewFollowers {
        upper_id: TaskId,
        new_follower_ids: TaskIdVec,
    },
    /// Notifies an upper task that one of its inner tasks has new followers.
    InnerOfUpperHasNewFollowersWithCount {
        upper_id: TaskId,
        new_follower_ids: TaskIdWithCountVec,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has new followers.
    InnerOfUppersHasNewFollowers(Box<InnerOfUppersHasNewFollowersJob>),
    /// Notifies multiple upper tasks that one of its inner tasks has lost a follower.
    InnerOfUppersLostFollower {
        upper_ids: TaskIdVec,
        lost_follower_id: TaskId,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has lost followers.
    InnerOfUppersLostFollowers(Box<InnerOfUppersLostFollowersJob>),
    /// Notifies an upper task that one of its inner tasks has lost followers.
    InnerOfUpperLostFollowers {
        upper_id: TaskId,
        lost_follower_ids: TaskIdVec,
    },
    /// Adjust the persistent `parent_count` of each task in `task_ids` by `delta`
    AdjustParentCount { task_ids: TaskIdVec, delta: i32 },
    /// Adjust the session-only `transient_ref_count` of each task in `task_ids` by `delta`
    AdjustTransientRefCount { task_ids: TaskIdVec, delta: i32 },
    /// Notifies an upper task about changed data from an inner task.
    AggregatedDataUpdate(Box<AggregatedDataUpdateJob>),
    /// Invalidates tasks that are dependent on a collectible type of `collectibles_task`.
    InvalidateDueToCollectiblesChange {
        task_ids: TaskIdVec,
        /// The task whose (aggregated) collectibles changed, i.e. the task the dependents read.
        collectibles_task: TaskId,
        collectible_type: turbo_tasks::TraitTypeId,
    },
    /// Increases the active counter of the task
    IncreaseActiveCount {
        task: TaskId,
        release_construction_ref: bool,
    },
    /// Increases the active counters of the tasks
    IncreaseActiveCounts { task_ids: TaskIdVec },
    /// Decreases the active counter of the task
    DecreaseActiveCount { task: TaskId },
    /// Decreases the active counters of the tasks
    DecreaseActiveCounts { task_ids: TaskIdVec },
    /// Balances the edges of the graph. This checks if the graph invariant is still met for this
    /// edge and coverts a upper edge to a follower edge or vice versa. Balancing might triggers
    /// more changes to the structure.
    BalanceEdge { upper_id: TaskId, task_id: TaskId },
}

impl AggregationUpdateJob {
    pub fn data_update(
        task: &mut TaskGuard<'_>,
        update: AggregatedDataUpdate,
    ) -> Option<AggregationUpdateJob> {
        let upper_ids: SmallVec<_> = get_uppers(task);
        if !upper_ids.is_empty() {
            Some(
                AggregatedDataUpdateJob {
                    upper_ids,
                    update: update.clone(),
                }
                .into(),
            )
        } else {
            None
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct DirtyContainerUpdate {
    task_id: TaskId,
    dirty_count: i32,
    current_session_clean_count: i32,
}

/// Combines the entries of a collectibles update into one summed count per collectible and drops
/// the collectibles whose counts sum to zero. Used by [`AggregatedDataUpdate::optimize`]; generic
/// so it can be tested without real collectibles.
///
/// The order of the result is unspecified. Counts are added without overflow checks; their sum is
/// not expected to overflow.
fn sum_collectibles_update<K: Hash + Eq + Copy>(
    mut update: SmallVec<[(K, i32); 1]>,
) -> SmallVec<[(K, i32); 1]> {
    if update.len() < 2 {
        update.retain(|&mut (_, count)| count != 0);
        return update;
    }
    let mut sums: FxHashMap<K, i32> =
        FxHashMap::with_capacity_and_hasher(update.len(), FxBuildHasher);
    for (key, count) in update.drain(..) {
        *sums.entry(key).or_insert(0) += count;
    }
    // Reuses the allocation of `update`, which is at least as large as the result.
    update.extend(sums.into_iter().filter(|&(_, count)| count != 0));
    update
}

/// Aggregated data update.
#[derive(Default, Clone, Debug)]
pub struct AggregatedDataUpdate {
    /// One of the inner tasks has changed its dirty state or aggregated dirty state.
    dirty_container_update: Option<DirtyContainerUpdate>,
    /// One of the inner tasks has changed its collectibles count or aggregated collectibles count.
    collectibles_update: CollectiblesUpdateVec,
}

impl AggregatedDataUpdate {
    /// Derives an `AggregatedDataUpdate` from a task. This is used when a task is connected to an
    /// upper task.
    fn from_task(task: &mut TaskGuard<'_>) -> Self {
        let aggregation = get_aggregation_number(task);
        let mut dirty_count = 0;
        let mut current_session_clean_count = 0;
        let collectibles_update = if is_aggregating_node(aggregation) {
            dirty_count = task
                .get_aggregated_dirty_container_count()
                .copied()
                .unwrap_or_default();
            current_session_clean_count = task
                .get_aggregated_current_session_clean_container_count()
                .copied()
                .unwrap_or_default();
            // Allocate an upper bound of the number of entries up front, so the update isn't
            // reallocated while the task is locked.
            let mut collectibles_update = CollectiblesUpdateVec::with_capacity(
                task.collectibles_len() + task.aggregated_collectibles_len(),
            );
            collectibles_update.extend(task.iter_collectibles().map(|(&k, &v)| (k, v)));
            for (collectible, count) in task.iter_aggregated_collectibles() {
                if *count > 0 {
                    collectibles_update.push((*collectible, 1));
                }
            }
            collectibles_update
        } else {
            task.iter_collectibles().map(|(&k, &v)| (k, v)).collect()
        };
        let (dirty, current_session_clean) = task.dirty_state();
        if dirty {
            dirty_count += 1;
        }
        if current_session_clean {
            current_session_clean_count += 1;
        }

        let mut result = Self::new().collectibles_update(collectibles_update);
        if dirty_count > 0 {
            result = result.dirty_container_update(
                task.id(),
                if dirty_count > 0 { 1 } else { 0 },
                if dirty_count > 0 && dirty_count - current_session_clean_count <= 0 {
                    1
                } else {
                    0
                },
            );
        }
        result
    }

    /// Combines the collectibles entries of the update into one net count per collectible and
    /// drops the collectibles whose contributions cancel out.
    ///
    /// For an aggregating task, [`AggregatedDataUpdate::from_task`] emits both the task's own
    /// collectible counts and `+1` for each positive aggregated collectible. A task that drops or
    /// takes the collectibles of its children holds an own count of `-1` for each collectible of
    /// its subgraph, so most of those entries cancel out. Optimizing avoids inserting and removing
    /// them again in every upper.
    ///
    /// Applying the optimized update (or its inversion) to an upper yields the same counts and the
    /// same set of collectibles whose presence changes, as applying the original one. Only
    /// intermediate presence flips within the update are skipped.
    ///
    /// This is O(number of entries), so call it after releasing the task lock, where different
    /// workers can optimize their updates concurrently.
    fn optimize(mut self) -> Self {
        self.collectibles_update = sum_collectibles_update(take(&mut self.collectibles_update));
        self
    }

    /// Inverts the update. This is used when the task is removed from an upper task.
    fn invert(mut self) -> Self {
        let Self {
            dirty_container_update,
            collectibles_update,
        } = &mut self;
        if let Some(update) = dirty_container_update.as_mut() {
            update.dirty_count = -update.dirty_count;
            update.current_session_clean_count = -update.current_session_clean_count;
        }
        for (_, value) in collectibles_update.iter_mut() {
            *value = -*value;
        }
        self
    }

    /// Applies the update to the task. It may return an aggregated update that should be applied to
    /// upper tasks.
    #[allow(clippy::needless_late_init)]
    fn apply(
        &self,
        task: &mut TaskGuard<'_>,
        should_track_activeness: bool,
        queue: &mut AggregationUpdateQueue,
    ) -> AggregatedDataUpdate {
        fn before_after_to_diff_value(before: bool, after: bool) -> i32 {
            match (before, after) {
                (true, false) => -1,
                (false, true) => 1,
                _ => 0,
            }
        }

        let Self {
            dirty_container_update,
            collectibles_update,
        } = self;
        let mut result = Self::default();
        if let &Some(DirtyContainerUpdate {
            task_id: dirty_container_id,
            dirty_count: count,
            current_session_clean_count: current_session_clean_update,
        }) = dirty_container_update
        {
            if should_track_activeness {
                // When a dirty container count is increased and the task is considered as active
                // we need to schedule the dirty tasks in the new dirty container
                let current_session_update = count - current_session_clean_update;
                if current_session_update > 0 && task.has_activeness() {
                    queue.push_find_and_schedule_dirty(dirty_container_id)
                }
            }

            // Update AggregatedDirtyContainer and compute aggregated update
            let mut dirty_container_count_update = 0;
            let old_dirty_single_container_count;
            let new_dirty_single_container_count;
            if count != 0 {
                new_dirty_single_container_count =
                    task.update_and_get_aggregated_dirty_containers(dirty_container_id, count);
                old_dirty_single_container_count = new_dirty_single_container_count - count;
                dirty_container_count_update = before_after_to_diff_value(
                    old_dirty_single_container_count > 0,
                    new_dirty_single_container_count > 0,
                );
            } else {
                new_dirty_single_container_count = task
                    .get_aggregated_dirty_containers(&dirty_container_id)
                    .copied()
                    .unwrap_or_default();
                old_dirty_single_container_count = new_dirty_single_container_count;
            }

            // Update AggregatedSessionDependentCleanContainer
            let old_single_container_current_session_clean_count;
            let new_single_container_current_session_clean_count;
            if current_session_clean_update != 0 {
                new_single_container_current_session_clean_count = task
                    .update_and_get_aggregated_current_session_clean_containers(
                        dirty_container_id,
                        current_session_clean_update,
                    );
                old_single_container_current_session_clean_count =
                    new_single_container_current_session_clean_count - current_session_clean_update;
            } else {
                new_single_container_current_session_clean_count = task
                    .get_aggregated_current_session_clean_containers(&dirty_container_id)
                    .copied()
                    .unwrap_or_default();
                old_single_container_current_session_clean_count =
                    new_single_container_current_session_clean_count;
            }

            // compute aggregated update
            let was_single_container_clean = old_dirty_single_container_count > 0
                && old_dirty_single_container_count
                    <= old_single_container_current_session_clean_count;
            let is_single_container_clean = new_dirty_single_container_count > 0
                && new_dirty_single_container_count
                    <= new_single_container_current_session_clean_count;
            let current_session_clean_update =
                before_after_to_diff_value(was_single_container_clean, is_single_container_clean);

            if dirty_container_count_update != 0 || current_session_clean_update != 0 {
                let (is_self_dirty, current_session_self_clean) = task.dirty_state();

                let task_id = task.id();

                // Update AggregatedDirtyContainerCount and compute aggregate value
                let old_dirty_container_count;
                let new_dirty_container_count;
                if dirty_container_count_update != 0 {
                    new_dirty_container_count = task
                        .update_and_get_aggregated_dirty_container_count(
                            dirty_container_count_update,
                        );
                    old_dirty_container_count =
                        new_dirty_container_count - dirty_container_count_update;
                } else {
                    new_dirty_container_count = task
                        .get_aggregated_dirty_container_count()
                        .copied()
                        .unwrap_or_default();
                    old_dirty_container_count = new_dirty_container_count;
                };

                // Update AggregatedSessionDependentCleanContainerCount and compute aggregate value
                let new_current_session_clean_container_count;
                let old_current_session_clean_container_count;
                if current_session_clean_update != 0 {
                    new_current_session_clean_container_count = task
                        .update_and_get_aggregated_current_session_clean_container_count(
                            current_session_clean_update,
                        );
                    old_current_session_clean_container_count =
                        new_current_session_clean_container_count - current_session_clean_update;
                } else {
                    new_current_session_clean_container_count = task
                        .get_aggregated_current_session_clean_container_count()
                        .copied()
                        .unwrap_or_default();
                    old_current_session_clean_container_count =
                        new_current_session_clean_container_count;
                };

                let compute_result = ComputeDirtyAndCleanUpdate {
                    old_dirty_container_count,
                    new_dirty_container_count,
                    old_current_session_clean_container_count,
                    new_current_session_clean_container_count,
                    old_self_dirty: is_self_dirty,
                    new_self_dirty: is_self_dirty,
                    old_current_session_self_clean: current_session_self_clean,
                    new_current_session_self_clean: current_session_self_clean,
                }
                .compute();

                if let Some(aggregated_update) = compute_result.aggregated_update(task_id) {
                    result = aggregated_update;

                    if let Some(update) = result.dirty_container_update
                        && update.dirty_count - update.current_session_clean_count < 0
                    {
                        // When the current task is no longer dirty, we need to fire the
                        // aggregate root events and do some cleanup
                        if let Some(activeness_state) = task.get_activeness_mut() {
                            activeness_state.all_clean_event.notify(usize::MAX);
                            activeness_state.unset_active_until_clean();
                            if activeness_state.is_empty() {
                                task.take_activeness();
                            }
                        }
                    }
                }
            }
        }
        for (collectible, count) in collectibles_update {
            let mut added = false;
            let mut removed = false;
            task.update_aggregated_collectibles(*collectible, |old: Option<i32>| {
                let old = old.unwrap_or(0);
                let new = old + *count;
                if old <= 0 && new > 0 {
                    added = true;
                } else if old > 0 && new <= 0 {
                    removed = true;
                }
                (new != 0).then_some(new)
            });
            if added || removed {
                let ty = collectible.collectible_type;
                let dependent: TaskIdVec = task
                    .iter_collectibles_dependents()
                    .filter_map(|(collectible_type, task)| (collectible_type == ty).then_some(task))
                    .collect();
                if !dependent.is_empty() {
                    queue.push(AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                        task_ids: dependent,
                        collectibles_task: task.id(),
                        collectible_type: ty,
                    })
                }
            }
            if added {
                result.collectibles_update.push((*collectible, 1));
            } else if removed {
                result.collectibles_update.push((*collectible, -1));
            }
        }
        result
    }

    /// Returns true, when the update is empty resp. a no-op.
    fn is_empty(&self) -> bool {
        let Self {
            dirty_container_update,
            collectibles_update,
        } = self;
        dirty_container_update.is_none() && collectibles_update.is_empty()
    }

    /// Creates a new empty update.
    pub fn new() -> Self {
        Self {
            dirty_container_update: None,
            collectibles_update: SmallVec::new(),
        }
    }

    /// Adds a dirty container update to the update.
    pub fn dirty_container_update(
        mut self,
        task_id: TaskId,
        count: i32,
        current_session_clean_update: i32,
    ) -> Self {
        self.dirty_container_update = Some(DirtyContainerUpdate {
            task_id,
            dirty_count: count,
            current_session_clean_count: current_session_clean_update,
        });
        self
    }

    /// Adds a collectibles update to the update.
    pub fn collectibles_update(mut self, collectibles_update: CollectiblesUpdateVec) -> Self {
        self.collectibles_update = collectibles_update;
        self
    }
}

/// An aggregation number update job that is enqueued.
struct AggregationNumberUpdate {
    base_aggregation_number: u32,
    distance: Option<NonZeroU32>,
    #[cfg(feature = "trace_aggregation_update_queue")]
    span: Option<Span>,
}

/// An aggregated data update job that is enqueued. See `AggregatedDataUpdate`.
struct AggregationUpdateJobItem {
    job: AggregationUpdateJob,
    #[cfg(feature = "trace_aggregation_update_queue")]
    span: Option<Span>,
}

impl AggregationUpdateJobItem {
    fn new(job: AggregationUpdateJob) -> Self {
        Self {
            job,
            #[cfg(feature = "trace_aggregation_update_queue")]
            span: Some(Span::current()),
        }
    }

    fn entered(self) -> AggregationUpdateJobGuard {
        AggregationUpdateJobGuard {
            job: self.job,
            #[cfg(feature = "trace_aggregation_update_queue")]
            _guard: self.span.map(|s| s.entered()),
        }
    }
}

struct AggregationUpdateJobGuard {
    job: AggregationUpdateJob,
    #[cfg(feature = "trace_aggregation_update_queue")]
    _guard: Option<tracing::span::EnteredSpan>,
}

/// A balancing job that is enqueued. See `balance_edge`.
struct BalanceJob {
    upper_id: TaskId,
    task_id: TaskId,
    #[cfg(feature = "trace_aggregation_update_queue")]
    span: Option<Span>,
}

impl BalanceJob {
    fn new(upper: TaskId, task: TaskId) -> Self {
        Self {
            upper_id: upper,
            task_id: task,
            #[cfg(feature = "trace_aggregation_update_queue")]
            span: Some(Span::current()),
        }
    }
}

impl Hash for BalanceJob {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.upper_id.hash(state);
        self.task_id.hash(state);
    }
}

impl PartialEq for BalanceJob {
    fn eq(&self, other: &Self) -> bool {
        self.upper_id == other.upper_id && self.task_id == other.task_id
    }
}

impl Eq for BalanceJob {}

/// An optimization job that is enqueued. See `optimize_task`.
struct OptimizeJob {
    task_id: TaskId,
    /// Whether the `optimization_pending` flag was known to already be set on the task at
    /// the moment the job was enqueued. When this is true, dropping the job (because the
    /// per-queue optimization budget got exhausted before processing it, or because the
    /// in-memory queue was full at push time) does not require taking a task lock to mark
    /// the task pending — the flag is already set.
    ///
    /// This is a best-effort snapshot taken at push time. It can become stale by the time
    /// the job is processed, either through:
    /// - concurrent updates (another thread sets or clears `optimization_pending`), or
    /// - `RingSet` deduplication (a second push for the same `task_id` is a no-op even if it would
    ///   record a different snapshot — the original entry's value is kept).
    ///
    /// A stale snapshot is still correct, just possibly suboptimal:
    /// - If the snapshot is `false` but the flag is now `true`: at drop we acquire a guard and
    ///   re-set the flag (a no-op write — slightly wasted work, but correct).
    /// - If the snapshot is `true` but the flag is now `false`: at drop we skip the guard. The
    ///   only way this can happen is that some other path ran `optimize_task` for this task and
    ///   cleared the flag — i.e., the optimization we were about to drop has already been
    ///   performed. Skipping the flag set is exactly what we want.
    optimization_pending_flag_already_set: bool,
    #[cfg(feature = "trace_aggregation_update_queue")]
    span: Option<Span>,
}

impl OptimizeJob {
    fn new(task: TaskId, optimization_pending_flag_already_set: bool) -> Self {
        Self {
            task_id: task,
            optimization_pending_flag_already_set,
            #[cfg(feature = "trace_aggregation_update_queue")]
            span: Some(Span::current()),
        }
    }
}

impl Hash for OptimizeJob {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.task_id.hash(state);
    }
}

impl PartialEq for OptimizeJob {
    fn eq(&self, other: &Self) -> bool {
        self.task_id == other.task_id
    }
}

impl Eq for OptimizeJob {}

/// A job to find and schedule dirty tasks that is enqueued. See `find_and_schedule_dirty`.
struct FindAndScheduleJob {
    task_id: TaskId,
    #[cfg(feature = "trace_find_and_schedule")]
    span: Option<Span>,
}

impl FindAndScheduleJob {
    fn new(task: TaskId) -> Self {
        Self {
            task_id: task,
            #[cfg(feature = "trace_find_and_schedule")]
            span: Some(Span::current()),
        }
    }
}

impl Hash for FindAndScheduleJob {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.task_id.hash(state);
    }
}

impl PartialEq for FindAndScheduleJob {
    fn eq(&self, other: &Self) -> bool {
        self.task_id == other.task_id
    }
}

impl Eq for FindAndScheduleJob {}

#[cfg(feature = "trace_aggregation_update_stats")]
#[derive(Default, Debug)]
pub struct AggregationUpdateQueueStats {
    new_followers: usize,
    inner_of_upper_has_new_follower: usize,
    inner_of_uppers_has_new_follower: usize,
    inner_of_upper_has_new_followers: usize,
    lost_followers: usize,
    inner_of_upper_lost_follower: usize,
    inner_of_upper_lost_followers: usize,
    inner_of_uppers_lost_follower: usize,
    balance_edge: usize,
    balance_edge_batches: usize,
    update_aggregation_number: usize,
    update_aggregation_number_batches: usize,
    optimize_task: usize,
    aggregated_data_update: usize,
    find_and_schedule_dirty_batches: usize,
    find_and_schedule_dirty: usize,
    schedule_task: usize,
}

#[cfg(test)]
type TestHook = Box<dyn FnOnce(&mut ExecuteContext<'_>) + Send>;

/// A queue for aggregation update jobs.
#[derive(Default)]
pub struct AggregationUpdateQueue {
    jobs: VecDeque<AggregationUpdateJobItem>,
    aggregation_number_updates: FxIndexMap<TaskId, AggregationNumberUpdate>,
    done_aggregation_number_updates: FxHashMap<TaskId, AggregationNumberUpdate>,
    find_and_schedule: FxRingSet<FindAndScheduleJob>,
    balance_queue: FxRingSet<BalanceJob>,
    optimize_queue: FxRingSet<OptimizeJob>,
    /// Number of optimizations executed by this queue so far. See
    /// `MAX_OPTIMIZATIONS_PER_QUEUE`.
    optimizations_executed: usize,
    scheduled_tasks: FxHashMap<TaskId, TaskPriority>,
    /// One-shot interleaving at the unlocked boundary after the debt precheck and before the inner
    /// write. Per-queue (not global), and absent from production builds.
    #[cfg(test)]
    before_inner_write: Option<TestHook>,
    #[cfg(feature = "trace_aggregation_update_stats")]
    pub stats: AggregationUpdateQueueStats,
}

impl AggregationUpdateQueue {
    /// Creates a new empty queue.
    pub fn new() -> Self {
        Self {
            jobs: VecDeque::with_capacity(0),
            aggregation_number_updates: FxIndexMap::default(),
            done_aggregation_number_updates: FxHashMap::default(),
            find_and_schedule: FxRingSet::default(),
            balance_queue: FxRingSet::default(),
            optimize_queue: FxRingSet::default(),
            optimizations_executed: 0,
            scheduled_tasks: FxHashMap::default(),
            #[cfg(test)]
            before_inner_write: None,
            #[cfg(feature = "trace_aggregation_update_stats")]
            stats: AggregationUpdateQueueStats::default(),
        }
    }

    /// Runs the test's simulated concurrent operation without holding either task lock.
    #[cfg(test)]
    fn before_inner_write_for_testing(&mut self, ctx: &mut ExecuteContext<'_>) {
        if let Some(hook) = self.before_inner_write.take() {
            hook(ctx);
        }
    }

    /// A queue that defers every optimization: each request is recorded on its task's
    /// `optimization_pending` flag instead of being enqueued.
    pub fn new_without_optimizations() -> Self {
        Self {
            // Start the budget already spent, so every optimization is refused.
            optimizations_executed: MAX_OPTIMIZATIONS_PER_QUEUE,
            ..Self::new()
        }
    }

    /// Returns true, when the queue is empty.
    pub fn is_empty(&self) -> bool {
        let Self {
            jobs,
            aggregation_number_updates,
            find_and_schedule,
            balance_queue,
            optimize_queue,
            optimizations_executed: _,
            done_aggregation_number_updates: _,
            scheduled_tasks,
            #[cfg(test)]
                before_inner_write: _,
            #[cfg(feature = "trace_aggregation_update_stats")]
                stats: _,
        } = self;
        jobs.is_empty()
            && aggregation_number_updates.is_empty()
            && find_and_schedule.is_empty()
            && balance_queue.is_empty()
            && optimize_queue.is_empty()
            && scheduled_tasks.is_empty()
    }

    /// Pushes a job to the queue.
    pub fn push(&mut self, job: AggregationUpdateJob) {
        match job {
            AggregationUpdateJob::UpdateAggregationNumber {
                task_id,
                base_aggregation_number,
                distance,
            } => {
                match self.aggregation_number_updates.entry(task_id) {
                    Entry::Occupied(mut entry) => {
                        let update = entry.get_mut();
                        update.base_aggregation_number =
                            max(update.base_aggregation_number, base_aggregation_number);
                        if let Some(distance) = distance {
                            if let Some(update_distance) = update.distance.as_mut() {
                                *update_distance = max(*update_distance, distance);
                            } else {
                                update.distance = Some(distance);
                            }
                        }
                    }
                    Entry::Vacant(entry) => {
                        match self.done_aggregation_number_updates.entry(task_id) {
                            HashMapEntry::Occupied(mut entry) => {
                                let update = entry.get_mut();
                                let change =
                                    if update.base_aggregation_number < base_aggregation_number {
                                        true
                                    } else if let Some(distance) = distance {
                                        update.distance.is_none_or(|d| d < distance)
                                    } else {
                                        false
                                    };
                                if !change {
                                    return;
                                }
                                entry.remove();
                            }
                            HashMapEntry::Vacant(_) => {}
                        }
                        entry.insert(AggregationNumberUpdate {
                            base_aggregation_number,
                            distance,
                            #[cfg(feature = "trace_aggregation_update_queue")]
                            span: Some(Span::current()),
                        });
                    }
                };
            }
            AggregationUpdateJob::BalanceEdge { upper_id, task_id } => {
                self.balance_queue
                    .push_back(BalanceJob::new(upper_id, task_id));
            }
            _ => {
                self.jobs.push_back(AggregationUpdateJobItem::new(job));
            }
        }
    }

    /// Extends the queue with multiple jobs.
    pub fn extend(&mut self, jobs: impl IntoIterator<Item = AggregationUpdateJob>) {
        for job in jobs {
            self.push(job);
        }
    }

    /// Pushes a job to find and schedule dirty tasks.
    pub fn push_find_and_schedule_dirty(&mut self, task_id: TaskId) {
        self.find_and_schedule
            .push_back(FindAndScheduleJob::new(task_id));
    }

    /// Extends the queue with multiple jobs to find and schedule dirty tasks.
    pub fn extend_find_and_schedule_dirty(&mut self, task_ids: impl IntoIterator<Item = TaskId>) {
        self.find_and_schedule
            .extend(task_ids.into_iter().map(FindAndScheduleJob::new));
    }

    /// Whether this queue has reached its lifetime budget for executed optimizations.
    /// While exhausted, popped `OptimizeJob`s are dropped instead of run, and pushes don't
    /// enqueue (see [`Self::try_enqueue_optimize_job`]).
    fn is_optimization_budget_exhausted(&self) -> bool {
        self.optimizations_executed >= MAX_OPTIMIZATIONS_PER_QUEUE
    }

    /// Tries to enqueue an `OptimizeJob`. Returns `false` if the in-memory queue is at its
    /// `MAX_OPTIMIZE_QUEUE_SIZE` cap or this queue's lifetime budget is exhausted, in which
    /// case the caller is responsible for setting `optimization_pending` on the task so the
    /// dropped optimization can be recovered later via [`Self::check_optimization_pending`].
    ///
    /// Pass `optimization_pending_flag_already_set = true` when `optimization_pending` was just
    /// observed as `true`. If this job is later dropped at process time (because the budget
    /// runs out before it gets a turn), this lets us skip a task lock that would only be used
    /// to re-write a flag that's already set.
    #[must_use = "if false, the caller must set `optimization_pending` to recover the drop"]
    fn try_enqueue_optimize_job(
        &mut self,
        task_id: TaskId,
        optimization_pending_flag_already_set: bool,
    ) -> bool {
        if self.is_optimization_budget_exhausted()
            || self.optimize_queue.len() >= MAX_OPTIMIZE_QUEUE_SIZE
        {
            return false;
        }
        self.optimize_queue.push_back(OptimizeJob::new(
            task_id,
            optimization_pending_flag_already_set,
        ));
        true
    }

    /// Schedules an optimization of `task`'s aggregation number.
    ///
    /// Records the current `optimization_pending` flag value on the enqueued job — reading
    /// it is free since the caller already holds the guard, and the saved flag value lets
    /// a later drop avoid an unnecessary flag write.
    /// If the job can't be enqueued the flag is set on the task instead.
    fn push_optimize_task(&mut self, task: &mut TaskGuard<'_>) {
        let optimization_pending_flag_already_set = task.optimization_pending();
        if !self.try_enqueue_optimize_job(task.id(), optimization_pending_flag_already_set) {
            task.set_optimization_pending(true);
        }
    }

    /// Like [`Self::push_optimize_task`], but takes a task id instead of a guard.
    ///
    /// Only called from `optimize_task`'s self re-enqueue, which has just cleared the flag at
    /// entry, so the enqueued job carries `optimization_pending_flag_already_set = false`. The
    /// `Meta`-category guard is acquired only when the push has to be dropped.
    fn push_optimize_task_by_id(&mut self, ctx: &mut ExecuteContext<'_>, task_id: TaskId) {
        if !self.try_enqueue_optimize_job(task_id, false) {
            lock_and_mark_optimization_pending(ctx, task_id);
        }
    }

    /// If the `optimization_pending` flag is set on `task`, enqueues an `OptimizeJob` so the
    /// dropped optimization gets retried. Used as a lazy recovery hook from aggregation
    /// update handlers that already hold a task guard. The flag itself is cleared later,
    /// when `optimize_task` actually runs for this task.
    ///
    /// Intentionally not called from `find_and_schedule_dirty_internal` or increase_active_count:
    /// these functions do not modify the aggregation graph or use it in a way that  benefits from
    /// up-to-date optimization, so we leave its tasks for one of the other recovery hooks to
    /// pick up.  These functions are also in the crticial path of execution, it is better to defer
    /// optimization work to where it is required.
    fn check_optimization_pending(&mut self, task: &TaskGuard<'_>) {
        if !task.optimization_pending() {
            // Common case: nothing pending, no work to do.
            return;
        }
        // Flag is already set: even if this job ends up being dropped, no flag write is
        // needed and we can let the return value go.
        let _ = self.try_enqueue_optimize_job(task.id(), true);
    }

    /// Runs the job and all dependent jobs until it's done.
    pub fn run(job: AggregationUpdateJob, ctx: &mut ExecuteContext<'_>) {
        let mut queue = Self::new();
        queue.push(job);
        queue.execute(ctx);
    }

    /// Runs everything up to the rebalance work (`balance_edge` / `optimize`), then takes the
    /// pending balance edges out of the queue and returns them instead of running them.
    ///
    /// GC uses this to stop once edge removal is done and defer the rebalance until the parallel
    /// collect is quiescent; see [`super::cleanup_old_edges_deletions_only`], which is the only
    /// caller. The queue must be built with [`Self::new_without_optimizations`].
    pub(super) fn execute_until_rebalance(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
    ) -> Vec<(TaskId, TaskId)> {
        // `process` runs `jobs` and `aggregation_number_updates` before every other queue, so
        // nothing below them has run yet when both are empty.
        while !(self.jobs.is_empty() && self.aggregation_number_updates.is_empty()) {
            self.process(ctx);
        }
        assert!(
            self.find_and_schedule.is_empty() && self.scheduled_tasks.is_empty(),
            "GC deletion must not schedule task executions, but {} find_and_schedule and {} \
             scheduled_tasks jobs are pending",
            self.find_and_schedule.len(),
            self.scheduled_tasks.len(),
        );
        assert!(
            self.optimize_queue.is_empty(),
            "a queue built with `new_without_optimizations` must never hold optimize jobs"
        );
        take(&mut self.balance_queue)
            .into_iter()
            .map(|job| (job.upper_id, job.task_id))
            .collect()
    }

    /// Queues balance jobs for `edges`, skipping any whose endpoints have since been collected:
    /// the edge went with them, and balancing a deleted task is what the deferral exists to avoid.
    pub fn extend_balance_edges(
        &mut self,
        edges: impl IntoIterator<Item = (TaskId, TaskId)>,
        ctx: &mut ExecuteContext<'_>,
    ) {
        for (upper_id, task_id) in edges {
            // structure as 2 if statements to ensure the first guard is dropped before the second
            // one is fetched.
            if ctx.task(upper_id, TaskDataCategory::Meta).deleted() {
                continue;
            }
            if ctx.task(task_id, TaskDataCategory::Meta).deleted() {
                continue;
            }
            self.push(AggregationUpdateJob::BalanceEdge { upper_id, task_id });
        }
    }

    /// Executes a single step of the queue. Returns true, when the queue is empty.
    fn process(&mut self, ctx: &mut ExecuteContext<'_>) -> bool {
        if let Some(job) = self.jobs.pop_front() {
            let job: AggregationUpdateJobGuard = job.entered();
            match job.job {
                AggregationUpdateJob::UpdateAggregationNumber { .. }
                | AggregationUpdateJob::BalanceEdge { .. } => {
                    // These jobs are never pushed to the queue
                    unreachable!();
                }
                AggregationUpdateJob::InnerOfUppersHasNewFollowers(boxed) => {
                    let InnerOfUppersHasNewFollowersJob {
                        mut upper_ids,
                        mut new_follower_ids,
                    } = *boxed;
                    let uppers = upper_ids.len();
                    let followers = new_follower_ids.len();
                    if uppers == 1 && followers == 1 {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += 1;
                            self.stats.inner_of_upper_has_new_follower += 1;
                        }
                        self.inner_of_upper_has_new_follower(
                            ctx,
                            new_follower_ids[0],
                            upper_ids[0],
                            1,
                        );
                    } else if uppers > followers {
                        while let Some(new_follower_id) = new_follower_ids.pop() {
                            let upper_ids = if new_follower_ids.is_empty() {
                                take(&mut upper_ids)
                            } else {
                                upper_ids.clone()
                            };
                            #[cfg(feature = "trace_aggregation_update_stats")]
                            {
                                self.stats.new_followers += uppers;
                                self.stats.inner_of_uppers_has_new_follower += 1;
                            }
                            self.inner_of_uppers_has_new_follower(ctx, new_follower_id, upper_ids);
                        }
                    } else {
                        while let Some(upper_id) = upper_ids.pop() {
                            let new_follower_ids = if upper_ids.is_empty() {
                                take(&mut new_follower_ids)
                            } else {
                                new_follower_ids.clone()
                            };
                            #[cfg(feature = "trace_aggregation_update_stats")]
                            {
                                self.stats.new_followers += followers;
                                self.stats.inner_of_upper_has_new_followers += 1;
                            }
                            self.inner_of_upper_has_new_followers(ctx, new_follower_ids, upper_id);
                        }
                    }
                }
                AggregationUpdateJob::InnerOfUppersHasNewFollower {
                    upper_ids,
                    new_follower_id,
                } => {
                    if upper_ids.len() == 1 {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += upper_ids.len();
                            self.stats.inner_of_upper_has_new_follower += 1;
                        }
                        self.inner_of_upper_has_new_follower(ctx, new_follower_id, upper_ids[0], 1);
                    } else {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += upper_ids.len();
                            self.stats.inner_of_uppers_has_new_follower += 1;
                        }
                        self.inner_of_uppers_has_new_follower(ctx, new_follower_id, upper_ids);
                    }
                }
                AggregationUpdateJob::InnerOfUppersHasNewFollowerWithCount {
                    upper_ids,
                    new_follower_id,
                } => {
                    if upper_ids.len() == 1 {
                        let (id, count) = upper_ids[0];
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += upper_ids.len();
                            self.stats.inner_of_upper_has_new_follower += 1;
                        }
                        self.inner_of_upper_has_new_follower(ctx, new_follower_id, id, count);
                    } else {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += upper_ids.len();
                            self.stats.inner_of_uppers_has_new_follower += 1;
                        }
                        self.inner_of_uppers_has_new_follower(ctx, new_follower_id, upper_ids);
                    }
                }
                AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                    upper_id,
                    new_follower_ids,
                } => {
                    if new_follower_ids.len() == 1 {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += new_follower_ids.len();
                            self.stats.inner_of_upper_has_new_follower += 1;
                        }
                        self.inner_of_upper_has_new_follower(ctx, new_follower_ids[0], upper_id, 1);
                    } else {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += new_follower_ids.len();
                            self.stats.inner_of_upper_has_new_followers += 1;
                        }
                        self.inner_of_upper_has_new_followers(ctx, new_follower_ids, upper_id);
                    }
                }
                AggregationUpdateJob::InnerOfUpperHasNewFollowersWithCount {
                    upper_id,
                    new_follower_ids,
                } => {
                    if new_follower_ids.len() == 1 {
                        let (id, count) = new_follower_ids[0];
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += new_follower_ids.len();
                            self.stats.inner_of_upper_has_new_follower += 1;
                        }
                        self.inner_of_upper_has_new_follower(ctx, id, upper_id, count);
                    } else {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.new_followers += new_follower_ids.len();
                            self.stats.inner_of_upper_has_new_followers += 1;
                        }
                        self.inner_of_upper_has_new_followers(ctx, new_follower_ids, upper_id);
                    }
                }
                AggregationUpdateJob::InnerOfUppersLostFollowers(boxed) => {
                    let InnerOfUppersLostFollowersJob {
                        mut upper_ids,
                        mut lost_follower_ids,
                    } = *boxed;
                    let uppers = upper_ids.len();
                    let followers = lost_follower_ids.len();
                    if uppers == 1 && followers == 1 {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.lost_followers += 1;
                            self.stats.inner_of_upper_lost_follower += 1;
                        }
                        self.inner_of_upper_lost_follower(ctx, lost_follower_ids[0], upper_ids[0]);
                    } else if uppers > followers {
                        while let Some(lost_follower_id) = lost_follower_ids.pop() {
                            let upper_ids = if lost_follower_ids.is_empty() {
                                take(&mut upper_ids)
                            } else {
                                upper_ids.clone()
                            };
                            #[cfg(feature = "trace_aggregation_update_stats")]
                            {
                                self.stats.lost_followers += uppers;
                                self.stats.inner_of_upper_lost_follower += 1;
                            }
                            self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids);
                        }
                    } else {
                        while let Some(upper_id) = upper_ids.pop() {
                            let lost_follower_ids = if upper_ids.is_empty() {
                                take(&mut lost_follower_ids)
                            } else {
                                lost_follower_ids.clone()
                            };
                            #[cfg(feature = "trace_aggregation_update_stats")]
                            {
                                self.stats.lost_followers += followers;
                                self.stats.inner_of_upper_lost_followers += 1;
                            }
                            self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id);
                        }
                    }
                }
                AggregationUpdateJob::InnerOfUppersLostFollower {
                    upper_ids,
                    lost_follower_id,
                } => {
                    if upper_ids.len() == 1 {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.lost_followers += upper_ids.len();
                            self.stats.inner_of_upper_lost_follower += 1;
                        }
                        self.inner_of_upper_lost_follower(ctx, lost_follower_id, upper_ids[0]);
                    } else {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.lost_followers += upper_ids.len();
                            self.stats.inner_of_uppers_lost_follower += 1;
                        }
                        self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids);
                    }
                }
                AggregationUpdateJob::InnerOfUpperLostFollowers {
                    upper_id,
                    lost_follower_ids,
                } => {
                    if lost_follower_ids.len() == 1 {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.lost_followers += lost_follower_ids.len();
                            self.stats.inner_of_upper_lost_follower += 1;
                        }
                        self.inner_of_upper_lost_follower(ctx, lost_follower_ids[0], upper_id);
                    } else {
                        #[cfg(feature = "trace_aggregation_update_stats")]
                        {
                            self.stats.lost_followers += lost_follower_ids.len();
                            self.stats.inner_of_upper_lost_followers += 1;
                        }
                        self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id);
                    }
                }
                AggregationUpdateJob::AggregatedDataUpdate(AggregatedDataUpdateJob {
                    upper_ids,
                    update,
                }) => {
                    #[cfg(feature = "trace_aggregation_update_stats")]
                    {
                        self.stats.aggregated_data_update += 1;
                    }
                    self.aggregated_data_update(upper_ids, ctx, update);
                }
                AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                    task_ids,
                    collectibles_task,
                    collectible_type,
                } => {
                    let target = CollectiblesRef {
                        task: collectibles_task,
                        collectible_type,
                    };
                    for task_id in task_ids {
                        let mut task = ctx.task(task_id, TaskDataCategory::All);
                        // Like cell dependencies: if the dependency is outdated, the current
                        // execution hasn't read these collectibles yet and will see the new ones
                        // when it does, so it must be made dirty but not stale.
                        let make_stale = !task.outdated_collectibles_dependencies_contains(&target);
                        make_task_dirty_internal(
                            &mut task,
                            make_stale,
                            #[cfg(feature = "task_dirty_cause")]
                            TaskDirtyCause::CollectiblesChange { collectible_type },
                            self,
                            ctx,
                        );
                    }
                }
                AggregationUpdateJob::AdjustParentCount { task_ids, delta } => {
                    ctx.for_each_task_meta(task_ids, "AdjustParentCount", |mut task, ctx| {
                        if task.update_and_get_parent_count(delta) == 0 {
                            ctx.note_maybe_collectible(&task);
                        }
                    });
                }
                AggregationUpdateJob::AdjustTransientRefCount { task_ids, delta } => {
                    ctx.for_each_task_meta(task_ids, "AdjustTransientRefCount", |mut task, ctx| {
                        if task.update_and_get_transient_ref_count(delta) == 0 {
                            ctx.note_maybe_collectible(&task);
                        }
                    });
                }
                AggregationUpdateJob::DecreaseActiveCount { task } => {
                    self.decrease_active_count(ctx, task);
                }
                AggregationUpdateJob::DecreaseActiveCounts { task_ids } => {
                    for task_id in task_ids {
                        self.decrease_active_count(ctx, task_id);
                    }
                }
                AggregationUpdateJob::IncreaseActiveCount {
                    task,
                    release_construction_ref,
                } => {
                    self.increase_active_count(ctx, task, release_construction_ref);
                }
                AggregationUpdateJob::IncreaseActiveCounts { task_ids } => {
                    for task_id in task_ids {
                        self.increase_active_count(
                            ctx, task_id, /* release_construction_ref */ false,
                        );
                    }
                }
            }
            false
        } else if !self.aggregation_number_updates.is_empty() {
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                self.stats.update_aggregation_number_batches += 1;
            }
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some((
                    task_id,
                    AggregationNumberUpdate {
                        base_aggregation_number,
                        distance,
                        #[cfg(feature = "trace_aggregation_update_queue")]
                        span,
                    },
                )) = self.aggregation_number_updates.pop()
                {
                    #[cfg(feature = "trace_aggregation_update_queue")]
                    let _guard = span.map(|s| s.entered());
                    self.done_aggregation_number_updates.insert(
                        task_id,
                        AggregationNumberUpdate {
                            base_aggregation_number,
                            distance,
                            #[cfg(feature = "trace_aggregation_update_queue")]
                            span: None,
                        },
                    );
                    #[cfg(feature = "trace_aggregation_update_stats")]
                    {
                        self.stats.update_aggregation_number += 1;
                    }
                    self.update_aggregation_number(ctx, task_id, distance, base_aggregation_number);
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else if !self.balance_queue.is_empty() {
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                self.stats.balance_edge_batches += 1;
            }
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some(BalanceJob {
                    upper_id: upper,
                    task_id: task,
                    #[cfg(feature = "trace_aggregation_update_queue")]
                    span,
                }) = self.balance_queue.pop_front()
                {
                    #[cfg(feature = "trace_aggregation_update_queue")]
                    let _guard = span.map(|s| s.entered());
                    #[cfg(feature = "trace_aggregation_update_stats")]
                    {
                        self.stats.balance_edge += 1;
                    }
                    self.balance_edge(ctx, upper, task);
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else if self.is_optimization_budget_exhausted() && !self.optimize_queue.is_empty() {
            // Budget exhausted: drop all remaining jobs and mark their tasks so the optimizations
            // are recovered later by a future aggregation update operation.
            ctx.for_each_task_meta(
                self.optimize_queue
                    .drain(..)
                    .filter(|job| !job.optimization_pending_flag_already_set)
                    .map(|job| job.task_id),
                "mark optimization pending",
                |mut task, _| {
                    task.set_optimization_pending(true);
                },
            );
            false
        } else if let Some(OptimizeJob {
            task_id,
            optimization_pending_flag_already_set,
            #[cfg(feature = "trace_aggregation_update_queue")]
            span,
        }) = self.optimize_queue.pop_front()
        {
            // Note: We must process one optimization completely before starting with the next
            // one. Otherwise this could lead to optimizing every node of a subgraph of inner
            // nodes, as all have the same upper count. Optimizing the root first lets the
            // children become "doesn't need optimization".
            #[cfg(feature = "trace_aggregation_update_queue")]
            let _guard = span.map(|s| s.entered());
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                self.stats.optimize_task += 1;
            }
            self.optimizations_executed += 1;
            self.optimize_task(ctx, task_id, optimization_pending_flag_already_set);
            false
        } else if !self.find_and_schedule.is_empty() {
            let count = self
                .find_and_schedule
                .len()
                .min(FIND_AND_SCHEDULE_BATCH_SIZE);
            let jobs: SmallVec<[FindAndScheduleJob; 4]> =
                self.find_and_schedule.drain(..count).collect();
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                self.stats.find_and_schedule_dirty_batches += 1;
                self.stats.find_and_schedule_dirty += jobs.len();
            }
            self.find_and_schedule_dirty(jobs, ctx);
            false
        } else if !self.scheduled_tasks.is_empty() {
            #[cfg(feature = "trace_aggregation_update_stats")]
            {
                self.stats.schedule_task += self.scheduled_tasks.len();
            }
            ctx.for_each_task_all(
                self.scheduled_tasks.keys().copied(),
                "schedule tasks",
                |task, ctx| {
                    let parent_priority = self.scheduled_tasks[&task.id()];
                    ctx.schedule_task(&task, parent_priority);
                },
            );
            self.scheduled_tasks.clear();
            false
        } else {
            true
        }
    }

    /// Balances the edge between two tasks. This checks if the graph invariant is still met for
    /// this edge and coverts a upper edge to a follower edge or vice versa. Balancing might
    /// triggers more changes to the structure.
    ///
    /// Before that, it nets follower debt against an inner edge of the same tasks. Both can exist
    /// at the same time when an addition and a removal of the edge raced (see module docs).
    ///
    /// It locks both tasks simultaneously to atomically change the edges.
    fn balance_edge(&mut self, ctx: &mut ExecuteContext<'_>, upper_id: TaskId, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("process balance edge").entered();

        let (mut upper, mut task) = ctx.task_pair(
            upper_id,
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );
        self.check_optimization_pending(&upper);
        self.check_optimization_pending(&task);

        // Net debt against the inner edge
        let inner_count = task.get_upper(&upper_id).copied().unwrap_or_default();
        let follower_count = follower_count(&upper, task_id);
        let follower_count = {
            let (new_inner_count, new_follower_count) = net_debt(inner_count, follower_count);
            if new_inner_count != inner_count {
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("net debt").entered();

                upper.update_followers(task_id, |_| {
                    (new_follower_count != 0).then_some(new_follower_count)
                });
                if upper.is_followers_empty() {
                    ctx.note_maybe_collectible(&upper);
                }
                if new_inner_count == 0 {
                    // The inner edge was added by an addition that has been cancelled by a
                    // removal. Remove it again. `on_inner_edges_disappeared` handles the
                    // collectibility of `task`.
                    task.remove_upper(&upper_id);
                    drop(upper);
                    self.on_inner_edges_disappeared(ctx, task, Some(upper_id));
                    return;
                }
                task.update_upper(upper_id, |_| Some(new_inner_count));
            }
            new_follower_count
        };
        if follower_count < 0 {
            // Debt stays on the follower side until it's paid by the addition. There is no inner
            // edge (`net_debt` would have cancelled it), so there is nothing to place.
            return;
        }

        let upper_aggregation_number = get_aggregation_number(&upper);
        let task_aggregation_number = get_aggregation_number(&task);

        match edge_balance_side(upper_aggregation_number, task_aggregation_number) {
            Some(EdgeSide::Inner) => {
                // remove all follower edges
                let count = upper.remove_followers(&task_id).unwrap_or_default();
                if count == 0 {
                    return;
                }
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("make inner").entered();

                let count = u32::try_from(count).expect("follower count is positive here");
                if upper.followers_len().is_power_of_two() {
                    self.push_optimize_task(&mut upper);
                }
                if upper.is_followers_empty() {
                    ctx.note_maybe_collectible(&upper);
                }

                let upper_ids = get_uppers(&upper);

                // Add the same amount of upper edges
                // Probe: neither endpoint of a new aggregation edge may be GC-deleted.
                // `balance_edge` is the one site holding both guards, so both are checked.
                upper.assert_not_deleted("balance_edge add upper (upper endpoint)");
                task.assert_not_deleted("balance_edge add upper (inner endpoint)");
                if task.update_upper_count(upper_id, count) {
                    if task.upper_len().is_power_of_two() {
                        self.push_optimize_task(&mut task);
                    }
                    // When this is a new inner node, update aggregated data and
                    // followers
                    let data = AggregatedDataUpdate::from_task(&mut task);
                    let followers = get_followers(&task);
                    let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);

                    if !upper_ids.is_empty() && !diff.is_empty() {
                        // Notify uppers about changed aggregated data
                        self.push(
                            AggregatedDataUpdateJob {
                                upper_ids,
                                update: diff,
                            }
                            .into(),
                        );
                    }
                    if !followers.is_empty() {
                        self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                            upper_id,
                            new_follower_ids: followers,
                        });
                    }

                    if ctx.should_track_activeness() && upper.has_activeness() {
                        // If the upper node is has `Activeness` we need to schedule the
                        // dirty tasks in the new dirty container
                        self.push_find_and_schedule_dirty(task_id);
                    }
                }
                let effects = FollowerEdgeEffects::capture(ctx, &upper);
                drop(upper);
                drop(task);

                // The follower edge was removed: notify uppers and update the active count
                effects.push_lost_followers(self, smallvec![task_id]);
            }
            Some(EdgeSide::Follower) => {
                // Remove the upper edge
                let count = task.remove_upper(&upper_id).unwrap_or_default();
                if count == 0 {
                    return;
                }
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("make follower").entered();

                if task.is_upper_empty() {
                    ctx.note_maybe_collectible(&task);
                }
                let effects = FollowerEdgeEffects::capture(ctx, &upper);

                // Add the same amount of follower edges
                upper.assert_not_deleted("balance_edge add follower (upper endpoint)");
                task.assert_not_deleted("balance_edge add follower (follower endpoint)");
                let change = update_follower_count(
                    &mut upper,
                    task_id,
                    follower_delta(upper_id, task_id, count),
                );
                let new_follower = change.transition() == EdgeTransition::Appeared;
                // May optimize the task
                if new_follower && upper.followers_len().is_power_of_two() {
                    self.push_optimize_task(&mut upper);
                }

                // Since this is no longer an inner node, update the aggregated data and
                // followers
                let data = AggregatedDataUpdate::from_task(&mut task).invert();
                let followers = get_followers(&task);
                let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                drop(upper);
                drop(task);
                if !effects.upper_ids.is_empty() && !diff.is_empty() {
                    self.push(
                        AggregatedDataUpdateJob {
                            upper_ids: effects.upper_ids.clone(),
                            update: diff,
                        }
                        .into(),
                    );
                }
                if !followers.is_empty() {
                    self.push(
                        InnerOfUppersLostFollowersJob {
                            upper_ids: smallvec![upper_id],
                            lost_follower_ids: followers,
                        }
                        .into(),
                    );
                }
                if new_follower {
                    // notify uppers about new follower and update the active count
                    effects.push_new_followers(self, smallvec![task_id]);
                }
            }
            None => {
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("conflict").entered();

                // both nodes have the same aggregation number
                // We need to change the aggregation number of the task
                let current = task.get_aggregation_number().copied().unwrap_or_default();
                self.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id,
                    base_aggregation_number: current.base + 1,
                    distance: None,
                });
            }
        }
    }

    /// Schedules the tasks if they're dirty.
    ///
    /// Only used when activeness is tracked.
    fn find_and_schedule_dirty(
        &mut self,
        jobs: SmallVec<[FindAndScheduleJob; 4]>,
        ctx: &mut ExecuteContext<'_>,
    ) {
        #[cfg(feature = "trace_find_and_schedule")]
        let mut spans: FxHashMap<TaskId, Option<Span>> = jobs
            .iter()
            .map(|job| (job.task_id, job.span.clone()))
            .collect();
        // For performance reasons this should stay `Meta` and not `All`
        ctx.for_each_task_meta(
            jobs.into_iter().map(|job| job.task_id),
            "find and schedule dirty",
            |task, ctx| {
                let task_id = task.id();
                // Enter the enqueue-time span and create a per-task child span with the
                // task description. Both guards must live until the end of the closure.
                #[cfg(feature = "trace_find_and_schedule")]
                let _trace = (
                    spans.remove(&task_id).flatten().map(|s| s.entered()),
                    trace_span!("find and schedule", %task_id, name = task.get_task_description())
                        .entered(),
                );
                self.find_and_schedule_dirty_internal(task_id, task, ctx);
            },
        );
    }

    fn find_and_schedule_dirty_internal(
        &mut self,
        task_id: TaskId,
        mut task: TaskGuard<'_>,
        ctx: &mut ExecuteContext<'_>,
    ) {
        // Task need to be scheduled if it's dirty or doesn't have output
        let dirty = task.is_dirty();
        let should_schedule = if let Some(parent_priority) = dirty {
            Some((TaskExecutionReason::ActivateDirty, parent_priority))
        } else if !task.has_output() {
            Some((
                TaskExecutionReason::ActivateInitial,
                ctx.get_current_task_priority(),
            ))
        } else {
            None
        };

        // if it has `Activeness` we can skip visiting the nested nodes since
        // this would already be scheduled by the `Activeness`
        let is_active_until_clean = task.get_activeness().is_some_and(|a| a.active_until_clean);
        if !is_active_until_clean {
            let mut dirty_containers = task.dirty_containers().peekable();
            let is_empty = dirty_containers.peek().is_none();
            if !is_empty || dirty.is_some() {
                self.extend_find_and_schedule_dirty(dirty_containers);

                let activeness_state =
                    task.get_activeness_mut_or_insert_with(|| ActivenessState::new(task_id));
                activeness_state.set_active_until_clean();
            }
        }
        if let Some((reason, parent_priority)) = should_schedule {
            let description = EventDescription::new(|| task.get_task_desc_fn());
            if task.add_scheduled(reason, description) {
                drop(task);
                self.scheduled_tasks.insert(task_id, parent_priority);
            }
        }
    }

    fn aggregated_data_update(
        &mut self,
        upper_ids: TaskIdVec,
        ctx: &mut ExecuteContext<'_>,
        update: AggregatedDataUpdate,
    ) {
        // For performance reasons this should stay `Meta` and not `All`
        ctx.for_each_task_meta(
            upper_ids.iter().copied(),
            "aggregated data update",
            |mut upper, ctx| {
                self.check_optimization_pending(&upper);
                let diff = update.apply(&mut upper, ctx.should_track_activeness(), self);
                if !diff.is_empty() {
                    let upper_ids = get_uppers(&upper);
                    if !upper_ids.is_empty() {
                        self.push(
                            AggregatedDataUpdateJob {
                                upper_ids,
                                update: diff,
                            }
                            .into(),
                        );
                    }
                }
            },
        );
    }

    /// Removes one edge between `upper_id` and `lost_follower_id`.
    ///
    /// See the module docs for the removal steps and how debt is handled.
    fn inner_of_upper_lost_follower(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        lost_follower_id: TaskId,
        upper_id: TaskId,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("lost follower").entered();

        // STEP 1: inner edge
        let mut upper_ids = Some(upper_id);
        self.remove_inner_edges(ctx, lost_follower_id, &mut upper_ids);

        // STEP 2 and 3: follower edge or debt
        if upper_ids.is_some() {
            self.remove_follower_edges(ctx, upper_id, Some(lost_follower_id));
        }
    }

    /// Removes one edge between each of `upper_ids` and `lost_follower_id`.
    ///
    /// See the module docs for the removal steps and how debt is handled.
    fn inner_of_uppers_lost_follower(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        lost_follower_id: TaskId,
        mut upper_ids: TaskIdVec,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("lost follower (n uppers)", uppers = upper_ids.len()).entered();

        // STEP 1: inner edges
        self.remove_inner_edges(ctx, lost_follower_id, &mut upper_ids);

        // STEP 2 and 3: follower edges or debt
        for upper_id in upper_ids {
            self.remove_follower_edges(ctx, upper_id, Some(lost_follower_id));
        }
    }

    /// Removes one edge between `upper_id` and each of `lost_follower_ids`.
    ///
    /// See the module docs for the removal steps and how debt is handled.
    fn inner_of_upper_lost_followers(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        mut lost_follower_ids: TaskIdVec,
        upper_id: TaskId,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!(
            "lost follower (n follower)",
            followers = lost_follower_ids.len()
        )
        .entered();

        // STEP 1: inner edges
        swap_retain(&mut lost_follower_ids, |&mut lost_follower_id| {
            let mut upper_ids = Some(upper_id);
            self.remove_inner_edges(ctx, lost_follower_id, &mut upper_ids);
            // keep the followers that have no inner edge to `upper_id`
            upper_ids.is_some()
        });

        // STEP 2 and 3: follower edges or debt
        if !lost_follower_ids.is_empty() {
            self.remove_follower_edges(ctx, upper_id, lost_follower_ids);
        }
    }

    /// Removal step 1: decrements the inner edge `F.upper[U]` for each `U` in `upper_ids` that has
    /// one. Those uppers are removed from `upper_ids`, the remaining ones have no inner edge and
    /// continue with the follower side ([`Self::remove_follower_edges`]).
    ///
    /// Locks only the follower task.
    fn remove_inner_edges<L: TaskIdList>(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        follower_id: TaskId,
        upper_ids: &mut L,
    ) {
        let mut follower = ctx.task(
            follower_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );
        self.check_optimization_pending(&follower);

        // Inner edges are never negative, so a missing entry means "no inner edge".
        let mut removed_uppers = L::default();
        upper_ids.retain(|upper_id| {
            let mut is_inner = false;
            follower.update_upper(upper_id, |old| {
                let old = old?;
                is_inner = true;
                if old == 1 {
                    removed_uppers.push(upper_id);
                    return None;
                }
                Some(old - 1)
            });
            !is_inner
        });

        if removed_uppers.is_empty() {
            return;
        }
        self.on_inner_edges_disappeared(ctx, follower, removed_uppers);
    }

    /// Propagates that the inner edges between `removed_upper_ids` and the locked `follower` were
    /// removed: removes the follower's data from the uppers and the followers of the follower from
    /// the uppers.
    ///
    /// Takes the lock of the follower and releases it before locking the uppers.
    fn on_inner_edges_disappeared<L: TaskIdList>(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        mut follower: TaskGuard<'_>,
        removed_upper_ids: L,
    ) {
        let data = AggregatedDataUpdate::from_task(&mut follower);
        let followers = get_followers(&follower);
        // if uppers became empty, it might be collectible, check now.
        if follower.is_upper_empty() {
            ctx.note_maybe_collectible(&follower);
        }
        drop(follower);
        // Outside of the lock
        let data = data.optimize().invert();

        if !data.is_empty() {
            // remove data from uppers
            let remove_data =
                |queue: &mut Self, mut upper: TaskGuard<'_>, ctx: &ExecuteContext<'_>| {
                    let diff = data.apply(&mut upper, ctx.should_track_activeness(), queue);
                    if !diff.is_empty() {
                        let upper_ids = get_uppers(&upper);
                        queue.push(
                            AggregatedDataUpdateJob {
                                upper_ids,
                                update: diff,
                            }
                            .into(),
                        )
                    }
                };
            if let Some(upper_id) = removed_upper_ids.single() {
                // For performance reasons this should stay `Meta` and not `All`
                let upper = ctx.task(upper_id, AGGREGATION_UPDATE_CATEGORY);
                self.check_optimization_pending(&upper);
                remove_data(self, upper, ctx);
            } else {
                // For performance reasons this should stay `Meta` and not `All`
                ctx.for_each_task_meta(
                    removed_upper_ids.iter_ids(),
                    "remove data from uppers",
                    |upper, ctx| {
                        self.check_optimization_pending(&upper);
                        remove_data(self, upper, ctx)
                    },
                );
            }
        }
        if !followers.is_empty() {
            if let Some(upper_id) = removed_upper_ids.single() {
                self.push(AggregationUpdateJob::InnerOfUpperLostFollowers {
                    upper_id,
                    lost_follower_ids: followers,
                });
            } else {
                self.push(
                    InnerOfUppersLostFollowersJob {
                        upper_ids: removed_upper_ids.into_vec(),
                        lost_follower_ids: followers,
                    }
                    .into(),
                );
            }
        }
    }

    /// Removal steps 2 and 3: decrements `U.followers[F]` for each of `lost_follower_ids`. These
    /// have no inner edge to `upper_id` (step 1 found none).
    ///
    /// When the decrement leaves debt, the addition of the edge has not been processed yet. If it
    /// concurrently added an inner edge in the meantime, a `BalanceEdge` nets both (see module
    /// docs).
    ///
    /// Locks the upper task, and afterwards the followers that were left with debt.
    fn remove_follower_edges<L: TaskIdList>(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        upper_id: TaskId,
        lost_follower_ids: L,
    ) {
        let mut upper = ctx.task(
            upper_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );

        // STEP 2
        let mut removed_followers = L::default();
        let mut followers_with_debt = L::default();
        for lost_follower_id in lost_follower_ids {
            let change = update_follower_count(&mut upper, lost_follower_id, -1);
            if change.transition() == EdgeTransition::Disappeared {
                removed_followers.push(lost_follower_id);
            }
            if change.is_debt() {
                followers_with_debt.push(lost_follower_id);
            }
        }

        let effects = if !removed_followers.is_empty() {
            // May optimize the task
            let followers_len = upper.followers_len();
            if (followers_len + removed_followers.len()).next_power_of_two()
                != followers_len.next_power_of_two()
            {
                self.push_optimize_task(&mut upper);
            }
            if upper.is_followers_empty() {
                ctx.note_maybe_collectible(&upper);
            }
            Some(FollowerEdgeEffects::capture(ctx, &upper))
        } else {
            None
        };
        drop(upper);

        if let Some(effects) = effects {
            effects.push_lost_followers(self, removed_followers.into_vec());
        }

        // STEP 3
        for follower_id in followers_with_debt {
            self.balance_if_inner_edge(ctx, upper_id, follower_id);
        }
    }

    /// Pushes a `BalanceEdge` when `U.followers[F]` is debt. Called under the lock of `upper`
    /// after adding the inner edge `F.upper[U]`, so that `balance_edge` nets both (see module
    /// docs).
    fn balance_if_follower_debt(&mut self, upper: &TaskGuard<'_>, follower_id: TaskId) {
        if has_follower_debt(upper, follower_id) {
            self.push(AggregationUpdateJob::BalanceEdge {
                upper_id: upper.id(),
                task_id: follower_id,
            });
        }
    }

    /// Addition steps 3a and 3b: adds `count` to `U.followers[F]` under the lock of `upper`.
    ///
    /// Returns the change. When the edge appeared, the caller propagates it (steps 3c to 3f). When
    /// the addition only paid debt, the upper might have become collectible.
    fn add_follower_edge(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        upper: &mut TaskGuard<'_>,
        follower_id: TaskId,
        count: u32,
        operation: &str,
    ) -> FollowerCountChange {
        // STEP 3a
        upper.assert_not_deleted(operation);
        let change = update_follower_count(
            upper,
            follower_id,
            follower_delta(upper.id(), follower_id, count),
        );
        match change.transition() {
            EdgeTransition::Appeared => {
                // STEP 3b
                // May optimize the task
                if upper.followers_len().is_power_of_two() {
                    self.push_optimize_task(upper);
                }
            }
            EdgeTransition::Unchanged | EdgeTransition::Disappeared => {
                debug_assert_ne!(change.transition(), EdgeTransition::Disappeared);
                // The addition only paid debt, or the edge already existed.
                if change.new == 0 && upper.is_followers_empty() {
                    ctx.note_maybe_collectible(upper);
                }
            }
        }
        change
    }

    /// Addition steps 6c to 6f: propagates that the inner edges between `added_upper_ids` and the
    /// locked `follower` were added. Mirrors [`Self::on_inner_edges_disappeared`]: adds the
    /// follower's data to the uppers and the followers of the follower to the uppers.
    ///
    /// Releases the lock of the follower before locking the uppers. Each upper is locked even when
    /// there is no data to add: that lock is the read of the follower side after writing the inner
    /// edge (see module docs).
    ///
    /// `is_active` is whether an upper was seen active before. Returns it updated by checking the
    /// uppers again; the caller schedules the follower when it is `true` (step 6g).
    ///
    /// A single-edge list (`Option<TaskId>`) takes the code paths and jobs for one upper, a
    /// `TaskIdVec` those for several uppers (see [`TaskIdList::single_edge`]).
    fn on_inner_edges_appeared<L: TaskIdList>(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        mut follower: TaskGuard<'_>,
        added_upper_ids: L,
        mut is_active: bool,
    ) -> bool {
        let follower_id = follower.id();
        // STEP 6c
        let data = AggregatedDataUpdate::from_task(&mut follower);
        let followers = get_followers(&follower);
        drop(follower);
        // Outside of the lock
        let data = data.optimize();

        // STEP 6d and 6f
        let add_to_upper = |queue: &mut Self,
                            mut upper: TaskGuard<'_>,
                            ctx: &ExecuteContext<'_>,
                            is_active: &mut bool| {
            queue.check_optimization_pending(&upper);
            queue.balance_if_follower_debt(&upper, follower_id);
            // STEP 6d
            if !data.is_empty() {
                let diff = data.apply(&mut upper, ctx.should_track_activeness(), queue);
                if !diff.is_empty() {
                    let upper_ids = get_uppers(&upper);
                    queue.push(
                        AggregatedDataUpdateJob {
                            upper_ids,
                            update: diff,
                        }
                        .into(),
                    );
                }
            }
            // STEP 6f
            // We need to check this again, since this might have changed in the meantime due to
            // race conditions
            if ctx.should_track_activeness() && !*is_active && upper.has_activeness() {
                *is_active = true;
            }
        };
        if let Some(upper_id) = added_upper_ids.single_edge() {
            // For performance reasons this should stay `Meta` and not `All`
            let upper = ctx.task(upper_id, AGGREGATION_UPDATE_CATEGORY);
            add_to_upper(self, upper, ctx, &mut is_active);
        } else {
            // For performance reasons this should stay `Meta` and not `All`
            ctx.for_each_task_meta(
                added_upper_ids.iter_ids(),
                "add data to uppers",
                |upper, ctx| add_to_upper(self, upper, ctx, &mut is_active),
            );
        }

        // STEP 6e
        if !followers.is_empty() {
            if let Some(upper_id) = added_upper_ids.single_edge() {
                self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                    upper_id,
                    new_follower_ids: followers,
                });
            } else {
                self.push(
                    InnerOfUppersHasNewFollowersJob {
                        upper_ids: added_upper_ids.into_vec(),
                        new_follower_ids: followers,
                    }
                    .into(),
                );
            }
        }
        is_active
    }

    /// Addition steps 6d and 6f of the handler for several followers: locks the upper once for all
    /// `inner_task_ids` whose inner edge to `upper_id` was added, adds their data (`data_updates`)
    /// and checks for debt of each of them. Like [`Self::on_inner_edges_appeared`], this lock is
    /// also the read of the follower side after writing the inner edges (see module docs).
    ///
    /// `is_active` is whether the upper was seen active before. Returns it updated; the caller
    /// schedules the inner tasks when it is `true` (step 6g).
    fn on_inner_edges_appeared_on_upper(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        upper_id: TaskId,
        inner_task_ids: &[TaskId],
        data_updates: Vec<AggregatedDataUpdate>,
        mut is_active: bool,
    ) -> bool {
        let mut upper = ctx.task(
            upper_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );
        for &inner_task_id in inner_task_ids {
            self.balance_if_follower_debt(&upper, inner_task_id);
        }
        // add data to upper
        let diffs = data_updates
            .into_iter()
            .filter_map(|data| {
                let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                (!diff.is_empty()).then_some(diff)
            })
            .collect::<Vec<_>>();
        if ctx.should_track_activeness() && !is_active {
            // We need to check this again, since this might have changed in the meantime due to
            // race conditions
            is_active = upper.has_activeness();
        }
        let upper_ids = if diffs.is_empty() {
            TaskIdVec::new()
        } else {
            get_uppers(&upper)
        };
        drop(upper);
        if !upper_ids.is_empty() {
            // TODO merge AggregatedDataUpdate
            for diff in diffs {
                self.push(
                    AggregatedDataUpdateJob {
                        upper_ids: upper_ids.clone(),
                        update: diff,
                    }
                    .into(),
                );
            }
        }
        is_active
    }

    /// Pushes a `BalanceEdge` when there is an inner edge `F.upper[U]`. Called after creating debt
    /// in `U.followers[F]`, so that `balance_edge` nets both.
    ///
    /// Locks only the follower task.
    fn balance_if_inner_edge(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        upper_id: TaskId,
        follower_id: TaskId,
    ) {
        let follower = ctx.task(
            follower_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );
        let has_inner_edge = follower.get_upper(&upper_id).is_some();
        drop(follower);
        if has_inner_edge {
            self.push(AggregationUpdateJob::BalanceEdge {
                upper_id,
                task_id: follower_id,
            });
        }
    }

    /// Batched version of `inner_of_upper_has_new_follower`.
    /// See detailed comments in that function, follow the STEP numbers.
    fn inner_of_uppers_has_new_follower<T: TaskIdWithOptionalCount + Clone, const N: usize>(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        new_follower_id: TaskId,
        mut upper_ids: SmallVec<[T; N]>,
    ) {
        if cfg!(feature = "aggregation_update_no_batch") {
            for upper_item in upper_ids {
                let (upper_id, count) = upper_item.task_id_and_count();
                self.inner_of_upper_has_new_follower(ctx, new_follower_id, upper_id, count);
            }
            return;
        }

        #[cfg(feature = "trace_aggregation_update")]
        let _span =
            trace_span!("process new follower (n uppers)", uppers = upper_ids.len()).entered();

        // STEP 1
        let mut min_follower_aggregation_number = {
            let follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                AGGREGATION_UPDATE_CATEGORY,
            );
            get_aggregation_number(&follower)
        };

        let mut upper_upper_ids_with_new_follower = FxHashMap::default();
        let mut tasks_for_which_increment_active_count = SmallVec::new();
        let mut is_active = false;
        loop {
            let mut upper_ids_with_min_aggregation_number = Vec::new();
            for upper_item in upper_ids.drain(..) {
                let (upper_id, count) = upper_item.task_id_and_count();
                // STEP 2
                let mut upper = ctx.task(
                    upper_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    AGGREGATION_UPDATE_CATEGORY,
                );
                self.check_optimization_pending(&upper);
                // decide if it should be an inner or follower
                let upper_aggregation_number = get_aggregation_number(&upper);

                // STEP 3
                let write_side =
                    edge_write_side(upper_aggregation_number, min_follower_aggregation_number);
                if follower_add_side(&upper, write_side, new_follower_id) == EdgeSide::Follower {
                    // STEP 3a and 3b
                    // It's a follower of the upper node
                    let change = self.add_follower_edge(
                        ctx,
                        &mut upper,
                        new_follower_id,
                        count,
                        "inner_of_uppers_has_new_follower add follower",
                    );
                    let appeared = change.transition() == EdgeTransition::Appeared;
                    if appeared {
                        // STEP 3c
                        if ctx.should_track_activeness() {
                            // update active count
                            let has_active_count =
                                upper.get_activeness().is_some_and(|a| a.active_counter > 0);

                            // STEP 3d
                            if has_active_count {
                                tasks_for_which_increment_active_count.push(new_follower_id);
                            }
                        }

                        // STEP 3e
                        // notify uppers about new follower
                        for (&upper_id, _) in upper.iter_upper() {
                            *upper_upper_ids_with_new_follower
                                .entry(upper_id)
                                .or_insert(0) += 1;
                        }
                    }
                    drop(upper);

                    // STEP 3f
                    // Balancing is only needed when they are equal or when the edge was only
                    // placed on the follower side to pay debt. Follower's aggregation number can
                    // increase concurrently, but that only makes the balancing obsolete, not
                    // incorrect.
                    if (appeared && write_side == EdgeSide::Inner)
                        || upper_aggregation_number == min_follower_aggregation_number
                    {
                        self.push(AggregationUpdateJob::BalanceEdge {
                            upper_id,
                            task_id: new_follower_id,
                        });
                    }
                } else {
                    // STEP 4
                    // It's an inner node, continue with the list
                    if ctx.should_track_activeness() && upper.has_activeness() {
                        is_active = true;
                    }
                    drop(upper);

                    upper_ids_with_min_aggregation_number
                        .push((upper_item, upper_aggregation_number));
                }
            }

            if upper_ids_with_min_aggregation_number.is_empty() {
                break;
            }

            #[cfg(test)]
            self.before_inner_write_for_testing(ctx);
            // STEP 5
            let mut new_follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                AGGREGATION_UPDATE_CATEGORY,
            );
            let follower_aggregation_number = get_aggregation_number(&new_follower);

            // STEP 6
            swap_retain(
                &mut upper_ids_with_min_aggregation_number,
                |(upper_item, min_upper_aggregation_number)| {
                    if edge_write_side(*min_upper_aggregation_number, follower_aggregation_number)
                        == EdgeSide::Follower
                    {
                        // Should be a follower.
                        upper_ids.push(upper_item.clone());
                        return false;
                    }
                    // STEP 6a
                    // Keeps the new uppers. Steps 6b ff are processed further down.
                    let (upper_id, count) = upper_item.task_id_and_count();
                    add_inner_edge(
                        &mut new_follower,
                        upper_id,
                        count,
                        "inner_of_uppers_has_new_follower add upper",
                    )
                },
            );
            let added_upper_ids: TaskIdVec = upper_ids_with_min_aggregation_number
                .iter()
                .map(|(upper_item, _)| upper_item.task_id_and_count().0)
                .collect();
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new inner").entered();
            if !added_upper_ids.is_empty() {
                // STEP 6b
                let new_count = new_follower.upper_len();
                if (new_count - added_upper_ids.len()).next_power_of_two()
                    != new_count.next_power_of_two()
                {
                    self.push_optimize_task(&mut new_follower);
                }

                // STEP 6c to 6f
                is_active =
                    self.on_inner_edges_appeared(ctx, new_follower, added_upper_ids, is_active);
            } else {
                drop(new_follower);
            }

            if upper_ids.is_empty() {
                break;
            }
            min_follower_aggregation_number = follower_aggregation_number;
        }
        // STEP 6g
        if is_active {
            self.push_find_and_schedule_dirty(new_follower_id);
        }
        // STEP 3d
        if !tasks_for_which_increment_active_count.is_empty() {
            self.push(AggregationUpdateJob::IncreaseActiveCounts {
                task_ids: tasks_for_which_increment_active_count,
            });
        }
        // STEP 3e
        if !upper_upper_ids_with_new_follower.is_empty() {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new follower").entered();
            self.push(AggregationUpdateJob::InnerOfUppersHasNewFollowerWithCount {
                upper_ids: upper_upper_ids_with_new_follower.into_iter().collect(),
                new_follower_id,
            });
        }
    }

    /// Batched version of `inner_of_upper_has_new_follower`.
    /// See detailed comments in that function, follow the STEP numbers.
    fn inner_of_upper_has_new_followers<T: TaskIdWithOptionalCount, const N: usize>(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        new_follower_ids: SmallVec<[T; N]>,
        upper_id: TaskId,
    ) {
        if cfg!(feature = "aggregation_update_no_batch") {
            for new_follower_item in new_follower_ids {
                let (new_follower_id, count) = new_follower_item.task_id_and_count();
                self.inner_of_upper_has_new_follower(ctx, new_follower_id, upper_id, count);
            }
            return;
        }

        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!(
            "process new follower (n followers)",
            followers = new_follower_ids.len()
        )
        .entered();

        // STEP 1
        let mut followers_with_min_aggregation_number = new_follower_ids
            .into_iter()
            .map(|new_follower_entry| {
                let (new_follower_id, count) = new_follower_entry.task_id_and_count();
                let follower = ctx.task(
                    new_follower_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    AGGREGATION_UPDATE_CATEGORY,
                );
                (new_follower_id, count, get_aggregation_number(&follower))
            })
            .collect::<SmallVec<[_; 4]>>();

        let mut is_active = false;
        let mut upper_data_updates = Vec::new();
        let mut upper_new_followers = FxHashMap::default();
        let mut inner_tasks = Vec::new();
        loop {
            let mut new_followers_of_upper_uppers = TaskIdVec::new();
            let mut follower_edge_effects = None;
            let upper_aggregation_number;
            {
                // STEP 2
                let mut upper = ctx.task(
                    upper_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    AGGREGATION_UPDATE_CATEGORY,
                );
                self.check_optimization_pending(&upper);

                // decide if it should be an inner or follower
                upper_aggregation_number = get_aggregation_number(&upper);

                // STEP 3
                followers_with_min_aggregation_number.retain(
                    |(follower_id, count, follower_aggregation_number)| {
                        let write_side =
                            edge_write_side(upper_aggregation_number, *follower_aggregation_number);
                        if follower_add_side(&upper, write_side, *follower_id) == EdgeSide::Inner {
                            // It's an inner node, continue with the list
                            return true;
                        }

                        // STEP 3a and 3b
                        // It's a follower of the upper node
                        let change = self.add_follower_edge(
                            ctx,
                            &mut upper,
                            *follower_id,
                            *count,
                            "inner_of_upper_has_new_followers add follower",
                        );
                        if change.transition() == EdgeTransition::Appeared {
                            // STEP 3d and 3e are enqueued with this vec
                            new_followers_of_upper_uppers.push(*follower_id);

                            // STEP 3f
                            if write_side == EdgeSide::Inner
                                || upper_aggregation_number == *follower_aggregation_number
                            {
                                // Balancing is only needed when they are equal or when the edge
                                // was only placed on the follower side to pay debt. This is not
                                // perfect from concurrent perspective, but we can accept a few
                                // incorrect invariants in the graph.
                                self.push(AggregationUpdateJob::BalanceEdge {
                                    upper_id,
                                    task_id: *follower_id,
                                })
                            }
                        }
                        false
                    },
                );

                if !new_followers_of_upper_uppers.is_empty() {
                    // STEP 3c
                    follower_edge_effects = Some(FollowerEdgeEffects::capture(ctx, &upper));
                }

                // STEP 4
                if ctx.should_track_activeness() && upper.has_activeness() {
                    is_active = true;
                }
            }
            let min_upper_aggregation_number = upper_aggregation_number;

            if let Some(effects) = follower_edge_effects {
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("new follower").entered();

                // STEP 3d and 3e
                // update active count and notify uppers about new followers
                effects.push_new_followers_batched(self, new_followers_of_upper_uppers);
            }

            if followers_with_min_aggregation_number.is_empty() {
                break;
            }

            #[cfg(test)]
            self.before_inner_write_for_testing(ctx);
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new inner").entered();
            swap_retain(
                &mut followers_with_min_aggregation_number,
                |&mut (new_follower_id, count, ref mut min_follower_aggregation_number)| {
                    // STEP 5
                    let mut new_follower = ctx.task(
                        new_follower_id,
                        // For performance reasons this should stay `Meta` and not `All`
                        AGGREGATION_UPDATE_CATEGORY,
                    );
                    let follower_aggregation_number = get_aggregation_number(&new_follower);

                    // STEP 6
                    if edge_write_side(min_upper_aggregation_number, follower_aggregation_number)
                        == EdgeSide::Follower
                    {
                        // It should be a follower
                        *min_follower_aggregation_number = follower_aggregation_number;
                        return true;
                    }

                    // STEP 6a
                    if add_inner_edge(
                        &mut new_follower,
                        upper_id,
                        count,
                        "inner_of_upper_has_new_followers add upper",
                    ) {
                        // STEP 6b
                        if new_follower.upper_len().is_power_of_two() {
                            self.push_optimize_task(&mut new_follower);
                        }

                        // STEP 6c
                        // It's a new upper
                        let data = AggregatedDataUpdate::from_task(&mut new_follower);
                        let children = get_followers(&new_follower);
                        drop(new_follower);
                        // Outside of the lock
                        let data = data.optimize();

                        // STEP 6d
                        if !data.is_empty() {
                            upper_data_updates.push(data);
                        }
                        // STEP 6e
                        for &child_id in &children {
                            *upper_new_followers.entry(child_id).or_insert(0) += 1;
                        }

                        // STEP 6f and 6g are enqueued with this vec
                        inner_tasks.push(new_follower_id);
                    }
                    false
                },
            );

            if followers_with_min_aggregation_number.is_empty() {
                break;
            }
        }
        if !upper_new_followers.is_empty() {
            // STEP 6e
            self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowersWithCount {
                upper_id,
                new_follower_ids: upper_new_followers.into_iter().collect(),
            });
        }
        if !inner_tasks.is_empty() {
            // STEP 6d and 6f
            let is_active = self.on_inner_edges_appeared_on_upper(
                ctx,
                upper_id,
                &inner_tasks,
                upper_data_updates,
                is_active,
            );
            // STEP 6g
            if is_active {
                self.extend_find_and_schedule_dirty(inner_tasks);
            }
        }
    }

    fn inner_of_upper_has_new_follower(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        new_follower_id: TaskId,
        upper_id: TaskId,
        count: u32,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("process new follower").entered();

        // STEP 1
        // We do a one-off read of the follower to get the aggregation number.
        // Since we don't keep the lock, it might increase concurrently, so we can only assume that
        // this is the minimum aggregation number for this follower.
        let mut min_follower_aggregation_number = {
            let follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                AGGREGATION_UPDATE_CATEGORY,
            );
            get_aggregation_number(&follower)
        };

        // We only want to lock one task at a time, so we can only ensure a minimum follower
        // aggregation number + an exact upper aggregation number, or an exact follower aggregation
        // number + a minimum upper aggregation number. We want to decide based on
        // `upper_aggregation_number <= follower_aggregation_number`. To be sure we need to lock the
        // right one, but when we tried the incorrect one, the values might change concurrently.
        // To solve this, we need to try in a loop until we lock the right one and can guarantee the
        // correct relationship between the values.
        loop {
            // STEP 2
            let mut upper = ctx.task(
                upper_id,
                // For performance reasons this should stay `Meta` and not `All`
                AGGREGATION_UPDATE_CATEGORY,
            );
            self.check_optimization_pending(&upper);
            // decide if it should be an inner or follower
            let upper_aggregation_number = get_aggregation_number(&upper);

            // STEP 3
            let write_side =
                edge_write_side(upper_aggregation_number, min_follower_aggregation_number);
            if follower_add_side(&upper, write_side, new_follower_id) == EdgeSide::Follower {
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("new follower").entered();

                // STEP 3a and 3b
                // It's a follower of the upper node
                let change = self.add_follower_edge(
                    ctx,
                    &mut upper,
                    new_follower_id,
                    count,
                    "inner_of_upper_has_new_follower add follower",
                );
                if change.transition() == EdgeTransition::Appeared {
                    // STEP 3c
                    let effects = FollowerEdgeEffects::capture(ctx, &upper);
                    drop(upper);

                    // STEP 3d and 3e
                    // update active count and notify uppers about new follower
                    effects.push_new_followers(self, smallvec![new_follower_id]);

                    // STEP 3f
                    // Balancing is only needed when they are equal or when the edge was only
                    // placed on the follower side to pay debt. Follower's aggregation number
                    // can increase concurrently, but that only makes the balancing obsolete,
                    // not incorrect.
                    if write_side == EdgeSide::Inner
                        || upper_aggregation_number == min_follower_aggregation_number
                    {
                        self.push(AggregationUpdateJob::BalanceEdge {
                            upper_id,
                            task_id: new_follower_id,
                        });
                    }
                }
                return;
            }

            // STEP 4
            // It's an inner node, continue with the list
            let is_active = ctx.should_track_activeness() && upper.has_activeness();
            drop(upper);
            let min_upper_aggregation_number = upper_aggregation_number;

            #[cfg(test)]
            self.before_inner_write_for_testing(ctx);
            // STEP 5
            let mut new_follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                AGGREGATION_UPDATE_CATEGORY,
            );
            let follower_aggregation_number = get_aggregation_number(&new_follower);

            // STEP 6
            if edge_write_side(min_upper_aggregation_number, follower_aggregation_number)
                == EdgeSide::Inner
            {
                #[cfg(feature = "trace_aggregation_update")]
                let _span = trace_span!("new inner").entered();

                // STEP 6a
                if add_inner_edge(
                    &mut new_follower,
                    upper_id,
                    count,
                    "inner_of_upper_has_new_follower add upper",
                ) {
                    // STEP 6b
                    if new_follower.upper_len().is_power_of_two() {
                        self.push_optimize_task(&mut new_follower);
                    }

                    // STEP 6c to 6f
                    let is_active =
                        self.on_inner_edges_appeared(ctx, new_follower, Some(upper_id), is_active);

                    // STEP 6g
                    if is_active {
                        self.push_find_and_schedule_dirty(new_follower_id);
                    }
                }
                return;
            }
            drop(new_follower);
            min_follower_aggregation_number = follower_aggregation_number;
        }
    }

    /// Decreases the active count of a task.
    ///
    /// Only used when activeness is tracked.
    fn decrease_active_count(&mut self, ctx: &mut ExecuteContext<'_>, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("decrease active count").entered();

        let mut task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );
        self.check_optimization_pending(&task);
        let state = task.get_activeness_mut_or_insert_with(|| ActivenessState::new(task_id));
        let is_new = state.is_empty();
        let is_zero = state.decrement_active_counter();
        let is_empty = state.is_empty();
        if is_empty {
            task.take_activeness();
        }
        debug_assert!(
            !(is_new && is_zero),
            // This allows us to but the `if is_zero` block in the else branch of the `if is_new`
            // block below for fewer checks and less problems with the borrow checker.
            "A new Activeness will never be zero after decrementing"
        );
        if is_new {
            // A task is considered "active" purely by the existence of an `Activeness` item, even
            // if that item has an negative active counter. So we need to make sure to
            // schedule it here. That case is pretty rare and only happens under extreme race
            // conditions.
            self.find_and_schedule_dirty_internal(task_id, task, ctx);
        } else if is_zero {
            let followers = get_followers(&task);
            drop(task);
            if !followers.is_empty() {
                self.push(AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: followers,
                });
            }
        } else {
            drop(task);
        }
    }

    /// Increases the active count of a task.
    ///
    /// Only used when activeness is tracked.
    fn increase_active_count(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        task_id: TaskId,
        release_construction_ref: bool,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("increase active count").entered();

        let task = ctx.task(
            task_id,
            // For performance reasons this should stay Meta and not All.
            // persistent_task_type is now set eagerly in initialize_new_task.
            AGGREGATION_UPDATE_CATEGORY,
        );
        // Revive the task if GC soft-deleted it.
        let mut task = resurrect_deleted(task, task_id, self, ctx);
        let state = task.get_activeness_mut_or_insert_with(|| ActivenessState::new(task_id));
        let is_new = state.is_empty();
        let is_positive_now = state.increment_active_counter();
        let is_empty = state.is_empty();
        if release_construction_ref {
            task.update_and_get_transient_ref_count(-1);
        }
        // This can happen if active count was negative before
        if is_empty {
            task.take_activeness();
        }
        debug_assert!(
            !is_new || is_positive_now,
            // This allows us to nest the `if is_new` block below `if is_positive_now` for fewer
            // checks.
            "A new Activeness will always be positive after incrementing"
        );
        if is_positive_now {
            let followers = get_followers(&task);
            if is_new {
                // Fast path to schedule
                self.find_and_schedule_dirty_internal(task_id, task, ctx);
            } else {
                drop(task);
            }

            if !followers.is_empty() {
                self.push(AggregationUpdateJob::IncreaseActiveCounts {
                    task_ids: followers,
                });
            }
        }
    }

    fn update_aggregation_number(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        task_id: TaskId,
        base_effective_distance: Option<std::num::NonZero<u32>>,
        base_aggregation_number: u32,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span =
            trace_span!("check update aggregation number", base_aggregation_number).entered();

        let mut task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            AGGREGATION_UPDATE_CATEGORY,
        );
        // Skip deleted tasks, which can be encountered while processing GC's deferred cleanup.
        // This just means there is no point in rebalancing the subgraph here since this 'root' is
        // dead.
        if task.deleted() {
            return;
        }
        self.check_optimization_pending(&task);
        let current = task.get_aggregation_number().copied().unwrap_or_default();
        let old = current.effective;
        // The base aggregation number can only increase
        let mut base_aggregation_number = max(current.base, base_aggregation_number);
        let distance = base_effective_distance.map_or(current.distance, |d| d.get());
        // The wanted new distance is either the provided one or the old distance
        let aggregation_number = if is_aggregating_node(base_aggregation_number) {
            base_aggregation_number.saturating_add(distance)
        } else {
            // The new target effective aggregation number is base + distance
            let aggregation_number = base_aggregation_number.saturating_add(distance);
            if is_aggregating_node(aggregation_number) {
                base_aggregation_number = LEAF_NUMBER;
                LEAF_NUMBER.saturating_add(distance)
            } else {
                aggregation_number
            }
        };
        if old >= aggregation_number {
            if base_aggregation_number != current.base && distance != current.distance {
                task.set_aggregation_number(AggregationNumber {
                    base: base_aggregation_number,
                    distance,
                    effective: old,
                });
            }
        } else {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!(
                "update aggregation number",
                task = task.get_task_description(),
                old,
                aggregation_number
            )
            .entered();
            task.set_aggregation_number(AggregationNumber {
                base: base_aggregation_number,
                distance,
                effective: aggregation_number,
            });

            if !is_aggregating_node(old) && is_aggregating_node(aggregation_number) {
                // When converted from leaf to aggregating node, all children become
                // followers. A leaf is never an upper, so it has no follower edges (or debt)
                // yet. The children were already followers of the uppers, so the new edges
                // don't need to be propagated.
                let children: Vec<_> = task.iter_children().collect();
                for child_id in children {
                    let change = update_follower_count(&mut task, child_id, 1);
                    debug_assert_eq!(change.old, 0, "a leaf task has no follower edges");
                }
            }

            if is_aggregating_node(aggregation_number) {
                // followers might become inner nodes when the aggregation number is
                // increased. Debt doesn't need balancing, it stays on the follower side.
                for follower_id in iter_positive_followers(&task) {
                    self.push(AggregationUpdateJob::BalanceEdge {
                        upper_id: task_id,
                        task_id: follower_id,
                    });
                }
                let uppers = task.iter_upper();
                for (&upper_id, _count) in uppers {
                    self.push(AggregationUpdateJob::BalanceEdge { upper_id, task_id });
                }
            } else {
                for child_id in task.iter_children() {
                    self.push(AggregationUpdateJob::UpdateAggregationNumber {
                        task_id: child_id,
                        base_aggregation_number: aggregation_number + 1,
                        distance: None,
                    });
                }
            }
        }
    }

    /// Checks an task for optimization. Optimization ensures that the aggregation number is bigger
    /// than the number of upper edges. Increasing the aggregation reduces the number of upper
    /// edges, as it places the task in a bigger aggregation group. We want to avoid having too many
    /// upper edges as this amplifies the updates needed when changes to that task occur.
    ///
    /// `optimization_pending_flag_already_set` is the snapshot recorded on the `OptimizeJob`: when
    /// `true`, we also need to clear `optimization_pending` here (this is the only path that
    /// does so); when `false`, the flag is known to be unset already and we can skip the write.
    fn optimize_task(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
        task_id: TaskId,
        optimization_pending_flag_already_set: bool,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("check optimize").entered();

        let mut task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        if optimization_pending_flag_already_set {
            // Clear the pending flag — this is the only path that does so. We skip the
            // write when our snapshot says the flag wasn't set (push path / self-re-enqueue
            // path); the setter would just no-op in that case, but reading the snapshot is
            // free and lets us elide the write entirely.
            task.set_optimization_pending(false);
        }
        // A racing GC pass may have deleted this task, just return
        // still clear the `optimization_pending` flag just in case we get resurrected.
        if task.deleted() {
            return;
        }
        let aggregation_number = task.get_aggregation_number().copied().unwrap_or_default();
        if is_root_node(aggregation_number.effective) {
            return;
        }
        let follower_count = if is_aggregating_node(aggregation_number.effective) {
            let follower_count = task.followers_len();
            if follower_count == 0 {
                return;
            }
            follower_count
        } else {
            let children_count = task.children_len();
            if children_count == 0 {
                return;
            }
            children_count
        };
        let upper_count = task.upper_len();
        if upper_count <= 1
            || upper_count.saturating_sub(1) * follower_count
                <= max(
                    MAX_UPPERS_FOLLOWER_PRODUCT,
                    aggregation_number.effective as usize,
                )
        {
            // Doesn't need optimization
            return;
        }
        let uppers = get_uppers(&task);
        let follower = get_followers_with_aggregation_number(&task, aggregation_number.effective);
        drop(task);

        let mut root_uppers = 0;

        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
        enum Type {
            Upper,
            Follower,
        }
        let mut aggregation_numbers = uppers
            .iter()
            .map(|&id| (id, Type::Upper))
            .chain(follower.iter().map(|&id| (id, Type::Follower)))
            .filter_map(|(task_id, ty)| {
                if task_id.is_transient() {
                    return None;
                }
                let task = ctx.task(
                    task_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    TaskDataCategory::Meta,
                );
                let n = get_aggregation_number(&task);
                if is_root_node(n) {
                    root_uppers += 1;
                    None
                } else {
                    Some((n, ty))
                }
            })
            .collect::<Vec<_>>();
        aggregation_numbers.sort_unstable();

        let Some((mut new_aggregation_number, _)) = aggregation_numbers.first().copied() else {
            return;
        };
        let mut new_upper_count = upper_count;
        let mut new_follower_count = follower_count;

        // Find a new free spot for the aggregation number that doesn't conflict with any other
        for (n, ty) in aggregation_numbers {
            match n.cmp(&new_aggregation_number) {
                std::cmp::Ordering::Less => {}
                std::cmp::Ordering::Equal => new_aggregation_number += 1,
                std::cmp::Ordering::Greater => {
                    // This aggregation number would not conflict
                    // Is it within the limit?
                    let product = new_follower_count * new_upper_count.saturating_sub(1) * 2;
                    if new_follower_count == 0 || product <= new_aggregation_number as usize {
                        break;
                    } else if product < n as usize {
                        new_aggregation_number = product as u32;
                        break;
                    } else {
                        new_aggregation_number = n + 1;
                    }
                }
            }
            match ty {
                Type::Follower => new_follower_count -= 1,
                Type::Upper => new_upper_count -= 1,
            }
        }

        if aggregation_number.effective < new_aggregation_number {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!(
                "optimize",
                upper_count,
                old_aggregation_number = aggregation_number.effective,
                new_aggregation_number,
                upper_count,
                new_upper_count,
                follower_count,
                new_follower_count,
            )
            .entered();
            self.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id,
                base_aggregation_number: new_aggregation_number
                    .saturating_sub(aggregation_number.distance),
                distance: None,
            });
            // We want to make sure to optimize again after this change has been applied
            self.push_optimize_task_by_id(ctx, task_id);
        }
    }

    #[cfg(feature = "trace_aggregation_update_stats")]
    pub fn execute_with_stats(
        &mut self,
        ctx: &mut ExecuteContext<'_>,
    ) -> AggregationUpdateQueueStats {
        while !self.process(ctx) {}
        take(&mut self.stats)
    }
}

impl AggregationUpdateQueue {
    pub fn execute(&mut self, ctx: &mut ExecuteContext<'_>) {
        while !self.process(ctx) {}
    }
}

#[cfg(not(target_family = "wasm"))]
pub mod aggregation_queue;

trait TaskIdWithOptionalCount {
    fn task_id_and_count(&self) -> (TaskId, u32);
}

impl TaskIdWithOptionalCount for TaskId {
    fn task_id_and_count(&self) -> (TaskId, u32) {
        (*self, 1)
    }
}

impl TaskIdWithOptionalCount for (TaskId, u32) {
    fn task_id_and_count(&self) -> (TaskId, u32) {
        (self.0, self.1)
    }
}

/// A list of task ids for the edge steps of the aggregation update: a [`TaskIdVec`] for the
/// handlers of several edges, or an `Option<TaskId>` for the handlers of a single edge, which
/// avoids building a vector for one id.
///
/// The edge steps only collect ids from an input list of the same type, or of the same length
/// (e.g. the uppers whose inner edge appeared or disappeared), so an `Option` never has to hold
/// more than one id.
trait TaskIdList: Default + IntoIterator<Item = TaskId> {
    /// Adds an id. For `Option` the list must be empty.
    fn push(&mut self, task_id: TaskId);
    fn is_empty(&self) -> bool;
    fn len(&self) -> usize;
    /// Keeps only the ids for which `f` returns `true`. The order is not preserved.
    fn retain(&mut self, f: impl FnMut(TaskId) -> bool);
    /// Iterates the ids. Not named `iter`, which would shadow the slice method of `TaskIdVec`.
    fn iter_ids(&self) -> impl Iterator<Item = TaskId> + '_;
    /// The id when the list has exactly one, for the single-id fast paths.
    fn single(&self) -> Option<TaskId>;
    /// The id of a single-edge list (`Option<TaskId>`). Always `None` for a `TaskIdVec`, also when
    /// it holds one id, so that the handlers of several edges keep their batched code paths.
    fn single_edge(&self) -> Option<TaskId>;
    /// Converts into a [`TaskIdVec`], e.g. for a job payload.
    fn into_vec(self) -> TaskIdVec;
}

impl TaskIdList for TaskIdVec {
    fn push(&mut self, task_id: TaskId) {
        SmallVec::push(self, task_id);
    }

    fn is_empty(&self) -> bool {
        SmallVec::is_empty(self)
    }

    fn len(&self) -> usize {
        SmallVec::len(self)
    }

    fn retain(&mut self, mut f: impl FnMut(TaskId) -> bool) {
        swap_retain(self, |&mut task_id| f(task_id));
    }

    fn iter_ids(&self) -> impl Iterator<Item = TaskId> + '_ {
        self.as_slice().iter().copied()
    }

    fn single(&self) -> Option<TaskId> {
        if let [task_id] = self[..] {
            Some(task_id)
        } else {
            None
        }
    }

    fn single_edge(&self) -> Option<TaskId> {
        None
    }

    fn into_vec(self) -> TaskIdVec {
        self
    }
}

impl TaskIdList for Option<TaskId> {
    fn push(&mut self, task_id: TaskId) {
        debug_assert!(
            self.is_none(),
            "an Option<TaskId> list can only hold one task id"
        );
        *self = Some(task_id);
    }

    fn is_empty(&self) -> bool {
        self.is_none()
    }

    fn len(&self) -> usize {
        usize::from(self.is_some())
    }

    fn retain(&mut self, mut f: impl FnMut(TaskId) -> bool) {
        if let Some(task_id) = *self
            && !f(task_id)
        {
            *self = None;
        }
    }

    fn iter_ids(&self) -> impl Iterator<Item = TaskId> + '_ {
        Option::iter(self).copied()
    }

    fn single(&self) -> Option<TaskId> {
        *self
    }

    fn single_edge(&self) -> Option<TaskId> {
        *self
    }

    fn into_vec(self) -> TaskIdVec {
        self.into_iter().collect()
    }
}

/// The state of an upper task that is needed to propagate a change of its follower edges.
/// Captured under the lock of the upper task and pushed as jobs after the lock was released.
struct FollowerEdgeEffects {
    /// The upper task is active, so its followers have an increased active count.
    has_active_count: bool,
    /// The (positive) uppers of the upper task, which also follow the followers of the upper task.
    upper_ids: TaskIdVec,
}

impl FollowerEdgeEffects {
    fn capture(ctx: &ExecuteContext<'_>, upper: &TaskGuard<'_>) -> Self {
        Self {
            has_active_count: ctx.should_track_activeness()
                && upper.get_activeness().is_some_and(|a| a.active_counter > 0),
            upper_ids: get_uppers(upper),
        }
    }

    /// Propagates that the follower edges to `follower_ids` appeared.
    fn push_new_followers(self, queue: &mut AggregationUpdateQueue, follower_ids: TaskIdVec) {
        match follower_ids[..] {
            [] => {}
            [new_follower_id] => {
                if self.has_active_count {
                    queue.push(AggregationUpdateJob::IncreaseActiveCount {
                        task: new_follower_id,
                        release_construction_ref: false,
                    });
                }
                if !self.upper_ids.is_empty() {
                    queue.push(AggregationUpdateJob::InnerOfUppersHasNewFollower {
                        upper_ids: self.upper_ids,
                        new_follower_id,
                    });
                }
            }
            _ => self.push_new_followers_batched(queue, follower_ids),
        }
    }

    /// Like [`Self::push_new_followers`], but always pushes the jobs for several followers, also
    /// when `follower_ids` has only one. Used by the handler for several followers.
    fn push_new_followers_batched(
        self,
        queue: &mut AggregationUpdateQueue,
        follower_ids: TaskIdVec,
    ) {
        if follower_ids.is_empty() {
            return;
        }
        if self.upper_ids.is_empty() {
            // Only the active count needs `follower_ids`, so it doesn't need a clone.
            if self.has_active_count {
                queue.push(AggregationUpdateJob::IncreaseActiveCounts {
                    task_ids: follower_ids,
                });
            }
            return;
        }
        if self.has_active_count {
            queue.push(AggregationUpdateJob::IncreaseActiveCounts {
                task_ids: follower_ids.clone(),
            });
        }
        queue.push(
            InnerOfUppersHasNewFollowersJob {
                upper_ids: self.upper_ids,
                new_follower_ids: follower_ids,
            }
            .into(),
        );
    }

    /// Propagates that the follower edges to `follower_ids` disappeared.
    fn push_lost_followers(self, queue: &mut AggregationUpdateQueue, follower_ids: TaskIdVec) {
        match follower_ids[..] {
            [] => {}
            [lost_follower_id] => {
                if self.has_active_count {
                    queue.push(AggregationUpdateJob::DecreaseActiveCount {
                        task: lost_follower_id,
                    });
                }
                if !self.upper_ids.is_empty() {
                    queue.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                        upper_ids: self.upper_ids,
                        lost_follower_id,
                    });
                }
            }
            _ => {
                if self.upper_ids.is_empty() {
                    // Only the active count needs `follower_ids`, so it doesn't need a clone.
                    if self.has_active_count {
                        queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                            task_ids: follower_ids,
                        });
                    }
                    return;
                }
                if self.has_active_count {
                    queue.push(AggregationUpdateJob::DecreaseActiveCounts {
                        task_ids: follower_ids.clone(),
                    });
                }
                queue.push(
                    InnerOfUppersLostFollowersJob {
                        upper_ids: self.upper_ids,
                        lost_follower_ids: follower_ids,
                    }
                    .into(),
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use rustc_hash::{FxHashMap, FxHashSet};
    use smallvec::{SmallVec, smallvec};
    use turbo_tasks::{CellId, TaskId, TraitTypeId, ValueTypeId};

    use super::{AggregatedDataUpdate, sum_collectibles_update};
    use crate::data::{CellRef, CollectibleRef};

    /// Models the collectibles part of `AggregatedDataUpdate::apply`: applies `update` to the
    /// counts of an upper and returns the keys whose presence (count > 0) flipped, in order.
    fn apply(upper: &mut FxHashMap<u32, i32>, update: &[(u32, i32)]) -> Vec<u32> {
        let mut flips = Vec::new();
        for &(key, count) in update {
            let old = upper.get(&key).copied().unwrap_or(0);
            let new = old + count;
            if (old <= 0 && new > 0) || (old > 0 && new <= 0) {
                flips.push(key);
            }
            if new == 0 {
                upper.remove(&key);
            } else {
                upper.insert(key, new);
            }
        }
        flips
    }

    fn presence_changes(before: &FxHashMap<u32, i32>, after: &FxHashMap<u32, i32>) -> Vec<u32> {
        let mut keys: Vec<u32> = before
            .keys()
            .chain(after.keys())
            .copied()
            .collect::<FxHashSet<_>>()
            .into_iter()
            .filter(|k| {
                (before.get(k).copied().unwrap_or(0) > 0)
                    != (after.get(k).copied().unwrap_or(0) > 0)
            })
            .collect();
        keys.sort_unstable();
        keys
    }

    /// The update `from_task` builds: own entries, then `+1` per positive aggregated entry.
    fn from_task_update(own: &[(u32, i32)], aggregated_positive: &[u32]) -> Vec<(u32, i32)> {
        own.iter()
            .copied()
            .chain(aggregated_positive.iter().map(|&k| (k, 1)))
            .collect()
    }

    fn invert(update: &[(u32, i32)]) -> Vec<(u32, i32)> {
        update.iter().map(|&(k, c)| (k, -c)).collect()
    }

    /// The summed update as a map, so results can be compared independently of their order.
    fn as_map(update: &[(u32, i32)]) -> FxHashMap<u32, i32> {
        let mut map = FxHashMap::default();
        for &(key, count) in update {
            assert!(
                map.insert(key, count).is_none(),
                "duplicate key {key} in the summed update"
            );
        }
        map
    }

    /// Checks that `sum_collectibles_update` sums per key and drops zeros, and that the summed
    /// update and its inversion (`optimize()` then `invert()`) have the same effect on `start` as
    /// the unsummed ones: equal final counts, equal sets of keys whose presence changed, and every
    /// such key still flips.
    fn assert_equivalent(start: &FxHashMap<u32, i32>, update: &[(u32, i32)]) {
        let summed = sum_collectibles_update(SmallVec::from_slice(update));
        let mut expected = FxHashMap::default();
        for &(key, count) in update {
            *expected.entry(key).or_insert(0) += count;
        }
        expected.retain(|_, count| *count != 0);
        assert_eq!(as_map(&summed), expected);

        let mut old_upper = start.clone();
        apply(&mut old_upper, update);
        let mut new_upper = start.clone();
        let new_flips = apply(&mut new_upper, &summed);
        assert_eq!(old_upper, new_upper, "final counts differ");
        let changes = presence_changes(start, &new_upper);
        assert_eq!(presence_changes(start, &old_upper), changes);
        // Every key whose presence changed is still invalidated by the summed update.
        assert!(changes.iter().all(|k| new_flips.contains(k)));

        // Removing the task from the upper again (`invert()`) restores the start state.
        let after_add = new_upper.clone();
        apply(&mut old_upper, &invert(update));
        let new_flips_inv = apply(&mut new_upper, &invert(&summed));
        assert_eq!(old_upper, *start);
        assert_eq!(new_upper, *start);
        let changes_inv = presence_changes(&after_add, start);
        assert!(changes_inv.iter().all(|k| new_flips_inv.contains(k)));
    }

    #[test]
    fn optimize_sums_per_key_and_drops_zeros() {
        let update = [(1, -1), (2, 1), (1, 1), (3, 2), (2, -1), (3, 1)];
        let summed = sum_collectibles_update(SmallVec::from_slice(&update));
        assert_eq!(summed.as_slice(), [(3, 3)]);
    }

    #[test]
    fn optimize_mixed_signs_and_counts() {
        let update = [(1, -2), (1, 1), (1, 1), (2, 5), (2, -3), (4, -1)];
        let summed = sum_collectibles_update(SmallVec::from_slice(&update));
        assert_eq!(as_map(&summed), [(2, 2), (4, -1)].into_iter().collect());
    }

    #[test]
    fn optimize_empty_and_single_entry() {
        let empty = sum_collectibles_update(SmallVec::<[(u32, i32); 1]>::new());
        assert!(empty.is_empty());
        assert!(!empty.spilled());
        let single = sum_collectibles_update(smallvec![(7u32, 3)]);
        assert_eq!(single.as_slice(), [(7, 3)]);
        assert!(!single.spilled());
        assert!(sum_collectibles_update(smallvec![(7u32, 0)]).is_empty());
    }

    #[test]
    fn optimize_reuses_the_allocation() {
        let update: SmallVec<[(u32, i32); 1]> = smallvec![(1, 1), (2, 1), (1, 1), (3, -1)];
        assert!(update.spilled());
        let ptr = update.as_ptr();
        let summed = sum_collectibles_update(update);
        assert_eq!(summed.as_ptr(), ptr);
        assert_eq!(
            as_map(&summed),
            [(1, 2), (2, 1), (3, -1)].into_iter().collect()
        );
    }

    #[test]
    fn optimize_keeps_disjoint_keys() {
        let update: Vec<(u32, i32)> = (0..200).map(|k| (k, (k as i32 % 3) + 1)).collect();
        let summed = sum_collectibles_update(SmallVec::from_slice(&update));
        assert_eq!(as_map(&summed), as_map(&update));
    }

    #[test]
    fn optimize_drops_cancelled_collectibles() {
        // A task that dropped the collectibles of its subgraph: one negative own count for each
        // positive aggregated collectible, plus a few collectibles it didn't drop.
        let own: Vec<(u32, i32)> = (0..1000).map(|k| (k, -1)).collect();
        let aggregated: Vec<u32> = (0..1004).collect();
        let update = from_task_update(&own, &aggregated);
        assert_eq!(update.len(), 2004);

        let summed = sum_collectibles_update(SmallVec::from_slice(&update));
        assert_eq!(
            as_map(&summed),
            (1000..1004).map(|k| (k, 1)).collect::<FxHashMap<_, _>>()
        );
        assert_equivalent(&FxHashMap::default(), &update);
    }

    #[test]
    fn optimize_matches_unoptimized_update() {
        // Mixed-sign own counts; some keys only own, some only aggregated, some both.
        let own = [(1, -1), (2, -1), (3, -2), (4, 1), (5, 3), (9, -1)];
        let aggregated = [1, 2, 3, 6, 7];
        let update = from_task_update(&own, &aggregated);

        let empty = FxHashMap::default();
        assert_equivalent(&empty, &update);

        // A nonempty upper, including positive, larger and negative counts.
        let nonempty: FxHashMap<u32, i32> = [(1, 1), (3, 2), (4, -1), (6, -1), (8, 1), (9, 1)]
            .into_iter()
            .collect();
        assert_equivalent(&nonempty, &update);

        // Only own or only aggregated collectibles.
        assert_equivalent(&nonempty, &from_task_update(&own, &[]));
        assert_equivalent(&nonempty, &from_task_update(&[], &aggregated));
    }

    fn collectible(index: u32) -> CollectibleRef {
        CollectibleRef {
            collectible_type: TraitTypeId::new(1).unwrap(),
            cell: CellRef {
                task: TaskId::new(1).unwrap(),
                cell: CellId::new(ValueTypeId::new(1).unwrap(), index),
            },
        }
    }

    fn real_collectibles(update: &AggregatedDataUpdate) -> FxHashMap<CollectibleRef, i32> {
        update.collectibles_update.iter().copied().collect()
    }

    #[test]
    fn optimize_and_invert_real_update() {
        let task_id = TaskId::new(5).unwrap();
        let a = collectible(1);
        let b = collectible(2);
        let c = collectible(3);
        let update = AggregatedDataUpdate::new()
            .collectibles_update(smallvec![(a, -1), (b, 2), (a, 1), (c, -1), (b, -1)])
            .dirty_container_update(task_id, 1, 0)
            .optimize();
        assert_eq!(
            real_collectibles(&update),
            [(b, 1), (c, -1)].into_iter().collect()
        );
        let dirty = update.dirty_container_update.unwrap();
        assert_eq!(dirty.task_id, task_id);
        assert_eq!(dirty.dirty_count, 1);
        assert_eq!(dirty.current_session_clean_count, 0);

        let inverted = update.invert();
        assert_eq!(
            real_collectibles(&inverted),
            [(b, -1), (c, 1)].into_iter().collect()
        );
        let dirty = inverted.dirty_container_update.unwrap();
        assert_eq!(dirty.task_id, task_id);
        assert_eq!(dirty.dirty_count, -1);
        assert_eq!(dirty.current_session_clean_count, 0);

        assert!(
            AggregatedDataUpdate::new()
                .collectibles_update(smallvec![(a, -1), (a, 1)])
                .optimize()
                .is_empty()
        );
        assert!(AggregatedDataUpdate::new().optimize().is_empty());
    }
}

/// Deterministic tests of removals that overtake their additions. They run the real queue on a
/// real backend, but control the order of the jobs, and check the raw edge counts afterwards.
#[cfg(test)]
mod follower_debt_tests {
    use std::{cell::RefCell, sync::Arc};

    use smallvec::{SmallVec, smallvec};
    use turbo_tasks::{CellId, TaskId, TraitTypeId, TurboTasks, ValueTypeId};

    use super::{
        AggregationUpdateJob, AggregationUpdateQueue, InnerOfUppersLostFollowersJob,
        update_follower_count,
    };
    use crate::{
        backend::{
            BackendOptions, StorageMode, TaskDataCategory, TurboTasksBackend,
            operation::ExecuteContext, storage_schema::TaskStorageAccessors,
        },
        data::{
            ActivenessState, AggregationNumber, CellRef, CollectibleRef, Dirtyness, OutputValue,
        },
        noop_backing_storage,
    };

    const ROOT: u32 = u32::MAX;
    /// An aggregating upper.
    pub(super) const UPPER: u32 = 100;
    /// A follower that is placed as inner edge below `UPPER`.
    pub(super) const INNER: u32 = 10;
    /// A follower that is placed as follower edge below `UPPER`.
    pub(super) const FOLLOWER: u32 = 200;

    pub(super) fn id(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    fn collectible() -> CollectibleRef {
        CollectibleRef {
            collectible_type: TraitTypeId::new(1).unwrap(),
            cell: CellRef {
                task: id(1000),
                cell: CellId::new(ValueTypeId::new(1).unwrap(), 0),
            },
        }
    }

    /// Creates a backend with the given tasks `(id, aggregation number)`. Every task emits one
    /// collectible, so it's visible in the aggregated collectibles of an upper whether a task is
    /// aggregated.
    pub(super) fn setup(tasks: &[(u32, u32)]) -> Arc<TurboTasks<TurboTasksBackend>> {
        setup_with_data(tasks, true)
    }

    fn setup_with_data(tasks: &[(u32, u32)], emit: bool) -> Arc<TurboTasks<TurboTasksBackend>> {
        setup_with_storage(tasks, emit, StorageMode::ReadOnly)
    }

    fn setup_with_storage(
        tasks: &[(u32, u32)],
        emit: bool,
        storage_mode: StorageMode,
    ) -> Arc<TurboTasks<TurboTasksBackend>> {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(storage_mode),
                num_workers: Some(1),
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        for &(task_id, _) in tasks {
            tt.backend()
                .storage
                .access_mut(id(task_id))
                .flags
                .set_restored(TaskDataCategory::All);
        }
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            for &(task_id, aggregation_number) in tasks {
                let mut task = ctx.task(id(task_id), TaskDataCategory::All);
                task.set_aggregation_number(AggregationNumber {
                    base: aggregation_number,
                    distance: 0,
                    effective: aggregation_number,
                });
                if emit {
                    let _ = task.update_collectibles_positive_crossing(collectible(), 1);
                }
            }
        }
        tt
    }

    pub(super) fn run(
        tt: &TurboTasks<TurboTasksBackend>,
        jobs: impl IntoIterator<Item = AggregationUpdateJob>,
    ) {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let mut queue = AggregationUpdateQueue::new_without_optimizations();
        queue.extend(jobs);
        queue.execute(&mut ctx);
    }

    pub(super) fn followers(tt: &TurboTasks<TurboTasksBackend>, upper: u32) -> Vec<(TaskId, i32)> {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let task = ctx.task(id(upper), TaskDataCategory::Meta);
        let mut followers: Vec<_> = task.iter_followers().map(|(&id, &c)| (id, c)).collect();
        followers.sort();
        followers
    }

    pub(super) fn uppers(tt: &TurboTasks<TurboTasksBackend>, task: u32) -> Vec<(TaskId, u32)> {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let task = ctx.task(id(task), TaskDataCategory::Meta);
        let mut uppers: Vec<_> = task.iter_upper().map(|(&id, &c)| (id, c)).collect();
        uppers.sort();
        uppers
    }

    /// The aggregated collectible count of `upper`, i.e. how many inner tasks it aggregates.
    fn aggregated(tt: &TurboTasks<TurboTasksBackend>, upper: u32) -> i32 {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let task = ctx.task(id(upper), TaskDataCategory::Meta);
        task.get_aggregated_collectibles(&collectible())
            .copied()
            .unwrap_or_default()
    }

    pub(super) fn add(upper: u32, follower: u32) -> AggregationUpdateJob {
        AggregationUpdateJob::InnerOfUpperHasNewFollowers {
            upper_id: id(upper),
            new_follower_ids: smallvec![id(follower)],
        }
    }

    fn add_count(upper: u32, follower: u32, count: u32) -> AggregationUpdateJob {
        AggregationUpdateJob::InnerOfUpperHasNewFollowersWithCount {
            upper_id: id(upper),
            new_follower_ids: smallvec![(id(follower), count)],
        }
    }

    pub(super) fn remove(upper: u32, follower: u32) -> AggregationUpdateJob {
        AggregationUpdateJob::InnerOfUpperLostFollowers {
            upper_id: id(upper),
            lost_follower_ids: smallvec![id(follower)],
        }
    }

    fn balance(upper: u32, follower: u32) -> AggregationUpdateJob {
        AggregationUpdateJob::BalanceEdge {
            upper_id: id(upper),
            task_id: id(follower),
        }
    }

    /// Asserts that no edge is left and verifies the whole graph.
    fn assert_no_edges(tt: &TurboTasks<TurboTasksBackend>, tasks: &[u32]) {
        for &task in tasks {
            assert_eq!(followers(tt, task), vec![], "followers of {task}");
            assert_eq!(uppers(tt, task), vec![], "uppers of {task}");
        }
        tt.backend().verify_aggregation_edges();
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn removal_before_addition_of_follower_edge() {
        let tt = setup(&[(1, UPPER), (2, FOLLOWER)]);
        run(&tt, [remove(1, 2)]);
        assert_eq!(followers(&tt, 1), vec![(id(2), -1)]);
        run(&tt, [add(1, 2)]);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn removal_before_addition_of_inner_edge() {
        let tt = setup(&[(1, UPPER), (2, INNER)]);
        run(&tt, [remove(1, 2)]);
        // Debt is always recorded on the follower side.
        assert_eq!(followers(&tt, 1), vec![(id(2), -1)]);
        assert_eq!(uppers(&tt, 2), vec![]);
        // The addition pays the debt instead of adding an inner edge, so the data of the inner task
        // is never aggregated.
        run(&tt, [add(1, 2)]);
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn removal_before_addition_with_multiple_uppers() {
        let tt = setup(&[(1, UPPER), (2, UPPER), (3, INNER)]);
        run(
            &tt,
            [AggregationUpdateJob::InnerOfUppersLostFollower {
                upper_ids: smallvec![id(1), id(2)],
                lost_follower_id: id(3),
            }],
        );
        assert_eq!(followers(&tt, 1), vec![(id(3), -1)]);
        assert_eq!(followers(&tt, 2), vec![(id(3), -1)]);
        run(
            &tt,
            [AggregationUpdateJob::InnerOfUppersHasNewFollower {
                upper_ids: smallvec![id(1), id(2)],
                new_follower_id: id(3),
            }],
        );
        assert_eq!(aggregated(&tt, 1), 0);
        assert_eq!(aggregated(&tt, 2), 0);
        assert_no_edges(&tt, &[1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn removal_before_addition_with_multiple_followers() {
        let tt = setup(&[(1, UPPER), (2, INNER), (3, FOLLOWER)]);
        run(
            &tt,
            [AggregationUpdateJob::InnerOfUpperLostFollowers {
                upper_id: id(1),
                lost_follower_ids: smallvec![id(2), id(3)],
            }],
        );
        assert_eq!(followers(&tt, 1), vec![(id(2), -1), (id(3), -1)]);
        run(
            &tt,
            [AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                upper_id: id(1),
                new_follower_ids: smallvec![id(2), id(3)],
            }],
        );
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn removal_before_addition_with_multiple_uppers_and_followers() {
        let tt = setup(&[(1, UPPER), (2, UPPER), (3, INNER), (4, FOLLOWER)]);
        run(
            &tt,
            [InnerOfUppersLostFollowersJob {
                upper_ids: smallvec![id(1), id(2)],
                lost_follower_ids: smallvec![id(3), id(4)],
            }
            .into()],
        );
        assert_eq!(followers(&tt, 1), vec![(id(3), -1), (id(4), -1)]);
        assert_eq!(followers(&tt, 2), vec![(id(3), -1), (id(4), -1)]);
        run(
            &tt,
            [super::InnerOfUppersHasNewFollowersJob {
                upper_ids: smallvec![id(1), id(2)],
                new_follower_ids: smallvec![id(3), id(4)],
            }
            .into()],
        );
        assert_no_edges(&tt, &[1, 2, 3, 4]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn ordered_addition_and_removal() {
        let tt = setup(&[(1, UPPER), (2, INNER), (3, FOLLOWER)]);
        run(&tt, [add(1, 2), add(1, 3)]);
        assert_eq!(uppers(&tt, 2), vec![(id(1), 1)]);
        assert_eq!(followers(&tt, 1), vec![(id(3), 1)]);
        assert_eq!(aggregated(&tt, 1), 1);
        tt.backend().verify_aggregation_edges();
        run(&tt, [remove(1, 2), remove(1, 3)]);
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn batched_addition_and_removal() {
        let tt = setup(&[
            (1, UPPER),
            (2, ROOT),
            (3, INNER),
            (4, FOLLOWER),
            (5, FOLLOWER),
        ]);
        // Task 2 is a root upper of task 1, so it aggregates the followers of task 1 too.
        run(&tt, [add(2, 1)]);
        run(
            &tt,
            [AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                upper_id: id(1),
                new_follower_ids: smallvec![id(3), id(4), id(5)],
            }],
        );
        assert_eq!(uppers(&tt, 3), vec![(id(1), 1)]);
        assert_eq!(followers(&tt, 1), vec![(id(4), 1), (id(5), 1)]);
        assert_eq!(uppers(&tt, 4), vec![(id(2), 1)]);
        assert_eq!(aggregated(&tt, 1), 1);
        // tasks 1, 3, 4 and 5
        assert_eq!(aggregated(&tt, 2), 4);
        tt.backend().verify_aggregation_edges();
        run(
            &tt,
            [AggregationUpdateJob::InnerOfUpperLostFollowers {
                upper_id: id(1),
                lost_follower_ids: smallvec![id(3), id(4), id(5)],
            }],
        );
        assert_eq!(aggregated(&tt, 1), 0);
        assert_eq!(aggregated(&tt, 2), 1);
        run(&tt, [remove(2, 1)]);
        assert_eq!(aggregated(&tt, 2), 0);
        assert_no_edges(&tt, &[1, 2, 3, 4, 5]);
    }

    /// Debt is netted against a larger inner count, which keeps the inner edge.
    #[tokio::test(flavor = "multi_thread")]
    async fn netting_keeps_larger_inner_edge() {
        let tt = setup(&[(1, UPPER), (2, INNER)]);
        run(&tt, [add_count(1, 2, 2)]);
        assert_eq!(uppers(&tt, 2), vec![(id(1), 2)]);
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let mut queue = AggregationUpdateQueue::new_without_optimizations();
            // Removal steps 2 and 3, as if step 1 ran before the addition.
            queue.remove_follower_edges(&mut ctx, id(1), Some(id(2)));
            queue.execute(&mut ctx);
        }
        assert_eq!(uppers(&tt, 2), vec![(id(1), 1)]);
        assert_eq!(followers(&tt, 1), vec![]);
        assert_eq!(aggregated(&tt, 1), 1);
        tt.backend().verify_aggregation_edges();
        run(&tt, [remove(1, 2)]);
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2]);
    }

    /// An addition that finds debt pays it on the follower side right away, without adding an
    /// inner edge (which would then need balancing). Checked directly after the addition, before
    /// any follow-up job runs, for each of the addition handlers.
    #[tokio::test(flavor = "multi_thread")]
    async fn debt_is_paid_without_inner_edge() {
        let tt = setup(&[(1, UPPER), (2, UPPER), (3, INNER), (4, INNER)]);
        run(
            &tt,
            [
                remove(1, 3),
                remove(1, 3),
                remove(1, 3),
                remove(2, 3),
                remove(1, 4),
            ],
        );
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut queue = AggregationUpdateQueue::new_without_optimizations();
        let assert_paid = |queue: &AggregationUpdateQueue| {
            assert!(queue.is_empty(), "paying debt must not need follow-up jobs");
            assert_eq!(uppers(&tt, 3), vec![]);
            assert_eq!(uppers(&tt, 4), vec![]);
            assert_eq!(aggregated(&tt, 1), 0);
            assert_eq!(aggregated(&tt, 2), 0);
        };

        queue.inner_of_upper_has_new_follower(&mut ctx, id(3), id(1), 1);
        assert_paid(&queue);
        assert_eq!(followers(&tt, 1), vec![(id(3), -2), (id(4), -1)]);

        let upper_ids: SmallVec<[TaskId; 2]> = smallvec![id(1), id(2)];
        queue.inner_of_uppers_has_new_follower(&mut ctx, id(3), upper_ids);
        assert_paid(&queue);
        assert_eq!(followers(&tt, 1), vec![(id(3), -1), (id(4), -1)]);
        assert_eq!(followers(&tt, 2), vec![]);

        let follower_ids: SmallVec<[TaskId; 2]> = smallvec![id(3), id(4)];
        queue.inner_of_upper_has_new_followers(&mut ctx, follower_ids, id(1));
        assert_paid(&queue);
        drop(ctx);
        assert_no_edges(&tt, &[1, 2, 3, 4]);
    }

    /// The addition added an inner edge after the removal checked the inner side, but before the
    /// removal recorded debt. The removal sees the inner edge when it checks again and nets both.
    #[tokio::test(flavor = "multi_thread")]
    async fn debt_recorded_after_concurrent_inner_addition() {
        let tt = setup(&[(1, UPPER), (2, INNER)]);
        run(&tt, [add(1, 2)]);
        assert_eq!(uppers(&tt, 2), vec![(id(1), 1)]);
        assert_eq!(aggregated(&tt, 1), 1);
        // Removal steps 2 and 3, as if step 1 ran before the addition.
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let mut queue = AggregationUpdateQueue::new_without_optimizations();
            queue.remove_follower_edges(&mut ctx, id(1), Some(id(2)));
            assert_eq!(followers(&tt, 1), vec![(id(2), -1)]);
            assert!(!queue.is_empty(), "the removal must push a BalanceEdge");
            queue.execute(&mut ctx);
        }
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[derive(Clone, Copy)]
    enum AddShape {
        Single,
        Uppers,
        Followers,
    }

    impl AddShape {
        fn edges(self) -> Vec<(u32, u32)> {
            match self {
                Self::Single => vec![(1, 3)],
                Self::Uppers => vec![(1, 3), (2, 3)],
                Self::Followers => vec![(1, 3), (1, 4)],
            }
        }

        fn apply(self, queue: &mut AggregationUpdateQueue, ctx: &mut ExecuteContext<'_>) {
            match self {
                Self::Single => queue.inner_of_upper_has_new_follower(ctx, id(3), id(1), 1),
                Self::Uppers => queue.inner_of_uppers_has_new_follower::<TaskId, 2>(
                    ctx,
                    id(3),
                    smallvec![id(1), id(2)],
                ),
                Self::Followers => queue.inner_of_upper_has_new_followers::<TaskId, 2>(
                    ctx,
                    smallvec![id(3), id(4)],
                    id(1),
                ),
            }
        }
    }

    /// Forces the lost-wakeup ordering through a real handler, not the postcheck helper:
    /// add precheck -> complete removal (including its recheck) -> inner write -> add postcheck.
    /// The one-shot callback runs without task guards, as another queue could at that boundary.
    fn addition_after_concurrent_debt(shape: AddShape, emit: bool) {
        let tt = setup_with_data(&[(1, UPPER), (2, UPPER), (3, INNER), (4, INNER)], emit);
        let edges = shape.edges();
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut queue = AggregationUpdateQueue::new_without_optimizations();
        queue.before_inner_write = Some(Box::new(move |ctx| {
            let mut removal = AggregationUpdateQueue::new_without_optimizations();
            for &(upper, follower) in &edges {
                assert_eq!(
                    ctx.task(id(follower), TaskDataCategory::Meta).upper_len(),
                    0
                );
                removal.push(remove(upper, follower));
            }
            removal.execute(ctx);
            assert!(
                removal.is_empty(),
                "the removal has already finished its recheck"
            );
            for &(upper, follower) in &edges {
                assert_eq!(
                    ctx.task(id(upper), TaskDataCategory::Meta)
                        .get_followers(&id(follower)),
                    Some(&-1)
                );
            }
        }));
        shape.apply(&mut queue, &mut ctx);
        assert!(
            queue.before_inner_write.is_none(),
            "the actual handler must reach the hook"
        );
        assert!(
            !queue.balance_queue.is_empty(),
            "the actual addition must schedule balancing"
        );
        queue.execute(&mut ctx);
        drop(ctx);
        assert_eq!(aggregated(&tt, 1), 0);
        assert_eq!(aggregated(&tt, 2), 0);
        assert_no_edges(&tt, &[1, 2, 3, 4]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn single_inner_addition_after_concurrent_debt() {
        for emit in [false, true] {
            addition_after_concurrent_debt(AddShape::Single, emit);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn multi_upper_inner_addition_after_concurrent_debt() {
        for emit in [false, true] {
            addition_after_concurrent_debt(AddShape::Uppers, emit);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn multi_follower_inner_addition_after_concurrent_debt() {
        for emit in [false, true] {
            addition_after_concurrent_debt(AddShape::Followers, emit);
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn partial_debt_payment() {
        let tt = setup(&[(1, UPPER), (2, INNER)]);
        run(&tt, [remove(1, 2), remove(1, 2)]);
        assert_eq!(followers(&tt, 1), vec![(id(2), -2)]);
        run(&tt, [add_count(1, 2, 1)]);
        assert_eq!(followers(&tt, 1), vec![(id(2), -1)]);
        assert_eq!(aggregated(&tt, 1), 0);
        // Adding more than the debt makes the edge appear. It's added on the follower side and
        // moved to the inner side by balancing.
        run(&tt, [add_count(1, 2, 2)]);
        assert_eq!(followers(&tt, 1), vec![]);
        assert_eq!(uppers(&tt, 2), vec![(id(1), 1)]);
        assert_eq!(aggregated(&tt, 1), 1);
        tt.backend().verify_aggregation_edges();
        run(&tt, [remove(1, 2)]);
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn balancing_keeps_debt_on_the_follower_side() {
        let tt = setup(&[(1, UPPER), (2, INNER), (3, FOLLOWER)]);
        run(
            &tt,
            [remove(1, 2), remove(1, 3), balance(1, 2), balance(1, 3)],
        );
        assert_eq!(followers(&tt, 1), vec![(id(2), -1), (id(3), -1)]);
        assert_eq!(uppers(&tt, 2), vec![]);
        assert_eq!(uppers(&tt, 3), vec![]);
        run(&tt, [add(1, 2), add(1, 3)]);
        assert_no_edges(&tt, &[1, 2, 3]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn root_upper_with_root_follower() {
        let tt = setup(&[(1, ROOT), (2, ROOT)]);
        run(&tt, [add(1, 2), balance(1, 2)]);
        assert_eq!(uppers(&tt, 2), vec![(id(1), 1)]);
        assert_eq!(followers(&tt, 1), vec![]);
        tt.backend().verify_aggregation_edges();
        // Debt of a root edge is paid as well.
        run(&tt, [remove(1, 2), remove(1, 2), add(1, 2)]);
        assert_eq!(aggregated(&tt, 1), 0);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn paid_debt_notes_collectible_upper() {
        let tt = setup(&[(1, UPPER), (2, FOLLOWER)]);
        run(&tt, [remove(1, 2)]);
        let noted = RefCell::new(Vec::new());
        let collector = |task_id: TaskId| noted.borrow_mut().push(task_id);
        {
            let mut ctx =
                ExecuteContext::new_with_gc_collectible_for_testing(tt.backend(), &tt, &collector);
            let mut queue = AggregationUpdateQueue::new_without_optimizations();
            queue.push(add(1, 2));
            queue.execute(&mut ctx);
        }
        assert_eq!(followers(&tt, 1), vec![]);
        assert!(
            noted.borrow().contains(&id(1)),
            "the upper must be noted as maybe collectible, noted: {:?}",
            noted.borrow()
        );
    }

    /// Give fixtures output and session-clean dirty state so active traversal observes data without
    /// scheduling synthetic task IDs. Seeding before edges exist avoids missing propagation jobs.
    fn seed_effects(tt: &TurboTasks<TurboTasksBackend>, dirty_tasks: &[u32], active_tasks: &[u32]) {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        for &task_id in dirty_tasks {
            let mut task = ctx.task(id(task_id), TaskDataCategory::All);
            task.set_output(OutputValue::Cell(collectible().cell));
            assert!(
                task.update_dirty_state(Some(Dirtyness::SessionDependent))
                    .is_none()
            );
            assert_eq!(task.dirty_state(), (true, true));
        }
        for &task_id in active_tasks {
            let mut task = ctx.task(id(task_id), TaskDataCategory::All);
            task.set_output(OutputValue::Cell(collectible().cell));
            let mut state = ActivenessState::new(id(task_id));
            state.active_counter = 2;
            task.set_activeness(state);
        }
        assert!(ctx.should_track_activeness());
    }

    /// (dirty containers, current-session-clean containers, active counter).
    fn effects(tt: &TurboTasks<TurboTasksBackend>, task_id: u32) -> (i32, i32, i32) {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let task = ctx.task(id(task_id), TaskDataCategory::Meta);
        (
            task.get_aggregated_dirty_container_count()
                .copied()
                .unwrap_or_default(),
            task.get_aggregated_current_session_clean_container_count()
                .copied()
                .unwrap_or_default(),
            task.get_activeness()
                .map_or(0, |state| state.active_counter),
        )
    }

    fn propagation_fixture(follower_number: u32) -> Arc<TurboTasks<TurboTasksBackend>> {
        let tt = setup(&[
            (1, UPPER),
            (2, UPPER),
            (3, follower_number),
            (4, follower_number),
            (9, ROOT),
        ]);
        seed_effects(&tt, &[3, 4], &[1, 2]);
        run(&tt, [add(9, 1), add(9, 2)]);
        tt
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn debt_payment_has_no_dirty_or_active_effects() {
        for shape in [AddShape::Single, AddShape::Uppers, AddShape::Followers] {
            for number in [INNER, FOLLOWER] {
                let tt = propagation_fixture(number);
                let before: Vec<_> = [1, 2, 3, 4, 9].map(|task| effects(&tt, task)).to_vec();
                let edges = shape.edges();
                run(&tt, edges.iter().map(|&(u, f)| remove(u, f)));
                assert_eq!(
                    [1, 2, 3, 4, 9].map(|task| effects(&tt, task)).to_vec(),
                    before
                );
                {
                    let mut ctx = ExecuteContext::new(tt.backend(), &tt);
                    let mut queue = AggregationUpdateQueue::new_without_optimizations();
                    shape.apply(&mut queue, &mut ctx);
                    assert!(
                        queue.is_empty(),
                        "pure debt payment must not propagate anything"
                    );
                }
                assert_eq!(
                    [1, 2, 3, 4, 9].map(|task| effects(&tt, task)).to_vec(),
                    before
                );
                assert_eq!(aggregated(&tt, 9), 2);
                assert_eq!(uppers(&tt, 3), vec![]);
                assert_eq!(uppers(&tt, 4), vec![]);
                assert_eq!(followers(&tt, 1), vec![]);
                assert_eq!(followers(&tt, 2), vec![]);
                tt.backend().verify_aggregation_edges();
            }
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn overpaying_debt_propagates_one_appearance() {
        for shape in [AddShape::Single, AddShape::Uppers, AddShape::Followers] {
            let tt = propagation_fixture(FOLLOWER);
            let edges = shape.edges();
            run(&tt, edges.iter().map(|&(u, f)| remove(u, f)));
            // First addition pays debt, second creates exactly one real edge per pair.
            for _ in 0..2 {
                let mut ctx = ExecuteContext::new(tt.backend(), &tt);
                let mut queue = AggregationUpdateQueue::new_without_optimizations();
                shape.apply(&mut queue, &mut ctx);
                queue.execute(&mut ctx);
            }
            let copies_of_three = edges.iter().filter(|&&(_, f)| f == 3).count() as i32;
            let copies_of_four = edges.iter().filter(|&&(_, f)| f == 4).count() as i32;
            assert_eq!(effects(&tt, 3).2, copies_of_three);
            assert_eq!(effects(&tt, 4).2, copies_of_four);
            // Ancestor multiplicity matches paths, but its dirty-container totals count presence.
            assert_eq!(uppers(&tt, 3), vec![(id(9), copies_of_three as u32)]);
            if copies_of_four > 0 {
                assert_eq!(uppers(&tt, 4), vec![(id(9), copies_of_four as u32)]);
            }
            let unique_followers = i32::from(copies_of_three > 0) + i32::from(copies_of_four > 0);
            assert_eq!(effects(&tt, 9), (unique_followers, unique_followers, 0));
            assert_eq!(aggregated(&tt, 9), 2 + unique_followers);
            // A second real reference does not repeat active/data appearance effects.
            run(&tt, edges.iter().map(|&(u, f)| add(u, f)));
            assert_eq!(effects(&tt, 3).2, copies_of_three);
            assert_eq!(effects(&tt, 4).2, copies_of_four);
            run(
                &tt,
                edges
                    .iter()
                    .flat_map(|&(u, f)| [remove(u, f), remove(u, f)]),
            );
            assert_eq!(effects(&tt, 3).2, 0);
            assert_eq!(effects(&tt, 4).2, 0);
            assert_eq!(effects(&tt, 9), (0, 0, 0));
            assert_eq!(aggregated(&tt, 9), 2);
            tt.backend().verify_aggregation_edges();
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn split_cancellation_reverses_dirty_snapshot_once() {
        for shape in [AddShape::Single, AddShape::Uppers, AddShape::Followers] {
            let tt = propagation_fixture(INNER);
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let mut queue = AggregationUpdateQueue::new_without_optimizations();
            shape.apply(&mut queue, &mut ctx);
            queue.execute(&mut ctx);
            let edges = shape.edges();
            for &(upper, follower) in &edges {
                // A removal already missed the inner edge before the addition. Now its debt and
                // recheck must undo both dirty and current-session-clean contributions once.
                queue.remove_follower_edges(&mut ctx, id(upper), Some(id(follower)));
            }
            queue.execute(&mut ctx);
            drop(ctx);
            for upper in [1, 2] {
                assert_eq!(effects(&tt, upper), (0, 0, 2));
                assert_eq!(aggregated(&tt, upper), 0);
                assert!(followers(&tt, upper).is_empty());
            }
            assert_eq!(effects(&tt, 9), (0, 0, 0));
            assert_eq!(aggregated(&tt, 9), 2);
            for follower in [3, 4] {
                assert_eq!(effects(&tt, follower).2, 0);
                assert!(uppers(&tt, follower).is_empty());
            }
            tt.backend().verify_aggregation_edges();
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn leaf_promotion_preserves_data_and_active_counts() {
        let tt = setup(&[(1, UPPER), (2, INNER), (3, FOLLOWER), (4, 5), (9, ROOT)]);
        seed_effects(&tt, &[2, 3, 4], &[1]);
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            ctx.task(id(2), TaskDataCategory::Meta)
                .extend_children([id(3), id(4)]);
        }
        run(&tt, [add(9, 1), add(1, 2)]);
        assert!(
            followers(&tt, 2).is_empty(),
            "a leaf has no raw follower entries"
        );
        // Promotion nests task 4's dirty container under task 2, so task 1's raw container count
        // changes from two to one. Its dirty/clean presence and the root's state stay unchanged.
        assert_eq!(effects(&tt, 1), (2, 2, 2));
        let before: Vec<_> = [3, 4, 9].map(|task| effects(&tt, task)).to_vec();
        let collectibles_before = (aggregated(&tt, 1), aggregated(&tt, 9));
        run(
            &tt,
            [AggregationUpdateJob::UpdateAggregationNumber {
                task_id: id(2),
                base_aggregation_number: 50,
                distance: None,
            }],
        );
        assert_eq!(followers(&tt, 2), vec![(id(3), 1)]);
        assert_eq!(uppers(&tt, 4), vec![(id(2), 1)]);
        assert_eq!(effects(&tt, 1), (1, 1, 2));
        assert_eq!([3, 4, 9].map(|task| effects(&tt, task)).to_vec(), before);
        assert_eq!(
            (aggregated(&tt, 1), aggregated(&tt, 9)),
            collectibles_before
        );
        tt.backend().verify_aggregation_edges();
    }

    /// Capture must retain even edgeless resident endpoints for non-root placement checks too.
    #[tokio::test(flavor = "multi_thread")]
    async fn verification_keeps_resident_edgeless_endpoints() {
        for (upper_number, valid) in [(ROOT, false), (UPPER, false), (1, true)] {
            let tt = setup(&[(1, upper_number), (2, INNER)]);
            {
                let mut ctx = ExecuteContext::new(tt.backend(), &tt);
                update_follower_count(&mut ctx.task(id(1), TaskDataCategory::Meta), id(2), 1);
            }
            let edges = tt.backend().storage.aggregation_edges_for_verification();
            assert_eq!(edges.len(), 2, "both endpoints are restored and resident");
            let violations = super::super::aggregation_edge::verify_aggregation_edges(&edges);
            assert_eq!(violations.is_empty(), valid, "{violations:?}");
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn verification_does_not_invent_unrestored_endpoint_numbers() {
        let tt = setup(&[(1, UPPER)]);
        // Allocate an endpoint slot, but leave metadata unrestored. Its default aggregation number
        // must not be mistaken for a real zero (which would imply the wrong placement).
        drop(tt.backend().storage.access_mut(id(2)));
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            update_follower_count(&mut ctx.task(id(1), TaskDataCategory::Meta), id(2), 1);
        }
        let edges = tt.backend().storage.aggregation_edges_for_verification();
        assert_eq!(edges.len(), 1);
        assert!(super::super::aggregation_edge::verify_aggregation_edges(&edges).is_empty());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn follower_debt_is_not_a_gc_pin() {
        let tt = setup(&[(1, UPPER), (2, FOLLOWER)]);
        run(&tt, [remove(1, 2)]);
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let upper = ctx.task(id(1), TaskDataCategory::Meta);
            assert_eq!(upper.get_followers(&id(2)), Some(&-1));
            assert!(
                upper.is_gc_collectible(),
                "outgoing debt is not an incoming GC reference"
            );
        }
        run(&tt, [add(1, 2)]);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn debt_is_settled_before_snapshot_admission() {
        let tt = setup_with_storage(
            &[(1, UPPER), (2, INNER)],
            true,
            StorageMode::ReadWriteOnShutdown,
        );
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let mut queue = AggregationUpdateQueue::new_without_optimizations();
        queue.push(remove(1, 2));
        queue.execute(&mut ctx);
        assert_eq!(followers(&tt, 1), vec![(id(2), -1)]);
        // A real ExecuteContext owns the operation guard. The nonblocking attempt cannot acquire
        // exclusion, even though the debt-bearing task itself is collectible.
        assert!(tt.backend().snapshot_coord.try_begin_snapshot().is_none());
        queue.push(add(1, 2));
        queue.execute(&mut ctx);
        assert!(tt.backend().snapshot_coord.try_begin_snapshot().is_none());
        drop(ctx);
        let phase = tt
            .backend()
            .snapshot_coord
            .try_begin_snapshot()
            .expect("operation settled");
        tt.backend().verify_aggregation_edges();
        drop(phase);
        assert_no_edges(&tt, &[1, 2]);
    }

    #[tokio::test(flavor = "multi_thread")]
    #[cfg_attr(
        target_family = "wasm",
        ignore = "no unwinding on wasm: std is built panic=abort"
    )]
    #[should_panic(expected = "aggregation edges are inconsistent")]
    async fn verification_detects_debt() {
        let tt = setup(&[(1, UPPER), (2, FOLLOWER)]);
        run(&tt, [remove(1, 2)]);
        tt.backend().verify_aggregation_edges();
    }
}

/// Microbenchmark of the aggregation update queue for removals that overtake their additions.
/// Uses criterion, but runs as an ignored test because it needs crate internals:
///
/// ```bash
/// cargo test -p turbo-tasks-backend --release --lib -- --ignored --nocapture \
///   aggregation_update::overtake_benchmark
/// ```
///
/// Set `CRITERION_SAVE_BASELINE` or `CRITERION_BASELINE` to save or compare against a baseline.
#[cfg(all(test, not(target_family = "wasm")))]
mod overtake_benchmark {
    use std::time::{Duration, Instant};

    use criterion::{BenchmarkId, Criterion};

    use super::follower_debt_tests::{
        FOLLOWER, INNER, UPPER, add, followers, remove, run, setup, uppers,
    };

    #[tokio::test(flavor = "multi_thread")]
    #[ignore = "benchmark"]
    async fn removal_overtakes_addition() {
        let mut criterion = Criterion::default()
            .sample_size(20)
            .warm_up_time(Duration::from_secs(1))
            .measurement_time(Duration::from_secs(5));
        if let Ok(baseline) = std::env::var("CRITERION_SAVE_BASELINE") {
            criterion = criterion.save_baseline(baseline);
        } else if let Ok(baseline) = std::env::var("CRITERION_BASELINE") {
            criterion = criterion.retain_baseline(baseline, false);
        }
        let mut group = criterion.benchmark_group("aggregation_update_queue");
        const EDGES: u32 = 32;
        // Task 1 is the upper, half of the followers are inner tasks, half follower tasks.
        let tasks: Vec<(u32, u32)> = std::iter::once((1, UPPER))
            .chain((0..EDGES).map(|i| (i + 2, if i % 2 == 0 { INNER } else { FOLLOWER })))
            .collect();
        let tt = setup(&tasks);
        let adds = || (0..EDGES).map(|i| add(1, i + 2));
        let removes = || (0..EDGES).map(|i| remove(1, i + 2));
        let assert_empty = || {
            assert!(followers(&tt, 1).is_empty());
            for i in 0..EDGES {
                assert!(uppers(&tt, i + 2).is_empty());
            }
        };
        // Additions, followed by their removals
        group.bench_function(BenchmarkId::new("ordered", EDGES), |b| {
            b.iter(|| run(&tt, adds().chain(removes())))
        });
        assert_empty();
        // Only the timing of the additions of `ordered`
        group.bench_function(BenchmarkId::new("ordered_additions", EDGES), |b| {
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    let start = Instant::now();
                    run(&tt, adds());
                    total += start.elapsed();
                    run(&tt, removes());
                }
                total
            })
        });
        assert_empty();
        // Only the timing of the removals of `ordered`
        group.bench_function(BenchmarkId::new("ordered_removals", EDGES), |b| {
            b.iter_custom(|iters| {
                let mut total = Duration::ZERO;
                for _ in 0..iters {
                    run(&tt, adds());
                    let start = Instant::now();
                    run(&tt, removes());
                    total += start.elapsed();
                }
                total
            })
        });
        assert_empty();
        // Removals that are processed before their additions
        group.bench_function(BenchmarkId::new("overtake", EDGES), |b| {
            b.iter(|| run(&tt, removes().chain(adds())))
        });
        assert_empty();
        group.finish();
    }
}
