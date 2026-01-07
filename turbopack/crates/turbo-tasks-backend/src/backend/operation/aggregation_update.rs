use std::{
    cmp::{Ordering, max},
    collections::{VecDeque, hash_map::Entry as HashMapEntry},
    hash::Hash,
    mem::take,
    num::NonZeroU32,
    ops::{ControlFlow, Deref},
    thread::yield_now,
    time::{Duration, Instant},
};

use anyhow::Result;
use bincode::{Decode, Encode};
use indexmap::map::Entry;
use ringmap::RingSet;
use rustc_hash::{FxBuildHasher, FxHashMap};
use smallvec::{SmallVec, smallvec};
#[cfg(any(
    feature = "trace_aggregation_update",
    feature = "trace_find_and_schedule"
))]
use tracing::{span::Span, trace_span};
use turbo_tasks::{FxIndexMap, TaskExecutionReason, TaskId};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        TaskDataCategory, get_mut, get_mut_or_insert_with,
        operation::{ExecuteContext, Operation, TaskGuard, invalidate::make_task_dirty},
        storage::{
            count, get, get_many, iter_many, remove, update, update_count, update_count_and_get,
        },
    },
    data::{
        ActivenessState, AggregationNumber, CachedDataItem, CachedDataItemKey, CachedDataItemType,
        CollectibleRef,
    },
    utils::swap_retain,
};

type FxRingSet<T> = RingSet<T, FxBuildHasher>;

pub const LEAF_NUMBER: u32 = 16;
const MAX_COUNT_BEFORE_YIELD: usize = 1000;
const MAX_UPPERS_FOLLOWER_PRODUCT: usize = 31;

type TaskIdVec = SmallVec<[TaskId; 4]>;

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
    task: &impl TaskGuard,
    aggregation_number: u32,
) -> TaskIdVec {
    if is_aggregating_node(aggregation_number) {
        get_many!(task, Follower { task } count if *count > 0 => task)
    } else {
        get_many!(task, Child { task } => task)
    }
}

/// Returns a list of tasks that are considered as "following" the task. The current tasks is not
/// aggregating over the follower tasks and they should be aggregated by all upper tasks.
fn get_followers(task: &impl TaskGuard) -> TaskIdVec {
    get_followers_with_aggregation_number(task, get_aggregation_number(task))
}

/// Returns a list of tasks that are considered as "upper" tasks of the task. The upper tasks are
/// aggregating over the task.
pub fn get_uppers(task: &impl TaskGuard) -> TaskIdVec {
    get_many!(task, Upper { task } count if *count > 0 => task)
}

