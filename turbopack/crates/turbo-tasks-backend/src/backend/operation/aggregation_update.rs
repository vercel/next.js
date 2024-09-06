use std::{
    collections::{hash_map::Entry, HashMap, VecDeque},
    ops::Add,
};

use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{ExecuteContext, Operation, TaskGuard};
use crate::{
    data::{CachedDataItem, CachedDataItemKey},
    get, get_many, iter_many, remove, update, update_count,
};

const LEAF_NUMBER: u32 = 16;

pub fn is_aggregating_node(aggregation_number: u32) -> bool {
    aggregation_number >= LEAF_NUMBER
}

pub fn is_root_node(aggregation_number: u32) -> bool {
    aggregation_number == u32::MAX
}

fn get_followers_with_aggregation_number(
    task: &TaskGuard<'_>,
    aggregation_number: u32,
) -> Vec<TaskId> {
    if is_aggregating_node(aggregation_number) {
        get_many!(task, Follower { task } count if count > 0 => task)
    } else {
        get_many!(task, Child { task } => task)
    }
}

fn get_followers(task: &TaskGuard<'_>) -> Vec<TaskId> {
    get_followers_with_aggregation_number(task, get_aggregation_number(task))
}

pub fn get_uppers(task: &TaskGuard<'_>) -> Vec<TaskId> {
    get_many!(task, Upper { task } count if count > 0 => task)
}

fn iter_uppers<'a>(task: &'a TaskGuard<'a>) -> impl Iterator<Item = TaskId> + 'a {
    iter_many!(task, Upper { task } count if count > 0 => task)
}

