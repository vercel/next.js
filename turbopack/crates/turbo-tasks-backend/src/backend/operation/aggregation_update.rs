use std::{
    cmp::{max, Ordering},
    collections::{hash_map::Entry as HashMapEntry, VecDeque},
    num::NonZeroU32,
};

use indexmap::map::Entry;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{FxIndexMap, FxIndexSet, SessionId, TaskId, TraitTypeId};

use crate::{
    backend::{
        operation::{
            invalidate::{make_task_dirty, TaskDirtyCause},
            ExecuteContext, Operation, TaskGuard,
        },
        storage::{get, get_many, iter_many, remove, update, update_count},
        TaskDataCategory,
    },
    data::{
        ActiveType, AggregationNumber, CachedDataItem, CachedDataItemKey, CollectibleRef,
        DirtyContainerCount, RootState,
    },
};

pub const LEAF_NUMBER: u32 = 16;
const MAX_COUNT_BEFORE_YIELD: usize = 1000;

pub fn is_aggregating_node(aggregation_number: u32) -> bool {
    aggregation_number >= LEAF_NUMBER
}

pub fn is_root_node(aggregation_number: u32) -> bool {
    aggregation_number == u32::MAX
}

fn get_followers_with_aggregation_number(
    task: &impl TaskGuard,
    aggregation_number: u32,
) -> Vec<TaskId> {
    if is_aggregating_node(aggregation_number) {
        get_many!(task, Follower { task } count if *count > 0 => *task)
    } else {
        get_many!(task, Child { task } => *task)
    }
}

fn get_followers(task: &impl TaskGuard) -> Vec<TaskId> {
    get_followers_with_aggregation_number(task, get_aggregation_number(task))
}

pub fn get_uppers(task: &impl TaskGuard) -> Vec<TaskId> {
    get_many!(task, Upper { task } count if *count > 0 => *task)
}

