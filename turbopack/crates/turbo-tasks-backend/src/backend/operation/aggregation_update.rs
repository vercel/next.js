use std::{
    cmp::{max, Ordering},
    collections::{hash_map::Entry as HashMapEntry, VecDeque},
    hash::Hash,
    mem::take,
    num::NonZeroU32,
};

use indexmap::map::Entry;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{ser::SerializeSeq, Deserialize, Serialize, Serializer};
use smallvec::{smallvec, SmallVec};
#[cfg(any(
    feature = "trace_aggregation_update",
    feature = "trace_find_and_schedule"
))]
use tracing::{span::Span, trace_span};
use turbo_tasks::{FxIndexMap, SessionId, TaskId};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        get_mut, get_mut_or_insert_with,
        operation::{invalidate::make_task_dirty, ExecuteContext, Operation, TaskGuard},
        storage::{count, get, get_many, iter_many, remove, update, update_count},
        TaskDataCategory,
    },
    data::{
        ActivenessState, AggregationNumber, CachedDataItem, CachedDataItemKey, CollectibleRef,
        DirtyContainerCount,
    },
    utils::deque_set::DequeSet,
};

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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InnerOfUppersHasNewFollowersJob {
    pub upper_ids: TaskIdVec,
    pub new_follower_ids: TaskIdVec,
}