pub fn get_aggregation_number(task: &TaskGuard<'_>) -> u32 {
    get!(task, AggregationNumber).copied().unwrap_or_default()
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum AggregationUpdateJob {
    UpdateAggregationNumber {
        task_id: TaskId,
        aggregation_number: u32,
    },
    InnerHasNewFollower {
        upper_ids: Vec<TaskId>,
        new_follower_id: TaskId,
    },
    InnerHasNewFollowers {
        upper_ids: Vec<TaskId>,
        new_follower_ids: Vec<TaskId>,
    },
    InnerLostFollower {
        upper_ids: Vec<TaskId>,
        lost_follower_id: TaskId,
    },
    InnerLostFollowers {
        upper_ids: Vec<TaskId>,
        lost_follower_ids: Vec<TaskId>,
    },
    AggregatedDataUpdate {
        upper_ids: Vec<TaskId>,
        update: AggregatedDataUpdate,
    },
    DataUpdate {
        task_id: TaskId,
        update: AggregatedDataUpdate,
    },
    ScheduleWhenDirty {
        task_ids: Vec<TaskId>,
    },
    BalanceEdge {
        upper_id: TaskId,
        task_id: TaskId,
    },
}

#[derive(Default, Serialize, Deserialize, Clone, Debug)]
pub struct AggregatedDataUpdate {
    dirty_task_count: i32,
    dirty_tasks_update: HashMap<TaskId, i32>,
    // TODO collectibles
}

impl AggregatedDataUpdate {
    fn from_task(task: &mut TaskGuard<'_>) -> Self {
        let aggregation = get_aggregation_number(task);
        let dirty = get!(task, Dirty).is_some();
        if is_aggregating_node(aggregation) {
            let mut dirty_task_count = get!(task, AggregatedDirtyTaskCount).copied().unwrap_or(0);
            let mut dirty_tasks_update = task
                .iter()
                .filter_map(|(key, _)| match *key {
                    CachedDataItemKey::AggregatedDirtyTask { task } => Some((task, 1)),
                    _ => None,
                })
                .collect::<HashMap<_, _>>();
            if dirty {
                dirty_task_count += 1;
                dirty_tasks_update.insert(task.id(), 1);
            }
            Self {
                dirty_task_count: dirty_task_count as i32,
                dirty_tasks_update,
            }
        } else if dirty {
            Self::dirty_task(task.id())
        } else {
            Self::default()
        }
    }

    fn invert(mut self) -> Self {
        self.dirty_task_count = -self.dirty_task_count;
        for value in self.dirty_tasks_update.values_mut() {
            *value = -*value;
        }
        self
    }

    fn apply(
        &self,
        task: &mut TaskGuard<'_>,
        queue: &mut AggregationUpdateQueue,
    ) -> AggregatedDataUpdate {
        let Self {
            dirty_task_count,
            dirty_tasks_update,
        } = self;
        let mut result = Self::default();
        if *dirty_task_count != 0 {
            update!(task, AggregatedDirtyTaskCount, |old: Option<i32>| {
                let old = old.unwrap_or(0);
                let new = old + *dirty_task_count;
                if old <= 0 && new > 0 {
                    result.dirty_task_count = 1;
                } else if old > 0 && new <= 0 {
                    result.dirty_task_count = -1;
                }
                (new != 0).then_some(new)
            });
            if result.dirty_task_count == -1 {
                if let Some(root_state) = get!(task, AggregateRoot) {
                    root_state.all_clean_event.notify(usize::MAX);
                }
            }
        }
        if !dirty_tasks_update.is_empty() {
            let mut task_to_schedule = Vec::new();
            let root = get!(task, AggregateRoot).is_some();
            for (task_id, count) in dirty_tasks_update {
                update!(
                    task,
                    AggregatedDirtyTask { task: *task_id },
                    |old: Option<i32>| {
                        let old = old.unwrap_or(0);
                        let new = old + *count;
                        if old <= 0 && new > 0 {
                            if root {
                                task_to_schedule.push(*task_id);
                            }
                            result.dirty_tasks_update.insert(*task_id, 1);
                        } else if old > 0 && new <= 0 {
                            result.dirty_tasks_update.insert(*task_id, -1);
                        }
                        (new != 0).then_some(new)
                    }
                );
            }
            if !task_to_schedule.is_empty() {
                queue.push(AggregationUpdateJob::ScheduleWhenDirty {
                    task_ids: task_to_schedule,
                })
            }
        }
        result
    }

    fn is_empty(&self) -> bool {
        let Self {
            dirty_task_count,
            dirty_tasks_update,
        } = self;
        *dirty_task_count == 0 && dirty_tasks_update.is_empty()
    }

    pub fn dirty_task(task_id: TaskId) -> Self {
        Self {
            dirty_task_count: 1,
            dirty_tasks_update: HashMap::from([(task_id, 1)]),
        }
    }

    pub fn no_longer_dirty_task(task_id: TaskId) -> Self {
        Self {
            dirty_task_count: -1,
            dirty_tasks_update: HashMap::from([(task_id, -1)]),
        }
    }
}

impl Add for AggregatedDataUpdate {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        let mut dirty_tasks_update = self.dirty_tasks_update;
        for (task, count) in rhs.dirty_tasks_update {
            match dirty_tasks_update.entry(task) {
                Entry::Occupied(mut entry) => {
                    let value = entry.get_mut();
                    *value += count;
                    if *value == 0 {
                        entry.remove();
                    }
                }
                Entry::Vacant(entry) => {
                    if count != 0 {
                        entry.insert(count);
                    }
                }
            }
        }
        Self {
            dirty_task_count: self.dirty_task_count + rhs.dirty_task_count,
            dirty_tasks_update,
        }
    }
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregationUpdateQueue {
    jobs: VecDeque<AggregationUpdateJob>,
}

impl AggregationUpdateQueue {
    pub fn new() -> Self {
        Self {
            jobs: VecDeque::with_capacity(8),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }

    pub fn push(&mut self, job: AggregationUpdateJob) {
        self.jobs.push_back(job);
    }

    pub fn run(job: AggregationUpdateJob, ctx: &ExecuteContext<'_>) {
        let mut queue = Self::new();
        queue.push(job);
        queue.execute(ctx);
    }

    pub fn process(&mut self, ctx: &ExecuteContext<'_>) -> bool {
        if let Some(job) = self.jobs.pop_front() {
            match job {
                AggregationUpdateJob::UpdateAggregationNumber {
                    task_id,
                    aggregation_number,
                } => {
                    let mut task = ctx.task(task_id);
                    let old = get_aggregation_number(&task);
                    if old < aggregation_number {
                        task.insert(CachedDataItem::AggregationNumber {
                            value: aggregation_number,
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
                            let followers =
                                iter_many!(task, Follower { task } count if count > 0 => task);
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
                                    aggregation_number: aggregation_number + 1,
                                });
                            }
                        }
                    }
                }
                AggregationUpdateJob::InnerHasNewFollowers {
                    upper_ids,
                    mut new_follower_ids,
                } => {
                    if let Some(new_follower_id) = new_follower_ids.pop() {
                        if new_follower_ids.is_empty() {
                            self.jobs
                                .push_front(AggregationUpdateJob::InnerHasNewFollower {
                                    upper_ids,
                                    new_follower_id,
                                });
                        } else {
                            self.jobs
                                .push_front(AggregationUpdateJob::InnerHasNewFollowers {
                                    upper_ids: upper_ids.clone(),
                                    new_follower_ids,
                                });
                            self.jobs
                                .push_front(AggregationUpdateJob::InnerHasNewFollower {
                                    upper_ids,
                                    new_follower_id,
                                });
                        }
                    }
                }
                AggregationUpdateJob::InnerHasNewFollower {
                    mut upper_ids,
                    new_follower_id,
                } => {
                    let follower_aggregation_number = {
                        let follower = ctx.task(new_follower_id);
                        get_aggregation_number(&follower)
                    };
                    let mut upper_ids_as_follower = Vec::new();
                    upper_ids.retain(|&upper_id| {
                        let upper = ctx.task(upper_id);
                        // decide if it should be an inner or follower
                        let upper_aggregation_number = get_aggregation_number(&upper);

                        if !is_root_node(upper_aggregation_number)
                            && upper_aggregation_number <= follower_aggregation_number
                        {
                            // It's a follower of the upper node
                            upper_ids_as_follower.push(upper_id);
                            false
                        } else {
                            // It's an inner node, continue with the list
                            true
                        }
                    });
                    if !upper_ids.is_empty() {
                        let mut follower = ctx.task(new_follower_id);
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
                                    let mut upper = ctx.task(*upper_id);
                                    let diff = data.apply(&mut upper, self);
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
                                self.push(AggregationUpdateJob::InnerHasNewFollowers {
                                    upper_ids: upper_ids.clone(),
                                    new_follower_ids: children,
                                });
                            }
                        } else {
                            drop(follower);
                        }
                    }
                    for upper_id in upper_ids_as_follower {
                        let mut upper = ctx.task(upper_id);
                        if update_count!(
                            upper,
                            Follower {
                                task: new_follower_id
                            },
                            1
                        ) {
                            self.push(AggregationUpdateJob::InnerHasNewFollower {
                                upper_ids: vec![upper_id],
                                new_follower_id,
                            })
                        }
                    }
                }
                AggregationUpdateJob::InnerLostFollowers {
                    upper_ids,
                    mut lost_follower_ids,
                } => {
                    if let Some(lost_follower_id) = lost_follower_ids.pop() {
                        if lost_follower_ids.is_empty() {
                            self.jobs
                                .push_front(AggregationUpdateJob::InnerLostFollower {
                                    upper_ids,
                                    lost_follower_id,
                                });
                        } else {
                            self.jobs
                                .push_front(AggregationUpdateJob::InnerLostFollowers {
                                    upper_ids: upper_ids.clone(),
                                    lost_follower_ids,
                                });
                            self.jobs
                                .push_front(AggregationUpdateJob::InnerLostFollower {
                                    upper_ids,
                                    lost_follower_id,
                                });
                        }
                    }
                }
                AggregationUpdateJob::InnerLostFollower {
                    mut upper_ids,
                    lost_follower_id,
                } => {
                    let mut follower = ctx.task(lost_follower_id);
                    let mut upper_ids_as_follower = Vec::new();
                    upper_ids.retain(|&upper_id| {
                        if update_count!(follower, Upper { task: upper_id }, -1) {
                            // It was an inner
                            true
                        } else {
                            // It is a follower
                            upper_ids_as_follower.push(upper_id);
                            false
                        }
                    });
                    if !upper_ids.is_empty() {
                        let data = AggregatedDataUpdate::from_task(&mut follower).invert();
                        let children: Vec<_> = get_followers(&follower);
                        drop(follower);

                        if !data.is_empty() {
                            for upper_id in upper_ids.iter() {
                                // remove data from upper
                                let mut upper = ctx.task(*upper_id);
                                let diff = data.apply(&mut upper, self);
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
                            self.push(AggregationUpdateJob::InnerLostFollowers {
                                upper_ids: upper_ids.clone(),
                                lost_follower_ids: children,
                            });
                        }
                    } else {
                        drop(follower);
                    }

                    for upper_id in upper_ids_as_follower {
                        let mut upper = ctx.task(upper_id);
                        if update_count!(
                            upper,
                            Follower {
                                task: lost_follower_id
                            },
                            -1
                        ) {
                            self.push(AggregationUpdateJob::InnerLostFollower {
                                upper_ids: vec![upper_id],
                                lost_follower_id,
                            })
                        }
                    }
                }
                AggregationUpdateJob::AggregatedDataUpdate { upper_ids, update } => {
                    for upper_id in upper_ids {
                        let mut upper = ctx.task(upper_id);
                        let diff = update.apply(&mut upper, self);
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
                AggregationUpdateJob::DataUpdate { task_id, update } => {
                    let task = ctx.task(task_id);
                    let upper_ids: Vec<_> = get_uppers(&task);
                    if !upper_ids.is_empty() {
                        self.push(AggregationUpdateJob::AggregatedDataUpdate {
                            upper_ids,
                            update: update.clone(),
                        });
                    }
                }
                AggregationUpdateJob::ScheduleWhenDirty { task_ids } => {
                    for task_id in task_ids {
                        let description = ctx.backend.get_task_desc_fn(task_id);
                        let mut task = ctx.task(task_id);
                        if task.has_key(&CachedDataItemKey::Dirty {}) {
                            if task.add(CachedDataItem::new_scheduled(description)) {
                                ctx.turbo_tasks.schedule(task_id);
                            }
                        }
                    }
                }
                AggregationUpdateJob::BalanceEdge { upper_id, task_id } => {
                    let (mut upper, mut task) = ctx.task_pair(upper_id, task_id);
                    let upper_aggregation_number = get_aggregation_number(&upper);
                    let task_aggregation_number = get_aggregation_number(&task);

                    let should_be_inner = is_root_node(upper_aggregation_number)
                        || upper_aggregation_number > task_aggregation_number;
                    let should_be_follower = task_aggregation_number > upper_aggregation_number;

                    if should_be_inner {
                        // remove all follower edges
                        let count = remove!(upper, Follower { task: task_id }).unwrap_or_default();
                        if count < 0 {
                            upper.add_new(CachedDataItem::Follower {
                                task: task_id,
                                value: count,
                            })
                        } else if count > 0 {
                            let upper_ids = get_uppers(&upper);

                            // Add the same amount of upper edges
                            if update_count!(task, Upper { task: upper_id }, count as i32) {
                                // When this is a new inner node, update aggregated data and
                                // followers
                                let data = AggregatedDataUpdate::from_task(&mut task);
                                let followers = get_followers(&task);
                                let diff = data.apply(&mut upper, self);

                                if !upper_ids.is_empty() {
                                    if !diff.is_empty() {
                                        // Notify uppers about changed aggregated data
                                        self.push(AggregationUpdateJob::AggregatedDataUpdate {
                                            upper_ids: upper_ids.clone(),
                                            update: diff,
                                        });
                                    }
                                }
                                if !followers.is_empty() {
                                    self.push(AggregationUpdateJob::InnerHasNewFollowers {
                                        upper_ids: vec![upper_id],
                                        new_follower_ids: followers,
                                    });
                                }
                            }

                            // notify uppers about lost follower
                            if !upper_ids.is_empty() {
                                self.push(AggregationUpdateJob::InnerLostFollower {
                                    upper_ids,
                                    lost_follower_id: task_id,
                                });
                            }
                        }
                    } else if should_be_follower {
                        // Remove the upper edge
                        let count = remove!(task, Upper { task: upper_id }).unwrap_or_default();
                        if count > 0 {
                            let upper_ids: Vec<_> = get_uppers(&upper);

                            // Add the same amount of follower edges
                            if update_count!(upper, Follower { task: task_id }, count as i32) {
                                // notify uppers about new follower
                                if !upper_ids.is_empty() {
                                    self.push(AggregationUpdateJob::InnerHasNewFollower {
                                        upper_ids: upper_ids.clone(),
                                        new_follower_id: task_id,
                                    });
                                }
                            }

                            // Since this is no longer an inner node, update the aggregated data and
                            // followers
                            let data = AggregatedDataUpdate::from_task(&mut task).invert();
                            let followers = get_followers(&task);
                            let diff = data.apply(&mut upper, self);
                            if !upper_ids.is_empty() {
                                if !diff.is_empty() {
                                    self.push(AggregationUpdateJob::AggregatedDataUpdate {
                                        upper_ids: upper_ids.clone(),
                                        update: diff,
                                    });
                                }
                            }
                            if !followers.is_empty() {
                                self.push(AggregationUpdateJob::InnerLostFollowers {
                                    upper_ids: vec![upper_id],
                                    lost_follower_ids: followers,
                                });
                            }
                        }
                    } else {
                        // both nodes have the same aggregation number
                        // We need to change the aggregation number of the task
                        let new_aggregation_number = upper_aggregation_number + 1;
                        self.push(AggregationUpdateJob::UpdateAggregationNumber {
                            task_id,
                            aggregation_number: new_aggregation_number,
                        });
                    }
                }
            }
        }

        self.jobs.is_empty()
    }
}

impl Operation for AggregationUpdateQueue {
    fn execute(mut self, ctx: &ExecuteContext<'_>) {
        let _span = tracing::trace_span!("aggregation update queue").entered();
        loop {
            ctx.operation_suspend_point(&self);
            if self.process(ctx) {
                return;
            }
        }
    }
}