fn iter_uppers<'a>(task: &'a (impl TaskGuard + 'a)) -> impl Iterator<Item = TaskId> + 'a {
    iter_many!(task, Upper { task } count if *count > 0 => *task)
}

pub fn get_aggregation_number(task: &impl TaskGuard) -> u32 {
    get!(task, AggregationNumber)
        .map(|a| a.effective)
        .unwrap_or_default()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum AggregationUpdateJob {
    UpdateAggregationNumber {
        task_id: TaskId,
        base_aggregation_number: u32,
        distance: Option<NonZeroU32>,
    },
    InnerOfUpperHasNewFollower {
        upper_id: TaskId,
        new_follower_id: TaskId,
    },
    InnerOfUppersHasNewFollower {
        upper_ids: Vec<TaskId>,
        new_follower_id: TaskId,
    },
    InnerOfUpperHasNewFollowers {
        upper_id: TaskId,
        new_follower_ids: Vec<TaskId>,
    },
    InnerOfUppersHasNewFollowers {
        upper_ids: Vec<TaskId>,
        new_follower_ids: Vec<TaskId>,
    },
    InnerOfUppersLostFollower {
        upper_ids: Vec<TaskId>,
        lost_follower_id: TaskId,
    },
    InnerOfUppersLostFollowers {
        upper_ids: Vec<TaskId>,
        lost_follower_ids: Vec<TaskId>,
    },
    InnerOfUpperLostFollowers {
        upper_id: TaskId,
        lost_follower_ids: Vec<TaskId>,
    },
    AggregatedDataUpdate {
        upper_ids: Vec<TaskId>,
        update: AggregatedDataUpdate,
    },
    InvalidateDueToCollectiblesChange {
        task_ids: SmallVec<[TaskId; 4]>,
        collectible_type: TraitTypeId,
    },
    BalanceEdge {
        upper_id: TaskId,
        task_id: TaskId,
    },
}

impl AggregationUpdateJob {
    pub fn data_update(
        task: &mut impl TaskGuard,
        update: AggregatedDataUpdate,
    ) -> Option<AggregationUpdateJob> {
        let upper_ids: Vec<_> = get_uppers(task);
        if !upper_ids.is_empty() {
            Some(AggregationUpdateJob::AggregatedDataUpdate {
                upper_ids,
                update: update.clone(),
            })
        } else {
            None
        }
    }
}

#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct AggregatedDataUpdate {
    dirty_container_update: Option<(TaskId, DirtyContainerCount)>,
    collectibles_update: Vec<(CollectibleRef, i32)>,
}

impl AggregatedDataUpdate {
    fn from_task(task: &mut impl TaskGuard) -> Self {
        let aggregation = get_aggregation_number(task);
        let mut dirty_container_count = Default::default();
        let mut collectibles_update: Vec<_> =
            get_many!(task, Collectible { collectible } => (*collectible, 1));
        if is_aggregating_node(aggregation) {
            dirty_container_count = get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default();
            let collectibles = iter_many!(
                task,
                AggregatedCollectible {
                    collectible
                } count if *count > 0 => {
                    *collectible
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

    fn apply(
        &self,
        task: &mut impl TaskGuard,
        session_id: SessionId,
        queue: &mut AggregationUpdateQueue,
    ) -> AggregatedDataUpdate {
        let Self {
            dirty_container_update,
            collectibles_update,
        } = self;
        let mut result = Self::default();
        if let Some((dirty_container_id, count)) = dirty_container_update {
            // When a dirty container count is increased and the task is considered as active
            // `AggregateRoot` we need to schedule the dirty tasks in the new dirty container
            let current_session_update = count.get(session_id);
            if current_session_update > 0 && task.has_key(&CachedDataItemKey::AggregateRoot {}) {
                queue.push_find_and_schedule_dirty(*dirty_container_id)
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
                    // When the current task is no longer dirty, we need to fire the aggregate root
                    // events and do some cleanup
                    if let Some(root_state) = get!(task, AggregateRoot) {
                        root_state.all_clean_event.notify(usize::MAX);
                        if matches!(root_state.ty, ActiveType::CachedActiveUntilClean) {
                            task.remove(&CachedDataItemKey::AggregateRoot {});
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
                let dependent: SmallVec<[TaskId; 4]> = get_many!(
                    task,
                    CollectiblesDependent {
                        collectible_type,
                        task,
                    } if *collectible_type == ty => {
                        *task
                    }
                );
                if !dependent.is_empty() {
                    queue.push(AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                        task_ids: dependent,
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

    fn is_empty(&self) -> bool {
        let Self {
            dirty_container_update,
            collectibles_update,
        } = self;
        dirty_container_update.is_none() && collectibles_update.is_empty()
    }

    pub fn new() -> Self {
        Self {
            dirty_container_update: None,
            collectibles_update: Vec::new(),
        }
    }

    pub fn dirty_container_update(mut self, task_id: TaskId, count: DirtyContainerCount) -> Self {
        self.dirty_container_update = Some((task_id, count));
        self
    }

    pub fn collectibles_update(mut self, collectibles_update: Vec<(CollectibleRef, i32)>) -> Self {
        self.collectibles_update = collectibles_update;
        self
    }
}

#[derive(Serialize, Deserialize, Clone, Copy)]
struct AggregationNumberUpdate {
    base_aggregation_number: u32,
    distance: Option<NonZeroU32>,
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregationUpdateQueue {
    jobs: VecDeque<AggregationUpdateJob>,
    number_updates: FxIndexMap<TaskId, AggregationNumberUpdate>,
    done_number_updates: FxHashMap<TaskId, AggregationNumberUpdate>,
    find_and_schedule: FxIndexSet<TaskId>,
    done_find_and_schedule: FxHashSet<TaskId>,
    balance_queue: FxIndexSet<(TaskId, TaskId)>,
}

impl AggregationUpdateQueue {
    pub fn new() -> Self {
        Self {
            jobs: VecDeque::with_capacity(8),
            number_updates: FxIndexMap::default(),
            done_number_updates: FxHashMap::default(),
            find_and_schedule: FxIndexSet::default(),
            done_find_and_schedule: FxHashSet::default(),
            balance_queue: FxIndexSet::default(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }

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
                                        update.distance.map_or(true, |d| d < distance)
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
                        });
                    }
                };
            }
            AggregationUpdateJob::BalanceEdge { upper_id, task_id } => {
                self.balance_queue.insert((upper_id, task_id));
            }
            _ => {
                self.jobs.push_back(job);
            }
        }
    }

    pub fn extend(&mut self, jobs: impl IntoIterator<Item = AggregationUpdateJob>) {
        for job in jobs {
            self.push(job);
        }
    }

    pub fn push_find_and_schedule_dirty(&mut self, task_id: TaskId) {
        if !self.done_find_and_schedule.contains(&task_id) {
            self.find_and_schedule.insert(task_id);
        }
    }

    pub fn extend_find_and_schedule_dirty(&mut self, task_ids: impl IntoIterator<Item = TaskId>) {
        self.find_and_schedule.extend(
            task_ids
                .into_iter()
                .filter(|task_id| !self.done_find_and_schedule.contains(task_id)),
        );
    }

    pub fn run(job: AggregationUpdateJob, ctx: &mut impl ExecuteContext) {
        let mut queue = Self::new();
        queue.push(job);
        queue.execute(ctx);
    }

    pub fn process(&mut self, ctx: &mut impl ExecuteContext) -> bool {
        if let Some(job) = self.jobs.pop_front() {
            match job {
                AggregationUpdateJob::UpdateAggregationNumber { .. }
                | AggregationUpdateJob::BalanceEdge { .. } => {
                    // These jobs are never pushed to the queue
                    unreachable!();
                }
                AggregationUpdateJob::InnerOfUppersHasNewFollowers {
                    mut upper_ids,
                    mut new_follower_ids,
                } => {
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
                            if !new_follower_ids.is_empty() {
                                self.jobs.push_front(
                                    AggregationUpdateJob::InnerOfUppersHasNewFollowers {
                                        upper_ids: upper_ids.clone(),
                                        new_follower_ids,
                                    },
                                );
                            }
                            self.inner_of_uppers_has_new_follower(ctx, new_follower_id, upper_ids);
                        }
                    } else {
                        #[allow(clippy::collapsible_if, reason = "readablility")]
                        if let Some(upper_id) = upper_ids.pop() {
                            if !upper_ids.is_empty() {
                                self.jobs.push_front(
                                    AggregationUpdateJob::InnerOfUppersHasNewFollowers {
                                        upper_ids,
                                        new_follower_ids: new_follower_ids.clone(),
                                    },
                                );
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
                AggregationUpdateJob::InnerOfUppersLostFollowers {
                    mut upper_ids,
                    mut lost_follower_ids,
                } => {
                    if upper_ids.len() > lost_follower_ids.len() {
                        if let Some(lost_follower_id) = lost_follower_ids.pop() {
                            if !lost_follower_ids.is_empty() {
                                self.jobs.push_front(
                                    AggregationUpdateJob::InnerOfUppersLostFollowers {
                                        upper_ids: upper_ids.clone(),
                                        lost_follower_ids,
                                    },
                                );
                            }
                            self.inner_of_uppers_lost_follower(ctx, lost_follower_id, upper_ids);
                        }
                    } else {
                        #[allow(clippy::collapsible_if, reason = "readablility")]
                        if let Some(upper_id) = upper_ids.pop() {
                            if !upper_ids.is_empty() {
                                self.jobs.push_front(
                                    AggregationUpdateJob::InnerOfUppersLostFollowers {
                                        upper_ids,
                                        lost_follower_ids: lost_follower_ids.clone(),
                                    },
                                );
                            }
                            self.inner_of_upper_lost_followers(ctx, lost_follower_ids, upper_id);
                        }
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
                AggregationUpdateJob::AggregatedDataUpdate { upper_ids, update } => {
                    self.aggregated_data_update(upper_ids, ctx, update);
                }
                AggregationUpdateJob::InvalidateDueToCollectiblesChange {
                    task_ids,
                    collectible_type,
                } => {
                    for task_id in task_ids {
                        make_task_dirty(
                            task_id,
                            TaskDirtyCause::CollectiblesChange { collectible_type },
                            self,
                            ctx,
                        );
                    }
                }
            }
            false
        } else if !self.number_updates.is_empty() {
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some((task_id, update)) = self.number_updates.pop() {
                    self.done_number_updates.insert(task_id, update);
                    self.update_aggregation_number(
                        ctx,
                        task_id,
                        update.distance,
                        update.base_aggregation_number,
                    );
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else if !self.balance_queue.is_empty() {
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some((upper_id, task_id)) = self.balance_queue.pop() {
                    self.balance_edge(ctx, upper_id, task_id);
                    remaining -= 1;
                } else {
                    break;
                }
            }
            false
        } else if !self.find_and_schedule.is_empty() {
            let mut remaining = MAX_COUNT_BEFORE_YIELD;
            while remaining > 0 {
                if let Some(task_id) = self.find_and_schedule.pop() {
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

    fn balance_edge(&mut self, ctx: &mut impl ExecuteContext, upper_id: TaskId, task_id: TaskId) {
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
                    let upper_ids = get_uppers(&upper);

                    // Add the same amount of upper edges
                    if update_count!(task, Upper { task: upper_id }, count) {
                        // When this is a new inner node, update aggregated data and
                        // followers
                        let data = AggregatedDataUpdate::from_task(&mut task);
                        let followers = get_followers(&task);
                        let diff = data.apply(&mut upper, ctx.session_id(), self);

                        if !upper_ids.is_empty() && !diff.is_empty() {
                            // Notify uppers about changed aggregated data
                            self.push(AggregationUpdateJob::AggregatedDataUpdate {
                                upper_ids: upper_ids.clone(),
                                update: diff,
                            });
                        }
                        if !followers.is_empty() {
                            self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                                upper_id,
                                new_follower_ids: followers,
                            });
                        }

                        if upper.has_key(&CachedDataItemKey::AggregateRoot {}) {
                            // If the upper node is an `AggregateRoot` we need to schedule the
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
                    let upper_ids: Vec<_> = get_uppers(&upper);

                    // Add the same amount of follower edges
                    if update_count!(upper, Follower { task: task_id }, count) {
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
                    let diff = data.apply(&mut upper, ctx.session_id(), self);
                    if !upper_ids.is_empty() && !diff.is_empty() {
                        self.push(AggregationUpdateJob::AggregatedDataUpdate {
                            upper_ids: upper_ids.clone(),
                            update: diff,
                        });
                    }
                    if !followers.is_empty() {
                        self.push(AggregationUpdateJob::InnerOfUppersLostFollowers {
                            upper_ids: vec![upper_id],
                            lost_follower_ids: followers,
                        });
                    }
                }
                Ordering::Equal => {}
            }
        } else {
            // both nodes have the same aggregation number
            // We need to change the aggregation number of the task or of upper
            let upper_uppers = iter_uppers(&upper).count();
            let task_uppers = iter_uppers(&task).count();
            if upper_uppers > task_uppers {
                let current = get!(upper, AggregationNumber).copied().unwrap_or_default();
                self.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: upper_id,
                    base_aggregation_number: current.base + 1,
                    distance: None,
                });
            } else {
                let current = get!(task, AggregationNumber).copied().unwrap_or_default();
                self.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id,
                    base_aggregation_number: current.base + 1,
                    distance: None,
                });
            }
        }
    }

    fn find_and_schedule_dirty(&mut self, task_id: TaskId, ctx: &mut impl ExecuteContext) {
        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
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
        if is_aggregating_node(get_aggregation_number(&task)) {
            // if it has an `AggregateRoot` we can skip visiting the nested nodes since
            // this would already be scheduled by the `AggregateRoot`
            if !task.has_key(&CachedDataItemKey::AggregateRoot {}) {
                task.insert(CachedDataItem::AggregateRoot {
                    value: RootState::new(ActiveType::CachedActiveUntilClean, task_id),
                });
                let dirty_containers = iter_many!(task, AggregatedDirtyContainer { task } count if count.get(session_id) > 0 => *task);
                self.find_and_schedule.extend(dirty_containers);
            }
        }
    }

    fn aggregated_data_update(
        &mut self,
        upper_ids: Vec<TaskId>,
        ctx: &mut impl ExecuteContext,
        update: AggregatedDataUpdate,
    ) {
        for upper_id in upper_ids {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
            let diff = update.apply(&mut upper, ctx.session_id(), self);
            if !diff.is_empty() {
                let upper_ids = get_uppers(&upper);
                if !upper_ids.is_empty() {
                    self.push(AggregationUpdateJob::AggregatedDataUpdate {
                        upper_ids,
                        update: diff,
                    });
                }
            }
        }
    }

    fn inner_of_uppers_lost_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        lost_follower_id: TaskId,
        mut upper_ids: Vec<TaskId>,
    ) {
        let mut follower = ctx.task(lost_follower_id, TaskDataCategory::Meta);
        let mut follower_in_upper_ids = Vec::new();
        upper_ids.retain(|&upper_id| {
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
                    return None;
                }
                Some(old - 1)
            });
            keep_upper
        });
        if !upper_ids.is_empty() {
            let data = AggregatedDataUpdate::from_task(&mut follower).invert();
            let followers: Vec<_> = get_followers(&follower);
            drop(follower);

            if !data.is_empty() {
                for upper_id in upper_ids.iter() {
                    // remove data from upper
                    let mut upper = ctx.task(*upper_id, TaskDataCategory::Meta);
                    let diff = data.apply(&mut upper, ctx.session_id(), self);
                    if !diff.is_empty() {
                        let upper_ids = get_uppers(&upper);
                        self.push(AggregationUpdateJob::AggregatedDataUpdate {
                            upper_ids,
                            update: diff,
                        })
                    }
                }
            }
            if !followers.is_empty() {
                self.push(AggregationUpdateJob::InnerOfUppersLostFollowers {
                    upper_ids: upper_ids.clone(),
                    lost_follower_ids: followers,
                });
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
                let upper_ids = get_uppers(&upper);
                self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                    upper_ids,
                    lost_follower_id,
                })
            }
        }
    }

    fn inner_of_upper_lost_followers(
        &mut self,
        ctx: &mut impl ExecuteContext,
        mut lost_follower_ids: Vec<TaskId>,
        upper_id: TaskId,
    ) {
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
                let followers: Vec<_> = get_followers(&follower);
                drop(follower);

                if !data.is_empty() {
                    // remove data from upper
                    let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
                    let diff = data.apply(&mut upper, ctx.session_id(), self);
                    if !diff.is_empty() {
                        let upper_ids = get_uppers(&upper);
                        self.push(AggregationUpdateJob::AggregatedDataUpdate {
                            upper_ids,
                            update: diff,
                        })
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
                let upper_ids = get_uppers(&upper);
                self.push(AggregationUpdateJob::InnerOfUppersLostFollower {
                    upper_ids,
                    lost_follower_id,
                })
            }
        }
    }

    fn inner_of_uppers_has_new_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        new_follower_id: TaskId,
        mut upper_ids: Vec<TaskId>,
    ) {
        let follower_aggregation_number = {
            let follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
            get_aggregation_number(&follower)
        };
        let mut upper_ids_as_follower = Vec::new();
        let mut is_aggregate_root = false;
        upper_ids.retain(|&upper_id| {
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
                    upper_ids_as_follower.push(upper_id);
                }
                false
            } else {
                // It's an inner node, continue with the list
                if upper.has_key(&CachedDataItemKey::AggregateRoot {}) {
                    is_aggregate_root = true;
                }
                true
            }
        });

        if !upper_ids.is_empty() {
            let mut follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
            upper_ids.retain(|&upper_id| {
                if update_count!(follower, Upper { task: upper_id }, 1) {
                    // It's a new upper
                    true
                } else {
                    // It's already an upper
                    false
                }
            });
            if !upper_ids.is_empty() {
                let data = AggregatedDataUpdate::from_task(&mut follower);
                let children: Vec<_> = get_followers(&follower);
                drop(follower);

                if !data.is_empty() {
                    for upper_id in upper_ids.iter() {
                        // add data to upper
                        let mut upper = ctx.task(*upper_id, TaskDataCategory::Meta);
                        let diff = data.apply(&mut upper, ctx.session_id(), self);
                        if !diff.is_empty() {
                            let upper_ids = get_uppers(&upper);
                            self.push(AggregationUpdateJob::AggregatedDataUpdate {
                                upper_ids,
                                update: diff,
                            })
                        }
                    }
                }
                if !children.is_empty() {
                    self.push(AggregationUpdateJob::InnerOfUppersHasNewFollowers {
                        upper_ids: upper_ids.clone(),
                        new_follower_ids: children,
                    });
                }
            } else {
                drop(follower);
            }
        }
        if is_aggregate_root {
            self.push_find_and_schedule_dirty(new_follower_id);
        }
        if !upper_ids_as_follower.is_empty() {
            self.push(AggregationUpdateJob::InnerOfUppersHasNewFollower {
                upper_ids: upper_ids_as_follower,
                new_follower_id,
            });
        }
    }

    fn inner_of_upper_has_new_followers(
        &mut self,
        ctx: &mut impl ExecuteContext,
        new_follower_ids: Vec<TaskId>,
        upper_id: TaskId,
    ) {
        let mut followers_with_aggregation_number = new_follower_ids
            .into_iter()
            .map(|new_follower_id| {
                let follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
                (new_follower_id, get_aggregation_number(&follower))
            })
            .collect::<Vec<_>>();

        let mut followers_of_upper = Vec::new();
        let is_aggregate_root;
        {
            let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
            is_aggregate_root = upper.has_key(&CachedDataItemKey::AggregateRoot {});
            // decide if it should be an inner or follower
            let upper_aggregation_number = get_aggregation_number(&upper);

            if !is_root_node(upper_aggregation_number) {
                followers_with_aggregation_number.retain(
                    |(follower_id, follower_aggregation_number)| {
                        if upper_aggregation_number <= *follower_aggregation_number {
                            // It's a follower of the upper node
                            if update_count!(upper, Follower { task: *follower_id }, 1) {
                                followers_of_upper.push(*follower_id);
                            }
                            false
                        } else {
                            // It's an inner node, continue with the list
                            true
                        }
                    },
                );
            }
        }

        let mut upper_data_updates = Vec::new();
        let mut upper_new_followers = Vec::new();
        for &(follower_id, _) in followers_with_aggregation_number.iter() {
            let mut follower = ctx.task(follower_id, TaskDataCategory::Meta);
            if update_count!(follower, Upper { task: upper_id }, 1) {
                // It's a new upper
                let data = AggregatedDataUpdate::from_task(&mut follower);
                let children: Vec<_> = get_followers(&follower);
                drop(follower);

                if !data.is_empty() {
                    upper_data_updates.push(data);
                }
                upper_new_followers.extend(children);
            }
        }
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
                    let diff = data.apply(&mut upper, ctx.session_id(), self);
                    (!diff.is_empty()).then_some(diff)
                })
                .collect::<Vec<_>>();
            let mut iter = diffs.into_iter();
            if let Some(mut diff) = iter.next() {
                let upper_ids = get_uppers(&upper);
                drop(upper);
                // TODO merge AggregatedDataUpdate
                for next_diff in iter {
                    self.push(AggregationUpdateJob::AggregatedDataUpdate {
                        upper_ids: upper_ids.clone(),
                        update: diff,
                    });
                    diff = next_diff;
                }
                self.push(AggregationUpdateJob::AggregatedDataUpdate {
                    upper_ids,
                    update: diff,
                });
            }
        }
        if is_aggregate_root {
            self.find_and_schedule.extend(
                followers_with_aggregation_number
                    .into_iter()
                    .map(|(id, _)| id),
            );
        }
        if !followers_of_upper.is_empty() {
            self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                upper_id,
                new_follower_ids: followers_of_upper,
            });
        }
    }

    fn inner_of_upper_has_new_follower(
        &mut self,
        ctx: &mut impl ExecuteContext,
        new_follower_id: TaskId,
        upper_id: TaskId,
    ) {
        let follower_aggregation_number = {
            let follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
            get_aggregation_number(&follower)
        };

        let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
        if upper.has_key(&CachedDataItemKey::AggregateRoot {}) {
            self.find_and_schedule.insert(new_follower_id);
        }
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
                drop(upper);
                self.push(AggregationUpdateJob::InnerOfUpperHasNewFollower {
                    upper_id,
                    new_follower_id,
                });
            }
        } else {
            // It's an inner node, continue with the list
            drop(upper);
            let mut follower = ctx.task(new_follower_id, TaskDataCategory::Meta);
            if update_count!(follower, Upper { task: upper_id }, 1) {
                // It's a new upper
                let data = AggregatedDataUpdate::from_task(&mut follower);
                let children: Vec<_> = get_followers(&follower);
                drop(follower);

                if !data.is_empty() {
                    // add data to upper
                    let mut upper = ctx.task(upper_id, TaskDataCategory::Meta);
                    let diff = data.apply(&mut upper, ctx.session_id(), self);
                    if !diff.is_empty() {
                        let upper_ids = get_uppers(&upper);
                        self.push(AggregationUpdateJob::AggregatedDataUpdate {
                            upper_ids,
                            update: diff,
                        });
                    }
                }
                self.push(AggregationUpdateJob::InnerOfUpperHasNewFollowers {
                    upper_id,
                    new_follower_ids: children,
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
                let children: Vec<_> = get_many!(task, Child { task } => *task);
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
                let followers = iter_many!(task, Follower { task } count if *count > 0 => *task);
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
                let children = iter_many!(task, Child { task } => *task);
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