impl From<InnerOfUppersHasNewFollowersJob> for AggregationUpdateJob {
    fn from(job: InnerOfUppersHasNewFollowersJob) -> Self {
        AggregationUpdateJob::InnerOfUppersHasNewFollowers(Box::new(job))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct InnerOfUppersLostFollowersJob {
    pub upper_ids: TaskIdVec,
    pub lost_follower_ids: TaskIdVec,
}

impl From<InnerOfUppersLostFollowersJob> for AggregationUpdateJob {
    fn from(job: InnerOfUppersLostFollowersJob) -> Self {
        AggregationUpdateJob::InnerOfUppersLostFollowers(Box::new(job))
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
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
#[derive(Serialize, Deserialize, Clone, Debug)]
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
    },
    /// Notifies multiple upper tasks that one of its inner tasks has lost followers.
    InnerOfUppersLostFollowers(Box<InnerOfUppersLostFollowersJob>),
    /// Notifies an upper task that one of its inner tasks has lost followers.
    InnerOfUpperLostFollowers {
        upper_id: TaskId,
        lost_follower_ids: TaskIdVec,
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
    #[serde(skip)]
    IncreaseActiveCount { task: TaskId },
    /// Increases the active counters of the tasks
    #[serde(skip)]
    IncreaseActiveCounts { task_ids: TaskIdVec },
    /// Decreases the active counter of the task
    #[serde(skip)]
    DecreaseActiveCount { task: TaskId },
    /// Decreases the active counters of the tasks
    #[serde(skip)]
    DecreaseActiveCounts { task_ids: TaskIdVec },
    /// Balances the edges of the graph. This checks if the graph invariant is still met for this
    /// edge and coverts a upper edge to a follower edge or vice versa. Balancing might triggers
    /// more changes to the structure.
    BalanceEdge { upper_id: TaskId, task_id: TaskId },
    /// Does nothing. This is used to filter out transient jobs during serialization.
    Noop,
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

/// Aggregated data update.
#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct AggregatedDataUpdate {
    /// One of the inner tasks has changed its dirty state or aggregated dirty state.
    dirty_container_update: Option<(TaskId, DirtyContainerCount)>,
    /// One of the inner tasks has changed its collectibles count or aggregated collectibles count.
    collectibles_update: Vec<(CollectibleRef, i32)>,
}

impl AggregatedDataUpdate {
    /// Derives an `AggregatedDataUpdate` from a task. This is used when a task is connected to an
    /// upper task.
    fn from_task(task: &mut impl TaskGuard) -> Self {
        let aggregation = get_aggregation_number(task);
        let mut dirty_container_count = Default::default();
        let mut collectibles_update: Vec<_> =
            get_many!(task, Collectible { collectible } count => (collectible, *count));
        if is_aggregating_node(aggregation) {
            dirty_container_count = get!(task, AggregatedDirtyContainerCount)
                .cloned()
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
        if let Some(dirty) = get!(task, Dirty) {
            dirty_container_count.update_with_dirty_state(dirty);
        }

        let mut result = Self::new().collectibles_update(collectibles_update);
        if !dirty_container_count.is_zero() {
            let DirtyContainerCount {
                count,
                count_in_session,
            } = dirty_container_count;
            result = result.dirty_container_update(
                task.id(),
                DirtyContainerCount {
                    count: if count > 0 { 1 } else { 0 },
                    count_in_session: count_in_session.map(|(s, c)| (s, if c > 0 { 1 } else { 0 })),
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
        if let Some((_, value)) = dirty_container_update.as_mut() {
            *value = value.negate()
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
        session_id: SessionId,
        should_track_activeness: bool,
        queue: &mut AggregationUpdateQueue,
    ) -> AggregatedDataUpdate {
        let Self {
            dirty_container_update,
            collectibles_update,
        } = self;
        let mut result = Self::default();
        if let Some((dirty_container_id, count)) = dirty_container_update {
            if should_track_activeness {
                // When a dirty container count is increased and the task is considered as active
                // we need to schedule the dirty tasks in the new dirty container
                let current_session_update = count.get(session_id);
                if current_session_update > 0 && task.has_key(&CachedDataItemKey::Activeness {}) {
                    queue.push_find_and_schedule_dirty(*dirty_container_id)
                }
            }

            let mut aggregated_update = DirtyContainerCount::default();
            update!(
                task,
                AggregatedDirtyContainer {
                    task: *dirty_container_id
                },
                |old: Option<DirtyContainerCount>| {
                    let mut new = old.unwrap_or_default();
                    aggregated_update = new.update_count(count);
                    (!new.is_zero()).then_some(new)
                }
            );

            if !aggregated_update.is_zero() {
                let dirty_state = get!(task, Dirty).copied();
                let task_id = task.id();
                update!(task, AggregatedDirtyContainerCount, |old: Option<
                    DirtyContainerCount,
                >| {
                    let mut new = old.unwrap_or_default();
                    if let Some(dirty_state) = dirty_state {
                        new.update_with_dirty_state(&dirty_state);
                    }
                    let aggregated_update = new.update_count(&aggregated_update);
                    if let Some(dirty_state) = dirty_state {
                        new.undo_update_with_dirty_state(&dirty_state);
                    }
                    if !aggregated_update.is_zero() {
                        result.dirty_container_update = Some((task_id, aggregated_update));
                    }
                    (!new.is_zero()).then_some(new)
                });
                if let Some((_, count)) = result.dirty_container_update.as_ref() {
                    if count.get(session_id) < 0 {
                        // When the current task is no longer dirty, we need to fire the
                        // aggregate root events and do some cleanup
                        if let Some(root_state) = get_mut!(task, Activeness) {
                            root_state.all_clean_event.notify(usize::MAX);
                            root_state.unset_active_until_clean();
                            if root_state.is_empty() {
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
    pub fn dirty_container_update(mut self, task_id: TaskId, count: DirtyContainerCount) -> Self {
        self.dirty_container_update = Some((task_id, count));
        self
    }

    /// Adds a collectibles update to the update.
    pub fn collectibles_update(mut self, collectibles_update: Vec<(CollectibleRef, i32)>) -> Self {
        self.collectibles_update = collectibles_update;
        self
    }
}

/// An aggregation number update job that is enqueued.
#[derive(Serialize, Deserialize, Clone)]
struct AggregationNumberUpdate {
    base_aggregation_number: u32,
    distance: Option<NonZeroU32>,
    #[cfg(feature = "trace_aggregation_update")]
    #[serde(skip, default)]
    span: Option<Span>,
}

/// An aggregated data update job that is enqueued. See `AggregatedDataUpdate`.
#[derive(Serialize, Deserialize, Clone)]
struct AggregationUpdateJobItem {
    job: AggregationUpdateJob,
    #[cfg(feature = "trace_aggregation_update")]
    #[serde(skip, default)]
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
#[derive(Serialize, Deserialize, Clone)]
struct BalanceJob {
    upper_id: TaskId,
    task_id: TaskId,
    #[cfg(feature = "trace_aggregation_update")]
    #[serde(skip, default)]
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
#[derive(Serialize, Deserialize, Clone)]
struct OptimizeJob {
    task_id: TaskId,
    #[cfg(feature = "trace_aggregation_update")]
    #[serde(skip, default)]
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
#[derive(Serialize, Deserialize, Clone)]
struct FindAndScheduleJob {
    task_id: TaskId,
    #[cfg(feature = "trace_find_and_schedule")]
    #[serde(skip, default)]
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

/// Serializes the jobs in the queue. This is used to filter out transient jobs during
/// serialization.
fn serialize_jobs<S: Serializer>(
    jobs: &VecDeque<AggregationUpdateJobItem>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    let mut seq = serializer.serialize_seq(Some(jobs.len()))?;
    for job in jobs {
        match job.job {
            AggregationUpdateJob::IncreaseActiveCount { .. }
            | AggregationUpdateJob::IncreaseActiveCounts { .. }
            | AggregationUpdateJob::DecreaseActiveCount { .. }
            | AggregationUpdateJob::DecreaseActiveCounts { .. } => {
                seq.serialize_element(&AggregationUpdateJobItem {
                    job: AggregationUpdateJob::Noop,
                    #[cfg(feature = "trace_aggregation_update")]
                    span: None,
                })?;
            }
            _ => {
                seq.serialize_element(job)?;
            }
        }
    }
    seq.end()
}

/// A queue for aggregation update jobs.
#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregationUpdateQueue {
    #[serde(serialize_with = "serialize_jobs")]
    jobs: VecDeque<AggregationUpdateJobItem>,
    number_updates: FxIndexMap<TaskId, AggregationNumberUpdate>,
    done_number_updates: FxHashMap<TaskId, AggregationNumberUpdate>,
    find_and_schedule: DequeSet<FindAndScheduleJob>,
    done_find_and_schedule: FxHashSet<TaskId>,
    balance_queue: DequeSet<BalanceJob>,
    optimize_queue: DequeSet<OptimizeJob>,
}

impl AggregationUpdateQueue {
    /// Creates a new empty queue.
    pub fn new() -> Self {
        Self {
            jobs: VecDeque::with_capacity(0),
            number_updates: FxIndexMap::default(),
            done_number_updates: FxHashMap::default(),
            find_and_schedule: DequeSet::default(),
            done_find_and_schedule: FxHashSet::default(),
            balance_queue: DequeSet::default(),
            optimize_queue: DequeSet::default(),
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
            done_find_and_schedule: _,
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
                    .insert_back(BalanceJob::new(upper_id, task_id));
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
        if !self.done_find_and_schedule.contains(&task_id) {
            self.find_and_schedule
                .insert_back(FindAndScheduleJob::new(task_id));
        }
    }

    /// Extends the queue with multiple jobs to find and schedule dirty tasks.
    pub fn extend_find_and_schedule_dirty(&mut self, task_ids: impl IntoIterator<Item = TaskId>) {
        self.find_and_schedule.extend(
            task_ids
                .into_iter()
                .filter(|task_id| !self.done_find_and_schedule.contains(task_id))
                .map(FindAndScheduleJob::new),
        );
    }

    /// Pushes a job to optimize a task.
    fn push_optimize_task(&mut self, task_id: TaskId) {
        self.optimize_queue.insert_back(OptimizeJob::new(task_id));
    }

    /// Runs the job and all dependent jobs until it's done. It can persist the operation, so
    /// following code might not be executed when persisted.
    pub fn run(job: AggregationUpdateJob, ctx: &mut impl ExecuteContext) {
        debug_assert!(ctx.should_track_children());
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
                            self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids);
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
                        self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id);
                    }
                }
                AggregationUpdateJob::InnerOfUppersLostFollower {
                    upper_ids,
                    lost_follower_id,
                } => {
                    self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids);
                }
                AggregationUpdateJob::InnerOfUpperLostFollowers {
                    upper_id,
                    lost_follower_ids,
                } => {
                    self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id);
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

        let (mut upper, mut task) = ctx.task_pair(upper_id, task_id, TaskDataCategory::Meta);
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
                        let diff = data.apply(
                            &mut upper,
                            ctx.session_id(),
                            ctx.should_track_activeness(),
                            self,
                        );

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
                    let diff = data.apply(
                        &mut upper,
                        ctx.session_id(),
                        ctx.should_track_activeness(),
                        self,
                    );
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
        let task = ctx.task(task_id, TaskDataCategory::Meta);
        self.find_and_schedule_dirty_internal(task_id, task, ctx);
    }

    fn find_and_schedule_dirty_internal(
        &mut self,
        task_id: TaskId,
        mut task: impl TaskGuard,
        ctx: &mut impl ExecuteContext<'_>,
    ) {
        let session_id = ctx.session_id();
        // Task need to be scheduled if it's dirty or doesn't have output
        let dirty = get!(task, Dirty).map_or(false, |d| d.get(session_id));
        let should_schedule = dirty || !task.has_key(&CachedDataItemKey::Output {});
        if should_schedule {
            let description = ctx.get_task_desc_fn(task_id);
            if task.add(CachedDataItem::new_scheduled(description)) {
                ctx.schedule(task_id);
            }
        }
        let aggregation_number = get_aggregation_number(&task);
        if is_aggregating_node(aggregation_number) {
            // if it has `Activeness` we can skip visiting the nested nodes since
            // this would already be scheduled by the `Activeness`
            let is_active_until_clean =
                get!(task, Activeness).is_some_and(|a| a.active_until_clean);
            if !is_active_until_clean {
                let dirty_containers: Vec<_> = get_many!(task, AggregatedDirtyContainer { task } count if count.get(session_id) > 0 => task);
                if !dirty_containers.is_empty() || dirty {
                    let activeness_state =
                        get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id));
                    activeness_state.set_active_until_clean();
                    drop(task);

                    self.extend_find_and_schedule_dirty(dirty_containers);
                }
            }
        }
    }

    fn aggregated_data_update(
        &mut self,
        upper_ids: TaskIdVec,
        ctx: &mut impl ExecuteContext,
        update: AggregatedDataUpdate,
    ) {
        for upper_id in upper_ids {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
            let diff = update.apply(
                &mut upper,
                ctx.session_id(),
                ctx.should_track_activeness(),
                self,
            );
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
        }
    }

    fn inner_of_uppers_lost_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        lost_follower_id: TaskId,
        mut upper_ids: TaskIdVec,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("lost follower (n uppers)", uppers = upper_ids.len()).entered();

        let mut follower = ctx.task(lost_follower_id, TaskDataCategory::Meta);
        let mut follower_in_upper_ids = Vec::new();
        let mut persistent_uppers = 0;
        upper_ids.retain(|&mut upper_id| {
            let mut keep_upper = false;
            update!(follower, Upper { task: upper_id }, |old| {
                let Some(old) = old else {
                    follower_in_upper_ids.push(upper_id);
                    return None;
                };
                if old < 0 {
                    follower_in_upper_ids.push(upper_id);
                    return Some(old);
                }
                if old == 1 {
                    keep_upper = true;
                    if !upper_id.is_transient() {
                        persistent_uppers += 1;
                    }
                    return None;
                }
                Some(old - 1)
            });
            keep_upper
        });
        if !upper_ids.is_empty() {
            let data = AggregatedDataUpdate::from_task(&mut follower).invert();
            let followers = get_followers(&follower);
            drop(follower);

            if !data.is_empty() {
                for upper_id in upper_ids.iter() {
                    // remove data from upper
                    let mut upper = ctx.task(*upper_id, TaskDataCategory::Meta);
                    let diff = data.apply(
                        &mut upper,
                        ctx.session_id(),
                        ctx.should_track_activeness(),
                        self,
                    );
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
            }
            if !followers.is_empty() {
                self.push(
                    InnerOfUppersLostFollowersJob {
                        upper_ids: upper_ids.clone(),
                        lost_follower_ids: followers,
                    }
                    .into(),
                );
            }
        } else {
            drop(follower);
        }

        for upper_id in follower_in_upper_ids {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
            if update_count!(
                upper,
                Follower {
                    task: lost_follower_id
                },
                -1
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
                    self.push(AggregationUpdateJob::DecreaseActiveCount {
                        task: lost_follower_id,
                    });
                }
                // notify uppers about new follower
                if !upper_ids.is_empty() {
                    self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                        upper_ids,
                        lost_follower_id,
                    });
                }
            }
        }
    }

    fn inner_of_upper_lost_followers(
        &mut self,
        ctx: &mut impl ExecuteContext,
        mut lost_follower_ids: TaskIdVec,
        upper_id: TaskId,
    ) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!(
            "lost follower (n follower)",
            followers = lost_follower_ids.len()
        )
        .entered();

        lost_follower_ids.retain(|lost_follower_id| {
            let mut follower = ctx.task(*lost_follower_id, TaskDataCategory::Meta);
            let mut remove_upper = false;
            let mut follower_in_upper = false;
            update!(follower, Upper { task: upper_id }, |old| {
                let Some(old) = old else {
                    follower_in_upper = true;
                    return None;
                };
                if old < 0 {
                    follower_in_upper = true;
                    return Some(old);
                }
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
                    let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
                    let diff = data.apply(
                        &mut upper,
                        ctx.session_id(),
                        ctx.should_track_activeness(),
                        self,
                    );
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
                    });
                }
            } else {
                drop(follower);
            }
            follower_in_upper
        });
        for lost_follower_id in lost_follower_ids {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
            if update_count!(
                upper,
                Follower {
                    task: lost_follower_id
                },
                -1
            ) {
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
                // notify uppers about new follower
                if !upper_ids.is_empty() {
                    self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                        upper_ids,
                        lost_follower_id,
                    });
                }
            }
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
            let follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
            get_aggregation_number(&follower)
        };
        let mut upper_upper_ids_with_new_follower = SmallVec::new();
        let mut tasks_for_which_increment_active_count = SmallVec::new();
        let mut is_active = false;
        swap_retain(&mut upper_ids, |&mut upper_id| {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
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
            let mut follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
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
                    for upper_id in upper_ids.iter() {
                        // add data to upper
                        let mut upper = ctx.task(*upper_id, TaskDataCategory::Meta);
                        if has_data {
                            let diff = data.apply(
                                &mut upper,
                                ctx.session_id(),
                                ctx.should_track_activeness(),
                                self,
                            );
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
                    }
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
                let follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
                (new_follower_id, get_aggregation_number(&follower))
            })
            .collect::<SmallVec<[_; 4]>>();

        let mut new_followers_of_upper_uppers = SmallVec::new();
        let mut is_active = false;
        let mut has_active_count = false;
        let mut upper_upper_ids_for_new_followers = SmallVec::new();
        let upper_aggregation_number;
        {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
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
                    let mut inner = ctx.task(inner_id, TaskDataCategory::Meta);
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
                let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
                let diffs = upper_data_updates
                    .into_iter()
                    .filter_map(|data| {
                        let diff = data.apply(
                            &mut upper,
                            ctx.session_id(),
                            ctx.should_track_activeness(),
                            self,
                        );
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
                    let upper = ctx.task(upper_id, TaskDataCategory::Meta);
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
            let follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
            get_aggregation_number(&follower)
        };

        let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
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

            let mut inner = ctx.task(new_follower_id, TaskDataCategory::Meta);
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
                    let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
                    let diff = data.apply(
                        &mut upper,
                        ctx.session_id(),
                        ctx.should_track_activeness(),
                        self,
                    );
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
                    let upper = ctx.task(upper_id, TaskDataCategory::Meta);
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

        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        let state = get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id));
        let is_zero = state.decrement_active_counter();
        let is_empty = state.is_empty();
        if is_empty {
            task.remove(&CachedDataItemKey::Activeness {});
        }
        if is_zero {
            let followers = get_followers(&task);
            drop(task);
            if !followers.is_empty() {
                self.push(AggregationUpdateJob::DecreaseActiveCounts {
                    task_ids: followers,
                });
            }
        }
    }

    /// Increases the active count of a task.
    ///
    /// Only used when activeness is tracked.
    fn increase_active_count(&mut self, ctx: &mut impl ExecuteContext, task_id: TaskId) {
        #[cfg(feature = "trace_aggregation_update")]
        let _span = trace_span!("increase active count").entered();

        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        let state = get_mut_or_insert_with!(task, Activeness, || ActivenessState::new(task_id));
        let is_positive_now = state.increment_active_counter();
        let is_empty = state.is_empty();
        // This can happen if active count was negative before
        if is_empty {
            task.remove(&CachedDataItemKey::Activeness {});
        }
        if is_positive_now {
            let followers = get_followers(&task);
            // Fast path to schedule
            self.find_and_schedule_dirty_internal(task_id, task, ctx);

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

        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        let current = get!(task, AggregationNumber).copied().unwrap_or_default();
        let old = current.effective;
        // The base aggregation number can only increase
        let mut base_aggregation_number = max(current.base, base_aggregation_number);
        let distance = base_effective_distance.map_or(current.distance, |d| d.get());
        // The wanted new distance is either the provided one or the old distance
        let aggregation_number = if is_aggregating_node(base_aggregation_number) {
            base_aggregation_number.saturating_add(distance)
        } else {
            // The new target effecive aggregation number is base + distance
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
                for child_id in children {
                    task.add_new(CachedDataItem::Follower {
                        task: child_id,
                        value: 1,
                    });
                }
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

        let task = ctx.task(task_id, TaskDataCategory::All);
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
                let task = ctx.task(task_id, TaskDataCategory::Meta);
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

fn swap_retain<T, const N: usize>(vec: &mut SmallVec<[T; N]>, mut f: impl FnMut(&mut T) -> bool) {
    let mut i = 0;
    while i < vec.len() {
        if !f(&mut vec[i]) {
            vec.swap_remove(i);
        } else {
            i += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use smallvec::{smallvec, SmallVec};

    use crate::backend::operation::aggregation_update::swap_retain;

    #[test]
    fn test_swap_retain() {
        let mut vec: SmallVec<[i32; 4]> = smallvec![1, 2, 3, 4, 5];
        swap_retain(&mut vec, |a| *a % 2 != 0);
        let expected: SmallVec<[i32; 4]> = smallvec![1, 5, 3];
        assert_eq!(vec, expected);
    }
}
