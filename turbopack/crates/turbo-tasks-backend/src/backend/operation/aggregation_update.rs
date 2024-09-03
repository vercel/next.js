use std::{
    collections::{hash_map::Entry, HashMap, VecDeque},
    ops::Add,
};

use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{ExecuteContext, TaskGuard};
use crate::{
    data::{CachedDataItem, CachedDataItemKey},
    get, get_many, iter_many, update, update_count,
};

const LEAF_NUMBER: u32 = 8;

pub fn is_aggregating_node(aggregation_number: u32) -> bool {
    aggregation_number >= LEAF_NUMBER
}

pub fn is_root_node(aggregation_number: u32) -> bool {
    aggregation_number == u32::MAX
}

#[derive(Serialize, Deserialize, Clone)]
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

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregatedDataUpdate {
    unfinished: i32,
    dirty_tasks_update: HashMap<TaskId, i32>,
    // TODO collectibles
}

impl AggregatedDataUpdate {
    fn from_task(task: &mut TaskGuard<'_>) -> Self {
        let aggregation = get!(task, AggregationNumber).copied().unwrap_or_default();
        let dirty = get!(task, Dirty).is_some();
        if is_aggregating_node(aggregation) {
            let mut unfinished = get!(task, AggregatedUnfinishedTasks).copied().unwrap_or(0);
            let mut dirty_tasks_update = task
                .iter()
                .filter_map(|(key, _)| match *key {
                    CachedDataItemKey::AggregatedDirtyTask { task } => Some((task, 1)),
                    _ => None,
                })
                .collect::<HashMap<_, _>>();
            if dirty {
                unfinished += 1;
                dirty_tasks_update.insert(task.id(), 1);
            }
            Self {
                unfinished: unfinished as i32,
                dirty_tasks_update,
            }
        } else if dirty {
            Self::dirty_task(task.id())
        } else {
            Self::default()
        }
    }

    fn invert(mut self) -> Self {
        self.unfinished = -self.unfinished;
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
            unfinished,
            dirty_tasks_update,
        } = self;
        let mut result = Self::default();
        if *unfinished != 0 {
            update!(task, AggregatedUnfinishedTasks, |old: Option<u32>| {
                let old = old.unwrap_or(0);
                let new = old as i32 + *unfinished;
                debug_assert!(new >= 0);
                let new = new as u32;
                if new == 0 {
                    result.unfinished = -1;
                    None
                } else {
                    if old <= 0 && new > 0 {
                        result.unfinished = 1;
                    }
                    Some(new)
                }
            });
        }
        if !dirty_tasks_update.is_empty() {
            let mut task_to_schedule = Vec::new();
            let root_type = get!(task, AggregateRootType).copied();
            for (task_id, count) in dirty_tasks_update {
                update!(
                    task,
                    AggregatedDirtyTask { task: *task_id },
                    |old: Option<u32>| {
                        let old = old.unwrap_or(0);
                        let new = old as i32 + *count;
                        debug_assert!(new >= 0);
                        let new = new as u32;
                        if new == 0 {
                            result.dirty_tasks_update.insert(*task_id, -1);
                            None
                        } else {
                            if old <= 0 && new > 0 {
                                if root_type.is_some() {
                                    task_to_schedule.push(*task_id);
                                }
                                result.dirty_tasks_update.insert(*task_id, 1);
                            }
                            Some(new)
                        }
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
            unfinished,
            dirty_tasks_update,
        } = self;
        *unfinished == 0 && dirty_tasks_update.is_empty()
    }

    pub fn dirty_task(task_id: TaskId) -> Self {
        Self {
            unfinished: 1,
            dirty_tasks_update: HashMap::from([(task_id, 1)]),
        }
    }

    pub fn no_longer_dirty_task(task_id: TaskId) -> Self {
        Self {
            unfinished: -1,
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
            unfinished: self.unfinished + rhs.unfinished,
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
            jobs: VecDeque::new(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }

    pub fn push(&mut self, job: AggregationUpdateJob) {
        self.jobs.push_back(job);
    }

    pub fn process(&mut self, ctx: &ExecuteContext<'_>) -> bool {
        if let Some(job) = self.jobs.pop_back() {
            match job {
                AggregationUpdateJob::UpdateAggregationNumber {
                    task_id,
                    aggregation_number,
                } => {
                    let mut task = ctx.task(task_id);
                    let old = get!(task, AggregationNumber).copied().unwrap_or_default();
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
                            let followers = iter_many!(task, Follower { task } => task);
                            for follower_id in followers {
                                self.jobs.push_back(AggregationUpdateJob::BalanceEdge {
                                    upper_id: task_id,
                                    task_id: follower_id,
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
                        get!(follower, AggregationNumber)
                            .copied()
                            .unwrap_or_default()
                    };
                    let mut upper_ids_as_follower = Vec::new();
                    upper_ids.retain(|&upper_id| {
                        let upper = ctx.task(upper_id);
                        // decide if it should be an inner or follower
                        let upper_aggregation_number =
                            get!(upper, AggregationNumber).copied().unwrap_or_default();

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
                            let children: Vec<_> = get_many!(follower, Child { task } => task);
                            drop(follower);

                            for upper_id in upper_ids.iter() {
                                // add data to upper
                                let mut upper = ctx.task(*upper_id);
                                let diff = data.apply(&mut upper, self);
                                if !diff.is_empty() {
                                    let upper_ids = get_many!(upper, Upper { task } => task);
                                    self.jobs.push_back(
                                        AggregationUpdateJob::AggregatedDataUpdate {
                                            upper_ids,
                                            update: diff,
                                        },
                                    )
                                }
                            }
                            if !children.is_empty() {
                                self.jobs
                                    .push_back(AggregationUpdateJob::InnerHasNewFollowers {
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
                            self.jobs
                                .push_back(AggregationUpdateJob::InnerHasNewFollower {
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
                        let children: Vec<_> = get_many!(follower, Child { task } => task);
                        drop(follower);

                        for upper_id in upper_ids.iter() {
                            // remove data from upper
                            let mut upper = ctx.task(*upper_id);
                            let diff = data.apply(&mut upper, self);
                            if !diff.is_empty() {
                                let upper_ids = get_many!(upper, Upper { task } => task);
                                self.jobs
                                    .push_back(AggregationUpdateJob::AggregatedDataUpdate {
                                        upper_ids,
                                        update: diff,
                                    })
                            }
                        }
                        if !children.is_empty() {
                            self.jobs
                                .push_back(AggregationUpdateJob::InnerLostFollowers {
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
                            self.jobs
                                .push_back(AggregationUpdateJob::InnerLostFollower {
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
                            let upper_ids = get_many!(upper, Upper { task } => task);
                            self.jobs
                                .push_back(AggregationUpdateJob::AggregatedDataUpdate {
                                    upper_ids,
                                    update: diff,
                                });
                        }
                    }
                }
                AggregationUpdateJob::DataUpdate { task_id, update } => {
                    let mut task = ctx.task(task_id);
                    let diff = update.apply(&mut task, self);
                    if !diff.is_empty() {
                        let upper_ids = get_many!(task, Upper { task } => task);
                        self.jobs
                            .push_back(AggregationUpdateJob::AggregatedDataUpdate {
                                upper_ids,
                                update: diff,
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
                AggregationUpdateJob::BalanceEdge {
                    upper_id: _,
                    task_id: _,
                } => {
                    // TODO: implement
                    // Ignore for now
                }
            }
        }

        self.jobs.is_empty()
    }
}