/// Returns an iterator of tasks that are considered as "upper" tasks of the task. See `get_uppers`
fn iter_uppers<'a>(task: &'a (impl TaskGuard + 'a)) -> impl Iterator<Item = TaskId> + 'a {
    iter_many!(task, Upper { task } count if *count > 0 => task)
}

/// Returns the aggregation number of the task.
pub fn get_aggregation_number(task: &impl TaskGuard) -> u32 {
    get!(task, AggregationNumber)
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

#[derive(Encode, Decode, Clone, Debug)]
pub struct InnerOfUppersHasNewFollowersJob {
    #[bincode(with = "turbo_bincode::smallvec")]
    pub upper_ids: TaskIdVec,
    #[bincode(with = "turbo_bincode::smallvec")]
    pub new_follower_ids: TaskIdVec,
}

impl From<InnerOfUppersHasNewFollowersJob> for AggregationUpdateJob {
    fn from(job: InnerOfUppersHasNewFollowersJob) -> Self {
        AggregationUpdateJob::InnerOfUppersHasNewFollowers(Box::new(job))
    }
}

#[derive(Encode, Decode, Clone, Debug)]
pub struct InnerOfUppersLostFollowersJob {
    #[bincode(with = "turbo_bincode::smallvec")]
    pub upper_ids: TaskIdVec,
    #[bincode(with = "turbo_bincode::smallvec")]
    pub lost_follower_ids: TaskIdVec,
}

impl From<InnerOfUppersLostFollowersJob> for AggregationUpdateJob {
    fn from(job: InnerOfUppersLostFollowersJob) -> Self {
        AggregationUpdateJob::InnerOfUppersLostFollowers(Box::new(job))
    }
}

#[derive(Encode, Decode, Clone, Debug)]
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
#[derive(Encode, Decode, Clone, Debug)]
pub enum AggregationUpdateJob {
    /// Update the aggregation number of a task. This might result in balancing needed to update
    /// "upper" and "follower" edges.
    UpdateAggregationNumber {
        task_id: TaskId,
        base_aggregation_number: u32,
        distance: Option<NonZeroU32>,
    },
    /// Notifies an upper task that one of its inner tasks has a new follower.
    InnerOfUpperHasNewFollower {
        upper_id: TaskId,
        new_follower_id: TaskId,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has a new follower.
    InnerOfUppersHasNewFollower {
        upper_ids: TaskIdVec,
        new_follower_id: TaskId,
    },
    /// Notifies an upper task that one of its inner tasks has new followers.
    InnerOfUpperHasNewFollowers {
        upper_id: TaskId,
        new_follower_ids: TaskIdVec,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has new followers.
    InnerOfUppersHasNewFollowers(Box<InnerOfUppersHasNewFollowersJob>),
    /// Notifies multiple upper tasks that one of its inner tasks has lost a follower.
    InnerOfUppersLostFollower {
        upper_ids: TaskIdVec,
        lost_follower_id: TaskId,
        retry: u16,
    },
    /// Notifies multiple upper tasks that one of its inner tasks has lost followers.
    InnerOfUppersLostFollowers(Box<InnerOfUppersLostFollowersJob>),
    /// Notifies an upper task that one of its inner tasks has lost followers.
    InnerOfUpperLostFollowers {
        upper_id: TaskId,
        lost_follower_ids: TaskIdVec,
        retry: u16,
    },
    /// Notifies an upper task about changed data from an inner task.
    AggregatedDataUpdate(Box<AggregatedDataUpdateJob>),
    /// Invalidates tasks that are dependent on a collectible type.
    InvalidateDueToCollectiblesChange {
        task_ids: TaskIdVec,
        #[cfg(feature = "trace_task_dirty")]
        collectible_type: turbo_tasks::TraitTypeId,
    },
    /// Increases the active counter of the task
    IncreaseActiveCount {
        // TODO: bgw: Add a way to skip the entire enum variant in bincode (generating an error
        // upon attempted serialization) similar to #[serde(skip)] on variants
        #[bincode(skip, default = "unreachable_decode")]
        task: TaskId,
    },
    /// Increases the active counters of the tasks
    IncreaseActiveCounts {
        #[bincode(skip, default = "unreachable_decode")]
        task_ids: TaskIdVec,
    },
    /// Decreases the active counter of the task
    DecreaseActiveCount {
        #[bincode(skip, default = "unreachable_decode")]
        task: TaskId,
    },
    /// Decreases the active counters of the tasks
    DecreaseActiveCounts {
        #[bincode(skip, default = "unreachable_decode")]
        task_ids: TaskIdVec,
    },
    /// Balances the edges of the graph. This checks if the graph invariant is still met for this
    /// edge and coverts a upper edge to a follower edge or vice versa. Balancing might triggers
    /// more changes to the structure.
    BalanceEdge { upper_id: TaskId, task_id: TaskId },
    /// Does nothing. This is used to filter out transient jobs during serialization.
    Noop,
}

fn unreachable_decode<T>() -> T {
    unreachable!("AggregatedDataUpdateJob variant should not have been encoded, cannot decode")
}

impl AggregationUpdateJob {
    pub fn data_update(
        task: &mut impl TaskGuard,
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

#[derive(Default, Encode, Decode, Clone, Copy, Debug)]
#[bincode(decode_bounds = "T: Default", borrow_decode_bounds = "T: Default")]
pub struct SessionDependent<T> {
    #[bincode(skip)]
    pub value: T,
}

impl<T> SessionDependent<T> {
    pub fn new(value: T) -> Self {
        Self { value }
    }
}

impl<T> Deref for SessionDependent<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}

/// Aggregated data update.
#[derive(Default, Encode, Decode, Clone, Debug)]
pub struct AggregatedDataUpdate {
    /// One of the inner tasks has changed its dirty state or aggregated dirty state.
    /// (task id, dirty update, current session clean update)
    // TODO Serialize the current session clean update as 0
    dirty_container_update: Option<(TaskId, i32, SessionDependent<i32>)>,
    /// One of the inner tasks has changed its collectibles count or aggregated collectibles count.
    collectibles_update: Vec<(CollectibleRef, i32)>,
}

impl AggregatedDataUpdate {
    /// Derives an `AggregatedDataUpdate` from a task. This is used when a task is connected to an
    /// upper task.
    fn from_task(task: &mut impl TaskGuard) -> Self {
        let aggregation = get_aggregation_number(task);
        let mut dirty_count = 0;
        let mut current_session_clean_count = 0;
        let mut collectibles_update: Vec<_> =
            get_many!(task, Collectible { collectible } count => (collectible, *count));
        if is_aggregating_node(aggregation) {
            dirty_count = get!(task, AggregatedDirtyContainerCount)
                .copied()
                .unwrap_or_default();
            current_session_clean_count = get!(task, AggregatedCurrentSessionCleanContainerCount)
                .copied()
                .unwrap_or_default();
            let collectibles = iter_many!(
                task,
                AggregatedCollectible {
                    collectible
                } count if *count > 0 => {
                    collectible
                }
            );
            for collectible in collectibles {
                collectibles_update.push((collectible, 1));
            }
        }
        let (dirty, current_session_clean) = task.dirty();
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

    /// Inverts the update. This is used when the task is removed from an upper task.
    fn invert(mut self) -> Self {
        let Self {
            dirty_container_update,
            collectibles_update,
        } = &mut self;
        if let Some((_, value, current_session_clean_update)) = dirty_container_update.as_mut() {
            *value = -*value;
            current_session_clean_update.value = -current_session_clean_update.value;
        }
        for (_, value) in collectibles_update.iter_mut() {
            *value = -*value;
        }
        self
    }

    /// Applies the update to the task. It may return an aggregated update that should be applied to
    /// upper tasks.
    fn apply(
        &self,
        task: &mut impl TaskGuard,
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
        if let &Some((dirty_container_id, count, current_session_clean_update)) =
            dirty_container_update
        {
            if should_track_activeness {
                // When a dirty container count is increased and the task is considered as active
                // we need to schedule the dirty tasks in the new dirty container
                let current_session_update = count - *current_session_clean_update;
                if current_session_update > 0 && task.has_key(&CachedDataItemKey::Activeness {}) {
                    queue.push_find_and_schedule_dirty(dirty_container_id)
                }
            }

            // Update AggregatedDirtyContainer and compute aggregated update
            let mut dirty_container_count_update = 0;
            let old_dirty_single_container_count;
            let new_dirty_single_container_count;
            if count != 0 {
                new_dirty_single_container_count = update_count_and_get!(
                    task,
                    AggregatedDirtyContainer {
                        task: dirty_container_id
                    },
                    count
                );
                old_dirty_single_container_count = new_dirty_single_container_count - count;
                dirty_container_count_update = before_after_to_diff_value(
                    old_dirty_single_container_count > 0,
                    new_dirty_single_container_count > 0,
                );
            } else {
                new_dirty_single_container_count = get!(
                    task,
                    AggregatedDirtyContainer {
                        task: dirty_container_id
                    }
                )
                .copied()
                .unwrap_or_default();
                old_dirty_single_container_count = new_dirty_single_container_count;
            }

            // Update AggregatedSessionDependentCleanContainer
            let old_single_container_current_session_clean_count;
            let new_single_container_current_session_clean_count;
            if *current_session_clean_update != 0 {
                new_single_container_current_session_clean_count = update_count_and_get!(
                    task,
                    AggregatedCurrentSessionCleanContainer {
                        task: dirty_container_id,
                    },
                    *current_session_clean_update
                );
                old_single_container_current_session_clean_count =
                    new_single_container_current_session_clean_count
                        - *current_session_clean_update;
            } else {
                new_single_container_current_session_clean_count = get!(
                    task,
                    AggregatedCurrentSessionCleanContainer {
                        task: dirty_container_id,
                    }
                )
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
                let (is_self_dirty, current_session_self_clean) = task.dirty();

                let task_id = task.id();

                // Update AggregatedDirtyContainerCount and compute aggregate value
                let old_dirty_container_count;
                let new_dirty_container_count;
                if dirty_container_count_update != 0 {
                    new_dirty_container_count = update_count_and_get!(
                        task,
                        AggregatedDirtyContainerCount,
                        dirty_container_count_update
                    );
                    old_dirty_container_count =
                        new_dirty_container_count - dirty_container_count_update;
                } else {
                    new_dirty_container_count = get!(task, AggregatedDirtyContainerCount)
                        .copied()
                        .unwrap_or_default();
                    old_dirty_container_count = new_dirty_container_count;
                };

                // Update AggregatedSessionDependentCleanContainerCount and compute aggregate value
                let new_current_session_clean_container_count;
                let old_current_session_clean_container_count;
                if current_session_clean_update != 0 {
                    new_current_session_clean_container_count = update_count_and_get!(
                        task,
                        AggregatedCurrentSessionCleanContainerCount,
                        current_session_clean_update
                    );
                    old_current_session_clean_container_count =
                        new_current_session_clean_container_count - current_session_clean_update;
                } else {
                    new_current_session_clean_container_count =
                        get!(task, AggregatedCurrentSessionCleanContainerCount)
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

                    if let Some((_, count, current_session_clean)) = result.dirty_container_update
                        && count - *current_session_clean < 0
                    {
                        // When the current task is no longer dirty, we need to fire the
                        // aggregate root events and do some cleanup
                        if let Some(activeness_state) = get_mut!(task, Activeness) {
                            activeness_state.all_clean_event.notify(usize::MAX);
                            activeness_state.unset_active_until_clean();
                            if activeness_state.is_empty() {
                                task.remove(&CachedDataItemKey::Activeness {});
                            }
                        }
                    }
                }
            }
        }
        for (collectible, count) in collectibles_update {
            let mut added = false;
            let mut removed = false;
            update!(
                task,
                AggregatedCollectible {
                    collectible: *collectible
                },
                |old: Option<i32>| {
                    let old = old.unwrap_or(0);
                    let new = old + *count;
                    if old <= 0 && new > 0 {
                        added = true;
                    } else if old > 0 && new <= 0 {
                        removed = true;
                    }
                    (new != 0).then_some(new)
                }
            );
            if added || removed {
                let ty = collectible.collectible_type;
                let dependent: TaskIdVec = get_many!(
                    task,
                    CollectiblesDependent {
                        collectible_type,
                        task,
                    } if collectible_type == ty => {
                        task
                    }
                );
                if !dependent.is_empty() {
                    queue.push(AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                        task_ids: dependent,
                        #[cfg(feature = "trace_task_dirty")]
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
            collectibles_update: Vec::new(),
        }
    }

    /// Adds a dirty container update to the update.
    pub fn dirty_container_update(
        mut self,
        task_id: TaskId,
        count: i32,
        current_session_clean_update: i32,
    ) -> Self {
        self.dirty_container_update = Some((
            task_id,
            count,
            SessionDependent::new(current_session_clean_update),
        ));
        self
    }

    /// Adds a collectibles update to the update.
    pub fn collectibles_update(mut self, collectibles_update: Vec<(CollectibleRef, i32)>) -> Self {
        self.collectibles_update = collectibles_update;
        self
    }
}

/// An aggregation number update job that is enqueued.
#[derive(Encode, Decode, Clone)]
struct AggregationNumberUpdate {
    base_aggregation_number: u32,
    distance: Option<NonZeroU32>,
    #[cfg(feature = "trace_aggregation_update")]
    #[bincode(skip, default)]
    span: Option<Span>,
}

/// An aggregated data update job that is enqueued. See `AggregatedDataUpdate`.
#[derive(Encode, Decode, Clone)]
struct AggregationUpdateJobItem {
    job: AggregationUpdateJob,
    #[cfg(feature = "trace_aggregation_update")]
    #[bincode(skip, default)]
    span: Option<Span>,
}

impl AggregationUpdateJobItem {
    fn new(job: AggregationUpdateJob) -> Self {
        Self {
            job,
            #[cfg(feature = "trace_aggregation_update")]
            span: Some(Span::current()),
        }
    }

    fn entered(self) -> AggregationUpdateJobGuard {
        AggregationUpdateJobGuard {
            job: self.job,
            #[cfg(feature = "trace_aggregation_update")]
            _guard: self.span.map(|s| s.entered()),
        }
    }
}

struct AggregationUpdateJobGuard {
    job: AggregationUpdateJob,
    #[cfg(feature = "trace_aggregation_update")]
    _guard: Option<tracing::span::EnteredSpan>,
}

/// A balancing job that is enqueued. See `balance_edge`.
#[derive(Encode, Decode, Clone)]
struct BalanceJob {
    upper_id: TaskId,
    task_id: TaskId,
    #[cfg(feature = "trace_aggregation_update")]
    #[bincode(skip, default)]
    span: Option<Span>,
}

impl BalanceJob {
    fn new(upper: TaskId, task: TaskId) -> Self {
        Self {
            upper_id: upper,
            task_id: task,
            #[cfg(feature = "trace_aggregation_update")]
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
#[derive(Encode, Decode, Clone)]
struct OptimizeJob {
    task_id: TaskId,
    #[cfg(feature = "trace_aggregation_update")]
    #[bincode(skip, default)]
    span: Option<Span>,
}

impl OptimizeJob {
    fn new(task: TaskId) -> Self {
        Self {
            task_id: task,
            #[cfg(feature = "trace_aggregation_update")]
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
#[derive(Encode, Decode, Clone)]
struct FindAndScheduleJob {
    task_id: TaskId,
    #[cfg(feature = "trace_find_and_schedule")]
    #[bincode(skip, default)]
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

/// Encodes the jobs in the queue. This is used to filter out transient jobs during encoding.
mod encode_jobs {
    use bincode::{
        de::{BorrowDecoder, Decoder},
        enc::Encoder,
        error::{DecodeError, EncodeError},
    };

    use super::*;

    pub fn encode<E: Encoder>(
        jobs: &VecDeque<AggregationUpdateJobItem>,
        encoder: &mut E,
    ) -> Result<(), EncodeError> {
        usize::encode(&jobs.len(), encoder)?;
        for job in jobs {
            match job.job {
                AggregationUpdateJob::IncreaseActiveCount { .. }
                | AggregationUpdateJob::IncreaseActiveCounts { .. }
                | AggregationUpdateJob::DecreaseActiveCount { .. }
                | AggregationUpdateJob::DecreaseActiveCounts { .. } => {
                    AggregationUpdateJobItem {
                        job: AggregationUpdateJob::Noop,
                        #[cfg(feature = "trace_aggregation_update")]
                        span: None,
                    }
                    .encode(encoder)?;
                }
                _ => {
                    job.encode(encoder)?;
                }
            }
        }
        Ok(())
    }

    pub fn decode<Context, D: Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<VecDeque<AggregationUpdateJobItem>, DecodeError> {
        let len = usize::decode(decoder)?;
        let mut jobs = VecDeque::with_capacity(len);
        for _ in 0..len {
            jobs.push_back(Decode::decode(decoder)?);
        }
        Ok(jobs)
    }

    pub fn borrow_decode<'de, Context, D: BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<VecDeque<AggregationUpdateJobItem>, DecodeError> {
        decode(decoder)
    }
}

/// A queue for aggregation update jobs.
#[derive(Default, Encode, Decode, Clone)]
pub struct AggregationUpdateQueue {
    #[bincode(with = "encode_jobs")]
    jobs: VecDeque<AggregationUpdateJobItem>,
    #[bincode(with = "turbo_bincode::indexmap")]
    number_updates: FxIndexMap<TaskId, AggregationNumberUpdate>,
    done_number_updates: FxHashMap<TaskId, AggregationNumberUpdate>,
    #[bincode(with = "turbo_bincode::ringset")]
    find_and_schedule: FxRingSet<FindAndScheduleJob>,
    #[bincode(with = "turbo_bincode::ringset")]
    balance_queue: FxRingSet<BalanceJob>,
    #[bincode(with = "turbo_bincode::ringset")]
    optimize_queue: FxRingSet<OptimizeJob>,
}

impl AggregationUpdateQueue {
    /// Creates a new empty queue.
    pub fn new() -> Self {
        Self {
            jobs: VecDeque::with_capacity(0),
            number_updates: FxIndexMap::default(),
            done_number_updates: FxHashMap::default(),
            find_and_schedule: FxRingSet::default(),
            balance_queue: FxRingSet::default(),
            optimize_queue: FxRingSet::default(),
        }
    }

    /// Returns true, when the queue is empty.
    pub fn is_empty(&self) -> bool {
        let Self {
            jobs,
            number_updates,
            find_and_schedule,
            balance_queue,
            optimize_queue,
            done_number_updates: _,
        } = self;
        jobs.is_empty()
            && number_updates.is_empty()
            && find_and_schedule.is_empty()
            && balance_queue.is_empty()
            && optimize_queue.is_empty()
    }

    /// Pushes a job to the queue.
    pub fn push(&mut self, job: AggregationUpdateJob) {
        match job {
            AggregationUpdateJob::UpdateAggregationNumber {
                task_id,
                base_aggregation_number,
                distance,
            } => {
                match self.number_updates.entry(task_id) {
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
                        match self.done_number_updates.entry(task_id) {
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
                            #[cfg(feature = "trace_aggregation_update")]
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

    /// Pushes a job to optimize a task.
    fn push_optimize_task(&mut self, task_id: TaskId) {
        self.optimize_queue.push_back(OptimizeJob::new(task_id));
    }

    /// Runs the job and all dependent jobs until it's done. It can persist the operation, so
    /// following code might not be executed when persisted.
    pub fn run(job: AggregationUpdateJob, ctx: &mut impl ExecuteContext) {
        let mut queue = Self::new();
        queue.push(job);
        queue.execute(ctx);
    }

    /// Executes a single step of the queue. Returns true, when the queue is empty.
    pub fn process(&mut self, ctx: &mut impl ExecuteContext) -> bool {
        if let Some(job) = self.jobs.pop_front() {
            let job: AggregationUpdateJobGuard = job.entered();
            match job.job {
                AggregationUpdateJob::Noop => {}
                AggregationUpdateJob::UpdateAggregationNumber { .. }
                | AggregationUpdateJob::BalanceEdge { .. } => {
                    // These jobs are never pushed to the queue
                    unreachable!();
                }
                AggregationUpdateJob::InnerOfUppersHasNewFollowers(mut boxed) => {
                    let InnerOfUppersHasNewFollowersJob {
                        upper_ids,
                        new_follower_ids,
                    } = &mut *boxed;
                    let uppers = upper_ids.len();
                    let followers = new_follower_ids.len();
                    if uppers == 1 && followers == 1 {
                        self.inner_of_upper_has_new_follower(
                            ctx,
                            new_follower_ids[0],
                            upper_ids[0],
                        );
                    } else if uppers > followers {
                        if let Some(new_follower_id) = new_follower_ids.pop() {
                            let upper_ids = if !new_follower_ids.is_empty() {
                                let upper_ids = upper_ids.clone();
                                self.jobs.push_front(AggregationUpdateJobItem::new(
                                    AggregationUpdateJob::InnerOfUppersHasNewFollowers(boxed),
                                ));
                                upper_ids
                            } else {
                                take(upper_ids)
                            };
                            self.inner_of_uppers_has_new_follower(ctx, new_follower_id, upper_ids);
                        }
                    } else if let Some(upper_id) = upper_ids.pop() {
                        let new_follower_ids = if !upper_ids.is_empty() {
                            let new_follower_ids = new_follower_ids.clone();
                            self.jobs.push_front(AggregationUpdateJobItem::new(
                                AggregationUpdateJob::InnerOfUppersHasNewFollowers(boxed),
                            ));
                            new_follower_ids
                        } else {
                            take(new_follower_ids)
                        };
                        self.inner_of_upper_has_new_followers(ctx, new_follower_ids, upper_id);
                    }
                }
                AggregationUpdateJob::InnerOfUppersHasNewFollower {
                    upper_ids,
                    new_follower_id,
                } => {
                    if upper_ids.len() == 1 {
                        self.inner_of_upper_has_new_follower(ctx, new_follower_id, upper_ids[0]);
                    } else {
                        self.inner_of_uppers_has_new_follower(ctx, new_follower_id, upper_ids);
                    }
                }
                AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                    upper_id,
                    new_follower_ids,
                } => {
                    if new_follower_ids.len() == 1 {
                        self.inner_of_upper_has_new_follower(ctx, new_follower_ids[0], upper_id);
                    } else {
                        self.inner_of_upper_has_new_followers(ctx, new_follower_ids, upper_id);
                    }
                }
                AggregationUpdateJob::InnerOfUpperHasNewFollower {
                    upper_id,
                    new_follower_id,
                } => {
                    self.inner_of_upper_has_new_follower(ctx, new_follower_id, upper_id);
                }
                AggregationUpdateJob::InnerOfUppersLostFollowers(mut boxed) => {
                    let InnerOfUppersLostFollowersJob {
                        upper_ids,
                        lost_follower_ids,
                    } = &mut *boxed;
                    if upper_ids.len() > lost_follower_ids.len() {
                        if let Some(lost_follower_id) = lost_follower_ids.pop() {
                            let upper_ids = if !lost_follower_ids.is_empty() {
                                let upper_ids = upper_ids.clone();
                                self.jobs.push_front(AggregationUpdateJobItem::new(
                                    AggregationUpdateJob::InnerOfUppersLostFollowers(boxed),
                                ));
                                upper_ids
                            } else {
                                take(upper_ids)
                            };
                            self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids, 0);
                        }
                    } else if let Some(upper_id) = upper_ids.pop() {
                        let lost_follower_ids = if !upper_ids.is_empty() {
                            let lost_follower_ids = lost_follower_ids.clone();
                            self.jobs.push_front(AggregationUpdateJobItem::new(
                                AggregationUpdateJob::InnerOfUppersLostFollowers(boxed),
                            ));
                            lost_follower_ids
                        } else {
                            take(lost_follower_ids)
                        };
                        self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id, 0);
                    }
                }
                AggregationUpdateJob::InnerOfUppersLostFollower {
                    upper_ids,
                    lost_follower_id,
                    retry,
                } => {
                    self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids, retry);
                }
                AggregationUpdateJob::InnerOfUpperLostFollowers {
                    upper_id,
                    lost_follower_ids,
                    retry,
                } => {
                    self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id, retry);
                }
                AggregationUpdateJob::AggregatedDataUpdate(box AggregatedDataUpdateJob {
                    upper_ids,
                    update,
                }) => {
                    self.aggregated_data_update(upper_ids, ctx, update);
                }
                AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                    task_ids,
                    #[cfg(feature = "trace_task_dirty")]
                    collectible_type,
                } => {
                    for task_id in task_ids {
                        make_task_dirty(
                            task_id,
                            #[cfg(feature = "trace_task_dirty")]
                            TaskDirtyCause::CollectiblesChange { collectible_type },
                            self,
                            ctx,
                        );
                    }
                }
                AggregationUpdateJob::DecreaseActiveCount { task } => {
                    self.decrease_active_count(ctx, task);
                }
                AggregationUpdateJob::DecreaseActiveCounts { mut task_ids } => {
                    if let Some(task_id) = task_ids.pop() {
                        self.decrease_active_count(ctx, task_id);
                        if !task_ids.is_empty() {
                            self.jobs.push_front(AggregationUpdateJobItem::new(
                                AggregationUpdateJob::DecreaseActiveCounts { task_ids },
                            ));
                        }
                    }
                }
                AggregationUpdateJob::IncreaseActiveCount { task } => {
                    self.increase_active_count(ctx, task);
                }
                AggregationUpdateJob::IncreaseActiveCounts { mut task_ids } => {
                    if let Some(task_id) = task_ids.pop() {
                        self.increase_active_count(ctx, task_id);
                        if !task_ids.is_empty() {
                            self.jobs.push_front(AggregationUpdateJobItem::new(
                                AggregationUpdateJob::IncreaseActiveCounts { task_ids },
                            ));
                        }
                    }
                }
            }
            false
        } else if !self.number_updates.is_empty() {
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some((
                    task_id,
                    AggregationNumberUpdate {
                        base_aggregation_number,
                        distance,
                        #[cfg(feature = "trace_aggregation_update")]
                        span,
                    },
                )) = self.number_updates.pop()
                {
                    #[cfg(feature = "trace_aggregation_update")]
                    let _guard = span.map(|s| s.entered());
                    self.done_number_updates.insert(
                        task_id,
                        AggregationNumberUpdate {
                            base_aggregation_number,
                            distance,
                            #[cfg(feature = "trace_aggregation_update")]
                            span: None,
                        },
                    );
                    self.update_aggregation_number(ctx, task_id, distance, base_aggregation_number);
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else if !self.balance_queue.is_empty() {
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some(BalanceJob {
                    upper_id: upper,
                    task_id: task,
                    #[cfg(feature = "trace_aggregation_update")]
                    span,
                }) = self.balance_queue.pop_front()
                {
                    #[cfg(feature = "trace_aggregation_update")]
                    let _guard = span.map(|s| s.entered());
                    self.balance_edge(ctx, upper, task);
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else if let Some(OptimizeJob {
            task_id,
            #[cfg(feature = "trace_aggregation_update")]
            span,
        }) = self.optimize_queue.pop_front()
        {
            // Note: We must process one optimization completely before starting with the next one.
            // Otherwise this could lead to optimizing every node of a subgraph of inner nodes, as
            // all have the same upper count. Optimizing the root first
            #[cfg(feature = "trace_aggregation_update")]
            let _guard = span.map(|s| s.entered());
            self.optimize_task(ctx, task_id);
            false
        } else if !self.find_and_schedule.is_empty() {
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some(FindAndScheduleJob {
                    task_id,
                    #[cfg(feature = "trace_find_and_schedule")]
                    span,
                }) = self.find_and_schedule.pop_front()
                {
                    #[cfg(feature = "trace_find_and_schedule")]
                    let _guard = span.map(|s| s.entered());
                    self.find_and_schedule_dirty(task_id, ctx);
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else {
            true
        }
    }

    /// Balances the edge between two tasks. This checks if the graph invariant is still met for
    /// this edge and coverts a upper edge to a follower edge or vice versa. Balancing might
    /// triggers more changes to the structure.
    ///
    /// It locks both tasks simultaneously to atomically change the edges.
    fn balance_edge(&mut self, ctx: &mut impl ExecuteContext, upper_id: TaskId, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("process balance edge").entered();

        let (mut upper, mut task) = ctx.task_pair(
            upper_id,
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        let upper_aggregation_number = get_aggregation_number(&upper);
        let task_aggregation_number = get_aggregation_number(&task);

        let should_be_inner = is_root_node(upper_aggregation_number)
            || upper_aggregation_number > task_aggregation_number;
        let should_be_follower = task_aggregation_number > upper_aggregation_number;

        if should_be_inner {
            // remove all follower edges
            let count = remove!(upper, Follower { task: task_id }).unwrap_or_default();
            match count.cmp(&0) {
                std::cmp::Ordering::Less => upper.add_new(CachedDataItem::Follower {
                    task: task_id,
                    value: count,
                }),
                std::cmp::Ordering::Greater => {
                    #[cfg(feature = "trace_aggregation_update")]
                    let _span = trace_span!("make inner").entered();

                    if count!(upper, Follower).is_power_of_two() {
                        self.push_optimize_task(upper_id);
                    }

                    let upper_ids = get_uppers(&upper);

                    // Add the same amount of upper edges
                    if update_count!(task, Upper { task: upper_id }, count) {
                        if count!(task, Upper).is_power_of_two() {
                            self.push_optimize_task(task_id);
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
                                    upper_ids: upper_ids.clone(),
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

                        if ctx.should_track_activeness()
                            && upper.has_key(&CachedDataItemKey::Activeness {})
                        {
                            // If the upper node is has `Activeness` we need to schedule the
                            // dirty tasks in the new dirty container
                            self.push_find_and_schedule_dirty(task_id);
                        }
                    }

                    // notify uppers about lost follower
                    if !upper_ids.is_empty() {
                        self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                            upper_ids,
                            lost_follower_id: task_id,
                            retry: 0,
                        });
                    }

                    if ctx.should_track_activeness() {
                        // Follower was removed, we might need to update the active count
                        let has_active_count =
                            get!(upper, Activeness).is_some_and(|a| a.active_counter > 0);
                        if has_active_count {
                            // TODO combine both operations to avoid the clone
                            self.push(AggregationUpdateJob::DecreaseActiveCount { task: task_id })
                        }
                    }
                }
                std::cmp::Ordering::Equal => {}
            }
        } else if should_be_follower {
            // Remove the upper edge
            let count = remove!(task, Upper { task: upper_id }).unwrap_or_default();
            match count.cmp(&0) {
                Ordering::Less => task.add_new(CachedDataItem::Upper {
                    task: upper_id,
                    value: count,
                }),
                Ordering::Greater => {
                    #[cfg(feature = "trace_aggregation_update")]
                    let _span = trace_span!("make follower").entered();

                    let upper_ids = get_uppers(&upper);

                    // Add the same amount of follower edges
                    if update_count!(upper, Follower { task: task_id }, count) {
                        // May optimize the task
                        if count!(upper, Follower).is_power_of_two() {
                            self.push_optimize_task(upper_id);
                        }
                        if ctx.should_track_activeness() {
                            // update active count
                            let has_active_count =
                                get!(upper, Activeness).is_some_and(|a| a.active_counter > 0);
                            if has_active_count {
                                self.push(AggregationUpdateJob::IncreaseActiveCount {
                                    task: task_id,
                                });
                            }
                        }
                        // notify uppers about new follower
                        if !upper_ids.is_empty() {
                            self.push(AggregationUpdateJob::InnerOfUppersHasNewFollower {
                                upper_ids: upper_ids.clone(),
                                new_follower_id: task_id,
                            });
                        }
                    }

                    // Since this is no longer an inner node, update the aggregated data and
                    // followers
                    let data = AggregatedDataUpdate::from_task(&mut task).invert();
                    let followers = get_followers(&task);
                    let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                    if !upper_ids.is_empty() && !diff.is_empty() {
                        self.push(
                            AggregatedDataUpdateJob {
                                upper_ids: upper_ids.clone(),
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
                }
                Ordering::Equal => {}
            }
        } else {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("conflict").entered();

            // both nodes have the same aggregation number
            // We need to change the aggregation number of the task
            let current = get!(task, AggregationNumber).copied().unwrap_or_default();
            self.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id,
                base_aggregation_number: current.base + 1,
                distance: None,
            });
        }
    }

    /// Schedules the task if it's dirty.
    ///
    /// Only used when activeness is tracked.
    fn find_and_schedule_dirty(&mut self, task_id: TaskId, ctx: &mut impl ExecuteContext) {
        #[cfg(feature = "trace_find_and_schedule")]
        let _span = trace_span!(
            "find and schedule",
            %task_id,
            name = ctx.get_task_description(task_id)
        )
        .entered();
        let task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        self.find_and_schedule_dirty_internal(task_id, task, ctx);
    }

    fn find_and_schedule_dirty_internal(
        &mut self,
        task_id: TaskId,
        mut task: impl TaskGuard,
        ctx: &mut impl ExecuteContext<'_>,
    ) {
        // Task need to be scheduled if it's dirty or doesn't have output
        let dirty = task.is_dirty();
        let should_schedule = if dirty {
            Some(TaskExecutionReason::ActivateDirty)
        } else if !task.has_key(&CachedDataItemKey::Output {}) {
            Some(TaskExecutionReason::ActivateInitial)
        } else {
            None
        };

        // if it has `Activeness` we can skip visiting the nested nodes since
        // this would already be scheduled by the `Activeness`
        let is_active_until_clean = get!(task, Activeness).is_some_and(|a| a.active_until_clean);
        if !is_active_until_clean {
            let mut dirty_containers = task.dirty_containers().peekable();
            let is_empty = dirty_containers.peek().is_none();
            if !is_empty || dirty {
                self.extend_find_and_schedule_dirty(dirty_containers);

                let activeness_state =
                    get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id));
                activeness_state.set_active_until_clean();
            }
        }
        if let Some(reason) = should_schedule {
            let description = || ctx.get_task_desc_fn(task_id);
            if task.add(CachedDataItem::new_scheduled(reason, description)) {
                drop(task);
                ctx.schedule(task_id);
            }
        }
    }

    fn aggregated_data_update(
        &mut self,
        upper_ids: TaskIdVec,
        ctx: &mut impl ExecuteContext,
        update: AggregatedDataUpdate,
    ) {
        // For performance reasons this should stay `Meta` and not `All`
        ctx.for_each_task_meta(upper_ids.iter().copied(), |mut upper, ctx| {
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
        });
    }

    fn inner_of_uppers_lost_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        lost_follower_id: TaskId,
        mut upper_ids: TaskIdVec,
        mut retry: u16,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("lost follower (n uppers)", uppers = upper_ids.len()).entered();

        // see documentation of `retry_loop` for more information why this is needed
        let result = retry_loop(retry, || {
            let mut follower = ctx.task(
                lost_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            let mut removed_uppers = SmallVec::new();
            swap_retain(&mut upper_ids, |&mut upper_id| {
                let mut keep_upper = false;
                let mut follower_in_upper = false;

                update!(follower, Upper { task: upper_id }, |old| {
                    let Some(old) = old else {
                        follower_in_upper = true;
                        return None;
                    };
                    if old == 1 {
                        keep_upper = true;
                        removed_uppers.push(upper_id);
                        return None;
                    }
                    Some(old - 1)
                });
                follower_in_upper
            });
            if !removed_uppers.is_empty() {
                let data = AggregatedDataUpdate::from_task(&mut follower).invert();
                let followers = get_followers(&follower);
                drop(follower);

                if !data.is_empty() {
                    // remove data from upper
                    // For performance reasons this should stay `Meta` and not `All`
                    ctx.for_each_task_meta(removed_uppers.iter().copied(), |mut upper, ctx| {
                        let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                        if !diff.is_empty() {
                            let upper_ids = get_uppers(&upper);
                            self.push(
                                AggregatedDataUpdateJob {
                                    upper_ids,
                                    update: diff,
                                }
                                .into(),
                            )
                        }
                    });
                }
                if !followers.is_empty() {
                    self.push(
                        InnerOfUppersLostFollowersJob {
                            upper_ids: removed_uppers.clone(),
                            lost_follower_ids: followers,
                        }
                        .into(),
                    );
                }
            } else {
                drop(follower);
            }

            if upper_ids.is_empty() {
                return ControlFlow::Break(());
            }
            swap_retain(&mut upper_ids, |&mut upper_id| {
                let mut upper = ctx.task(
                    upper_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    TaskDataCategory::Meta,
                );
                let mut inner_in_upper = false;
                let mut removed_follower = false;
                update!(
                    upper,
                    Follower {
                        task: lost_follower_id
                    },
                    |old| {
                        let Some(old) = old else {
                            inner_in_upper = true;
                            return None;
                        };
                        if old == 1 {
                            removed_follower = true;
                            return None;
                        }
                        Some(old - 1)
                    }
                );
                if removed_follower {
                    // May optimize the task
                    if count!(upper, Follower).is_power_of_two() {
                        self.push_optimize_task(upper_id);
                    }

                    let has_active_count = ctx.should_track_activeness()
                        && get!(upper, Activeness).is_some_and(|a| a.active_counter > 0);
                    let upper_ids = get_uppers(&upper);
                    drop(upper);
                    // update active count
                    if has_active_count {
                        self.push(AggregationUpdateJob::DecreaseActiveCount {
                            task: lost_follower_id,
                        });
                    }
                    // notify uppers about lost follower
                    if !upper_ids.is_empty() {
                        self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                            upper_ids,
                            lost_follower_id,
                            retry: 0,
                        });
                    }
                }
                inner_in_upper
            });
            if upper_ids.is_empty() {
                return ControlFlow::Break(());
            }
            ControlFlow::Continue(())
        });
        if result.is_err() {
            retry += 1;
            if retry > MAX_RETRIES {
                panic!(
                    "inner_of_uppers_lost_follower is not able to remove follower \
                     {lost_follower_id} ({}) from {} as they don't exist as upper or follower \
                     edges",
                    ctx.get_task_description(lost_follower_id),
                    upper_ids
                        .iter()
                        .map(|id| format!("{} ({})", id, ctx.get_task_description(*id)))
                        .collect::<Vec<_>>()
                        .join(", ")
                );
            }
            self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                upper_ids,
                lost_follower_id,
                retry,
            });
        }
    }

    fn inner_of_upper_lost_followers(
        &mut self,
        ctx: &mut impl ExecuteContext,
        mut lost_follower_ids: TaskIdVec,
        upper_id: TaskId,
        mut retry: u16,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!(
            "lost follower (n follower)",
            followers = lost_follower_ids.len()
        )
        .entered();

        // see documentation of `retry_loop` for more information why this is needed
        let result = retry_loop(retry, || {
            swap_retain(&mut lost_follower_ids, |&mut lost_follower_id| {
                let mut follower = ctx.task(
                    lost_follower_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    TaskDataCategory::Meta,
                );
                let mut remove_upper = false;
                let mut follower_in_upper = false;
                update!(follower, Upper { task: upper_id }, |old| {
                    let Some(old) = old else {
                        follower_in_upper = true;
                        return None;
                    };
                    if old == 1 {
                        remove_upper = true;
                        return None;
                    }
                    Some(old - 1)
                });
                if remove_upper {
                    let data = AggregatedDataUpdate::from_task(&mut follower).invert();
                    let followers = get_followers(&follower);
                    drop(follower);

                    if !data.is_empty() {
                        // remove data from upper
                        let mut upper = ctx.task(
                            upper_id,
                            // For performance reasons this should stay `Meta` and not `All`
                            TaskDataCategory::Meta,
                        );
                        let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                        if !diff.is_empty() {
                            let upper_ids = get_uppers(&upper);
                            self.push(
                                AggregatedDataUpdateJob {
                                    upper_ids,
                                    update: diff,
                                }
                                .into(),
                            )
                        }
                    }
                    if !followers.is_empty() {
                        self.push(AggregationUpdateJob::InnerOfUpperLostFollowers {
                            upper_id,
                            lost_follower_ids: followers,
                            retry: 0,
                        });
                    }
                } else {
                    drop(follower);
                }
                follower_in_upper
            });
            if lost_follower_ids.is_empty() {
                return ControlFlow::Break(());
            }
            swap_retain(&mut lost_follower_ids, |&mut lost_follower_id| {
                let mut upper = ctx.task(
                    upper_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    TaskDataCategory::Meta,
                );
                let mut inner_in_upper = false;
                let mut removed_follower = false;
                update!(
                    upper,
                    Follower {
                        task: lost_follower_id
                    },
                    |old| {
                        let Some(old) = old else {
                            inner_in_upper = true;
                            return None;
                        };
                        if old == 1 {
                            removed_follower = true;
                            return None;
                        }
                        Some(old - 1)
                    }
                );
                if removed_follower {
                    // May optimize the task
                    if count!(upper, Follower).is_power_of_two() {
                        self.push_optimize_task(upper_id);
                    }

                    let upper_ids = get_uppers(&upper);
                    let has_active_count =
                        get!(upper, Activeness).is_some_and(|a| a.active_counter > 0);
                    drop(upper);
                    // update active count
                    if has_active_count {
                        self.push(AggregationUpdateJob::DecreaseActiveCount {
                            task: lost_follower_id,
                        });
                    }
                    // notify uppers about lost follower
                    if !upper_ids.is_empty() {
                        self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                            upper_ids,
                            lost_follower_id,
                            retry: 0,
                        });
                    }
                }
                inner_in_upper
            });
            if lost_follower_ids.is_empty() {
                return ControlFlow::Break(());
            }
            ControlFlow::Continue(())
        });
        if result.is_err() {
            retry += 1;
            if retry > MAX_RETRIES {
                panic!(
                    "inner_of_upper_lost_followers is not able to remove followers {} from \
                     {upper_id} ({}) as they don't exist as upper or follower edges",
                    lost_follower_ids
                        .iter()
                        .map(|id| format!("{} ({})", id, ctx.get_task_description(*id)))
                        .collect::<Vec<_>>()
                        .join(", "),
                    ctx.get_task_description(upper_id),
                )
            }
            self.push(AggregationUpdateJob::InnerOfUpperLostFollowers {
                upper_id,
                lost_follower_ids,
                retry,
            });
        }
    }

    fn inner_of_uppers_has_new_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        new_follower_id: TaskId,
        mut upper_ids: TaskIdVec,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span =
            trace_span!("process new follower (n uppers)", uppers = upper_ids.len()).entered();

        let follower_aggregation_number = {
            let follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            get_aggregation_number(&follower)
        };
        let mut upper_upper_ids_with_new_follower = SmallVec::new();
        let mut tasks_for_which_increment_active_count = SmallVec::new();
        let mut is_active = false;

        swap_retain(&mut upper_ids, |&mut upper_id| {
            let mut upper = ctx.task(
                upper_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            // decide if it should be an inner or follower
            let upper_aggregation_number = get_aggregation_number(&upper);

            if !is_root_node(upper_aggregation_number)
                && upper_aggregation_number <= follower_aggregation_number
            {
                // It's a follower of the upper node
                if update_count!(
                    upper,
                    Follower {
                        task: new_follower_id
                    },
                    1
                ) {
                    // May optimize the task
                    if count!(upper, Follower).is_power_of_two() {
                        self.push_optimize_task(upper_id);
                    }

                    if ctx.should_track_activeness() {
                        // update active count
                        let has_active_count =
                            get!(upper, Activeness).is_some_and(|a| a.active_counter > 0);
                        if has_active_count {
                            tasks_for_which_increment_active_count.push(new_follower_id);
                        }
                    }
                    // notify uppers about new follower
                    upper_upper_ids_with_new_follower.extend(iter_uppers(&upper));
                }

                // Balancing is only needed when they are equal. This is not perfect from
                // concurrent perspective, but we can accept a few incorrect
                // invariants in the graph.
                if upper_aggregation_number == follower_aggregation_number {
                    self.push(AggregationUpdateJob::BalanceEdge {
                        upper_id,
                        task_id: new_follower_id,
                    });
                }
                false
            } else {
                // It's an inner node, continue with the list
                if ctx.should_track_activeness() && upper.has_key(&CachedDataItemKey::Activeness {})
                {
                    is_active = true;
                }
                true
            }
        });

        if !upper_ids.is_empty() {
            let mut follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            let mut uppers_count: Option<usize> = None;
            let mut persistent_uppers = 0;
            swap_retain(&mut upper_ids, |&mut upper_id| {
                if update_count!(follower, Upper { task: upper_id }, 1) {
                    // It's a new upper
                    let uppers_count = uppers_count.get_or_insert_with(|| {
                        let count =
                            iter_many!(follower, Upper { .. } count if *count > 0 => ()).count();
                        count - 1
                    });
                    *uppers_count += 1;
                    if !upper_id.is_transient() {
                        persistent_uppers += 1;
                    }

                    true
                } else {
                    // It's already an upper
                    false
                }
            });
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new inner").entered();
            if !upper_ids.is_empty() {
                let new_count = count!(follower, Upper);
                if (new_count - persistent_uppers).next_power_of_two()
                    != new_count.next_power_of_two()
                {
                    self.push_optimize_task(new_follower_id);
                }

                let data = AggregatedDataUpdate::from_task(&mut follower);
                let children = get_followers(&follower);
                drop(follower);

                let has_data = !data.is_empty();
                if has_data || !is_active {
                    // add data to upper
                    // For performance reasons this should stay `Meta` and not `All`
                    ctx.for_each_task_meta(upper_ids.iter().copied(), |mut upper, ctx| {
                        if has_data {
                            let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                            if !diff.is_empty() {
                                let upper_ids = get_uppers(&upper);
                                self.push(
                                    AggregatedDataUpdateJob {
                                        upper_ids,
                                        update: diff,
                                    }
                                    .into(),
                                )
                            }
                        }
                        if !is_active {
                            // We need to check this again, since this might have changed in the
                            // meantime due to race conditions
                            if upper.has_key(&CachedDataItemKey::Activeness {}) {
                                is_active = true;
                            }
                        }
                    });
                }
                if !children.is_empty() {
                    self.push(
                        InnerOfUppersHasNewFollowersJob {
                            upper_ids: upper_ids.clone(),
                            new_follower_ids: children,
                        }
                        .into(),
                    );
                }
            } else {
                drop(follower);
            }
        }
        if is_active {
            self.push_find_and_schedule_dirty(new_follower_id);
        }
        if !tasks_for_which_increment_active_count.is_empty() {
            self.push(AggregationUpdateJob::IncreaseActiveCounts {
                task_ids: tasks_for_which_increment_active_count,
            });
        }
        if !upper_upper_ids_with_new_follower.is_empty() {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new follower").entered();
            self.push(AggregationUpdateJob::InnerOfUppersHasNewFollower {
                upper_ids: upper_upper_ids_with_new_follower,
                new_follower_id,
            });
        }
    }

    fn inner_of_upper_has_new_followers(
        &mut self,
        ctx: &mut impl ExecuteContext,
        new_follower_ids: TaskIdVec,
        upper_id: TaskId,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!(
            "process new follower (n followers)",
            followers = new_follower_ids.len()
        )
        .entered();

        let mut followers_with_aggregation_number = new_follower_ids
            .into_iter()
            .map(|new_follower_id| {
                let follower = ctx.task(
                    new_follower_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    TaskDataCategory::Meta,
                );
                (new_follower_id, get_aggregation_number(&follower))
            })
            .collect::<SmallVec<[_; 4]>>();

        let mut new_followers_of_upper_uppers = SmallVec::new();
        let mut is_active = false;
        let mut has_active_count = false;
        let mut upper_upper_ids_for_new_followers = SmallVec::new();
        let upper_aggregation_number;
        {
            let mut upper = ctx.task(
                upper_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            if ctx.should_track_activeness() {
                let activeness_state = get!(upper, Activeness);
                is_active = activeness_state.is_some();
                has_active_count = activeness_state.is_some_and(|a| a.active_counter > 0);
            }
            // decide if it should be an inner or follower
            upper_aggregation_number = get_aggregation_number(&upper);

            if !is_root_node(upper_aggregation_number) {
                followers_with_aggregation_number.retain(
                    |(follower_id, follower_aggregation_number)| {
                        if upper_aggregation_number > *follower_aggregation_number {
                            // It's an inner node, continue with the list
                            return true;
                        }
                        // It's a follower of the upper node
                        if update_count!(upper, Follower { task: *follower_id }, 1) {
                            // May optimize the task
                            if count!(upper, Follower).is_power_of_two() {
                                self.push_optimize_task(upper_id);
                            }

                            new_followers_of_upper_uppers.push(*follower_id);
                        }
                        if upper_aggregation_number == *follower_aggregation_number {
                            // Balancing is only needed when they are equal. This is not
                            // perfect from concurrent perspective, but we
                            // can accept a few incorrect invariants in the graph.
                            self.push(AggregationUpdateJob::BalanceEdge {
                                upper_id,
                                task_id: *follower_id,
                            })
                        }
                        false
                    },
                );
            }

            if !new_followers_of_upper_uppers.is_empty() {
                upper_upper_ids_for_new_followers = get_uppers(&upper);
            }
        }

        let mut inner_tasks_with_aggregation_number = followers_with_aggregation_number;

        if !inner_tasks_with_aggregation_number.is_empty() {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new inner").entered();
            let mut upper_data_updates = Vec::new();
            let mut upper_new_followers = SmallVec::new();
            swap_retain(
                &mut inner_tasks_with_aggregation_number,
                |&mut (inner_id, _)| {
                    let mut inner = ctx.task(
                        inner_id,
                        // For performance reasons this should stay `Meta` and not `All`
                        TaskDataCategory::Meta,
                    );
                    if update_count!(inner, Upper { task: upper_id }, 1) {
                        if count!(inner, Upper).is_power_of_two() {
                            self.push_optimize_task(inner_id);
                        }

                        // It's a new upper
                        let data = AggregatedDataUpdate::from_task(&mut inner);
                        let children = get_followers(&inner);
                        let follower_aggregation_number = get_aggregation_number(&inner);
                        drop(inner);

                        if !data.is_empty() {
                            upper_data_updates.push(data);
                        }
                        upper_new_followers.extend(children);

                        // Balancing is only needed when they are equal (or could have become equal
                        // in the meantime). This is not perfect from
                        // concurrent perspective, but we can accept a few
                        // incorrect invariants in the graph.
                        if upper_aggregation_number <= follower_aggregation_number
                            && !is_root_node(upper_aggregation_number)
                        {
                            self.push(AggregationUpdateJob::BalanceEdge {
                                upper_id,
                                task_id: inner_id,
                            })
                        }
                        true
                    } else {
                        false
                    }
                },
            );

            if !upper_new_followers.is_empty() {
                self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                    upper_id,
                    new_follower_ids: upper_new_followers,
                });
            }
            if !upper_data_updates.is_empty() {
                // add data to upper
                let mut upper = ctx.task(
                    upper_id,
                    // For performance reasons this should stay `Meta` and not `All`
                    TaskDataCategory::Meta,
                );
                let diffs = upper_data_updates
                    .into_iter()
                    .filter_map(|data| {
                        let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                        (!diff.is_empty()).then_some(diff)
                    })
                    .collect::<Vec<_>>();
                let mut iter = diffs.into_iter();
                if let Some(mut diff) = iter.next() {
                    let upper_ids = get_uppers(&upper);
                    drop(upper);
                    // TODO merge AggregatedDataUpdate
                    for next_diff in iter {
                        self.push(
                            AggregatedDataUpdateJob {
                                upper_ids: upper_ids.clone(),
                                update: diff,
                            }
                            .into(),
                        );
                        diff = next_diff;
                    }
                    self.push(
                        AggregatedDataUpdateJob {
                            upper_ids,
                            update: diff,
                        }
                        .into(),
                    );
                }
            }
            if !inner_tasks_with_aggregation_number.is_empty() {
                if !is_active {
                    // We need to check this again, since this might have changed in the
                    // meantime due to race conditions
                    let upper = ctx.task(
                        upper_id,
                        // For performance reasons this should stay `Meta` and not `All`
                        TaskDataCategory::Meta,
                    );
                    is_active = upper.has_key(&CachedDataItemKey::Activeness {});
                }
                if is_active {
                    self.extend_find_and_schedule_dirty(
                        inner_tasks_with_aggregation_number
                            .into_iter()
                            .map(|(id, _)| id),
                    );
                }
            }
        }
        if !new_followers_of_upper_uppers.is_empty() {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new follower").entered();
            // update active count
            if has_active_count {
                // TODO combine both operations to avoid the clone
                self.push(AggregationUpdateJob::IncreaseActiveCounts {
                    task_ids: new_followers_of_upper_uppers.clone(),
                });
            }
            // notify uppers about new follower
            if !upper_upper_ids_for_new_followers.is_empty() {
                self.push(
                    InnerOfUppersHasNewFollowersJob {
                        upper_ids: upper_upper_ids_for_new_followers,
                        new_follower_ids: new_followers_of_upper_uppers,
                    }
                    .into(),
                );
            }
        }
    }

    fn inner_of_upper_has_new_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        new_follower_id: TaskId,
        upper_id: TaskId,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("process new follower").entered();

        let follower_aggregation_number = {
            let follower = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            get_aggregation_number(&follower)
        };

        let mut upper = ctx.task(
            upper_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        // decide if it should be an inner or follower
        let upper_aggregation_number = get_aggregation_number(&upper);

        if !is_root_node(upper_aggregation_number)
            && upper_aggregation_number <= follower_aggregation_number
        {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new follower").entered();

            // It's a follower of the upper node
            if update_count!(
                upper,
                Follower {
                    task: new_follower_id
                },
                1
            ) {
                // May optimize the task
                if count!(upper, Follower).is_power_of_two() {
                    self.push_optimize_task(upper_id);
                }

                let has_active_count = ctx.should_track_activeness()
                    && get!(upper, Activeness).is_some_and(|a| a.active_counter > 0);
                let upper_ids = get_uppers(&upper);
                drop(upper);
                // update active count
                if has_active_count {
                    self.push(AggregationUpdateJob::IncreaseActiveCount {
                        task: new_follower_id,
                    });
                }
                // notify uppers about new follower
                if !upper_ids.is_empty() {
                    self.push(AggregationUpdateJob::InnerOfUppersHasNewFollower {
                        upper_ids,
                        new_follower_id,
                    });
                }

                // Balancing is only needed when they are equal. This is not perfect from concurrent
                // perspective, but we can accept a few incorrect invariants in the
                // graph.
                if upper_aggregation_number == follower_aggregation_number {
                    self.push(AggregationUpdateJob::BalanceEdge {
                        upper_id,
                        task_id: new_follower_id,
                    });
                }
            }
        } else {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!("new inner").entered();

            // It's an inner node, continue with the list
            let mut is_active = upper.has_key(&CachedDataItemKey::Activeness {});
            drop(upper);

            let mut inner = ctx.task(
                new_follower_id,
                // For performance reasons this should stay `Meta` and not `All`
                TaskDataCategory::Meta,
            );
            if update_count!(inner, Upper { task: upper_id }, 1) {
                if count!(inner, Upper).is_power_of_two() {
                    self.push_optimize_task(new_follower_id);
                }
                // It's a new upper
                let data = AggregatedDataUpdate::from_task(&mut inner);
                let followers = get_followers(&inner);
                drop(inner);

                if !data.is_empty() {
                    // add data to upper
                    let mut upper = ctx.task(
                        upper_id,
                        // For performance reasons this should stay `Meta` and not `All`
                        TaskDataCategory::Meta,
                    );
                    let diff = data.apply(&mut upper, ctx.should_track_activeness(), self);
                    if !diff.is_empty() {
                        let upper_ids = get_uppers(&upper);
                        self.push(
                            AggregatedDataUpdateJob {
                                upper_ids,
                                update: diff,
                            }
                            .into(),
                        );
                    }
                }
                if !followers.is_empty() {
                    self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                        upper_id,
                        new_follower_ids: followers,
                    });
                }
                if !is_active {
                    let upper = ctx.task(
                        upper_id,
                        // For performance reasons this should stay `Meta` and not `All`
                        TaskDataCategory::Meta,
                    );
                    is_active = upper.has_key(&CachedDataItemKey::Activeness {});
                }
                if is_active {
                    self.push_find_and_schedule_dirty(new_follower_id);
                }
            }
        }
    }

    /// Decreases the active count of a task.
    ///
    /// Only used when activeness is tracked.
    fn decrease_active_count(&mut self, ctx: &mut impl ExecuteContext, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("decrease active count").entered();

        let mut task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        let state = get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id));
        let is_new = state.is_empty();
        let is_zero = state.decrement_active_counter();
        let is_empty = state.is_empty();
        if is_empty {
            task.remove(&CachedDataItemKey::Activeness {});
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
    fn increase_active_count(&mut self, ctx: &mut impl ExecuteContext, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("increase active count").entered();

        let mut task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        let state = get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id));
        let is_new = state.is_empty();
        let is_positive_now = state.increment_active_counter();
        let is_empty = state.is_empty();
        // This can happen if active count was negative before
        if is_empty {
            task.remove(&CachedDataItemKey::Activeness {});
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
        ctx: &mut impl ExecuteContext,
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
            TaskDataCategory::Meta,
        );
        let current = get!(task, AggregationNumber).copied().unwrap_or_default();
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
                task.insert(CachedDataItem::AggregationNumber {
                    value: AggregationNumber {
                        base: base_aggregation_number,
                        distance,
                        effective: old,
                    },
                });
            }
        } else {
            #[cfg(feature = "trace_aggregation_update")]
            let _span = trace_span!(
                "update aggregation number",
                task = ctx.get_task_description(task_id),
                old,
                aggregation_number
            )
            .entered();
            task.insert(CachedDataItem::AggregationNumber {
                value: AggregationNumber {
                    base: base_aggregation_number,
                    distance,
                    effective: aggregation_number,
                },
            });

            if !is_aggregating_node(old) && is_aggregating_node(aggregation_number) {
                // When converted from leaf to aggregating node, all children become
                // followers
                let children: Vec<_> = get_many!(task, Child { task } => task);
                task.extend_new(
                    CachedDataItemType::Follower,
                    children
                        .iter()
                        .map(|&task| CachedDataItem::Follower { task, value: 1 }),
                );
            }

            if is_aggregating_node(aggregation_number) {
                // followers might become inner nodes when the aggregation number is
                // increased
                let followers = iter_many!(task, Follower { task } count if *count > 0 => task);
                for follower_id in followers {
                    self.push(AggregationUpdateJob::BalanceEdge {
                        upper_id: task_id,
                        task_id: follower_id,
                    });
                }
                let uppers = iter_uppers(&task);
                for upper_id in uppers {
                    self.push(AggregationUpdateJob::BalanceEdge { upper_id, task_id });
                }
            } else {
                let children = iter_many!(task, Child { task } => task);
                for child_id in children {
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
    fn optimize_task(&mut self, ctx: &mut impl ExecuteContext<'_>, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("check optimize").entered();

        let task = ctx.task(
            task_id,
            // For performance reasons this should stay `Meta` and not `All`
            TaskDataCategory::Meta,
        );
        let aggregation_number = get!(task, AggregationNumber).copied().unwrap_or_default();
        if is_root_node(aggregation_number.effective) {
            return;
        }
        let follower_count = if is_aggregating_node(aggregation_number.effective) {
            let follower_count = count!(task, Follower);
            if follower_count == 0 {
                return;
            }
            follower_count
        } else {
            let children_count = count!(task, Child);
            if children_count == 0 {
                return;
            }
            children_count
        };
        let upper_count = count!(task, Upper);
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
            self.push_optimize_task(task_id);
        }
    }
}

impl Operation for AggregationUpdateQueue {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
        loop {
            ctx.operation_suspend_point(&self);
            if self.process(ctx) {
                return;
            }
        }
    }
}

struct RetryTimeout;

const MAX_YIELD_DURATION: Duration = Duration::from_millis(1);
const MAX_RETRIES: u16 = 60000;

/// Retry the passed function for a few milliseconds, while yielding to other threads.
/// Returns an error if the function was not able to complete and the timeout was reached.
///
/// Each graph modification will only lock one or two tasks at a time, but updates usually also
/// require follow-up updates to connected tasks. So an update will "slowly" propagate through the
/// graph. This can lead to the race condition when one update adds something and another update
/// removes the same thing. The "add" update might not be fully propagated through the graph yet and
/// the "remove" update can overtake the "add" update. When this happens the "remove" update is
/// unable to remove the things it wants to remove (because they have not been added by the "add"
/// update yet). So we will retry (with this method) removals until the thing is there. So this is
/// basically a busy loop that waits for the "add" update to complete. If the busy loop is not
/// successful, the update is added to the end of the queue again. This is important as the "add"
/// update might even be in the current thread and in the same queue. If that's the case yielding
/// won't help and the update need to be requeued.
fn retry_loop(mut retry: u16, mut f: impl FnMut() -> ControlFlow<()>) -> Result<(), RetryTimeout> {
    let mut time: Option<Instant> = None;
    loop {
        match f() {
            ControlFlow::Continue(()) => {}
            ControlFlow::Break(()) => return Ok(()),
        }
        if retry == 0 {
            return Err(RetryTimeout);
        }
        retry -= 1;
        yield_now();
        if let Some(t) = time {
            if t.elapsed() > MAX_YIELD_DURATION {
                return Err(RetryTimeout);
            }
        } else {
            time = Some(Instant::now());
        }
    }
}
