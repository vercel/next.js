use std::{collections::HashMap, ops::Add};

use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::{ExecuteContext, TaskGuard};
use crate::{
    data::{CachedDataItem, CachedDataItemKey},
    get, get_many, update, update_count,
};

#[derive(Serialize, Deserialize, Clone)]
pub enum AggregationUpdateJob {
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
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregatedDataUpdate {
    unfinished: i32,
    dirty_tasks_update: HashMap<TaskId, i32>,
    // TODO collectibles
}

impl AggregatedDataUpdate {
    fn from_task(task: &mut TaskGuard<'_>) -> Self {
        let aggregation = get!(task, AggregationNumber);
        if aggregation.is_some() {
            let unfinished = get!(task, AggregatedUnfinishedTasks);
            let dirty_tasks_update = task
                .iter()
                .filter_map(|(key, _)| match *key {
                    CachedDataItemKey::AggregatedDirtyTask { task } => Some((task, 1)),
                    _ => None,
                })
                .collect();
            Self {
                unfinished: unfinished.copied().unwrap_or(0) as i32,
                dirty_tasks_update,
            }
        } else {
            let dirty = get!(task, Dirty);
            if dirty.is_some() {
                Self::dirty_task(task.id())
            } else {
                Self::default()
            }
        }
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
                let new = (old as i32 + *unfinished) as u32;
                if new == 0 {
                    result.unfinished = -1;
                    None
                } else {
                    if old > 0 {
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
                        if old == 0 {
                            if root_type.is_some() {
                                task_to_schedule.push(*task_id);
                            }
                        }
                        let new = (old as i32 + *count) as u32;
                        if new == 0 {
                            result.dirty_tasks_update.insert(*task_id, -1);
                            None
                        } else {
                            if old > 0 {
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
            *dirty_tasks_update.entry(task).or_default() += count;
        }
        Self {
            unfinished: self.unfinished + rhs.unfinished,
            dirty_tasks_update,
        }
    }
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregationUpdateQueue {
    jobs: Vec<AggregationUpdateJob>,
}

impl AggregationUpdateQueue {
    pub fn new() -> Self {
        Self { jobs: Vec::new() }
    }

    pub fn is_empty(&self) -> bool {
        self.jobs.is_empty()
    }

    pub fn push(&mut self, job: AggregationUpdateJob) {
        self.jobs.push(job);
    }

    pub fn process(&mut self, ctx: &ExecuteContext<'_>) -> bool {
        if let Some(job) = self.jobs.pop() {
            match job {
                AggregationUpdateJob::InnerHasNewFollowers {
                    upper_ids,
                    mut new_follower_ids,
                } => {
                    if let Some(new_follower_id) = new_follower_ids.pop() {
                        if new_follower_ids.is_empty() {
                            self.jobs.push(AggregationUpdateJob::InnerHasNewFollower {
                                upper_ids,
                                new_follower_id,
                            });
                        } else {
                            self.jobs.push(AggregationUpdateJob::InnerHasNewFollowers {
                                upper_ids: upper_ids.clone(),
                                new_follower_ids,
                            });
                            self.jobs.push(AggregationUpdateJob::InnerHasNewFollower {
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
                    upper_ids.retain(|&_upper_id| {
                        // let mut upper = ctx.task(upper_id);
                        // TODO decide if it should be an inner or follower
                        // TODO for now: always inner

                        // TODO add new_follower_data
                        // TODO propagate change to all uppers

                        // TODO return true for inner, false for follower
                        true
                    });
                    let children: Vec<TaskId>;
                    let data;
                    {
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
                            data = AggregatedDataUpdate::from_task(&mut follower);
                            children = get_many!(follower, Child { task } => task);
                        } else {
                            data = Default::default();
                            children = Default::default();
                        }
                    }
                    for upper_id in upper_ids.iter() {
                        // add data to upper
                        let mut upper = ctx.task(*upper_id);
                        let diff = data.apply(&mut upper, self);
                        if !diff.is_empty() {
                            let upper_ids = get_many!(upper, Upper { task } => task);
                            self.jobs.push(AggregationUpdateJob::AggregatedDataUpdate {
                                upper_ids,
                                update: diff,
                            })
                        }
                    }
                    if !children.is_empty() {
                        self.jobs.push(AggregationUpdateJob::InnerHasNewFollowers {
                            upper_ids: upper_ids.clone(),
                            new_follower_ids: children,
                        });
                    }
                }
                AggregationUpdateJob::InnerLostFollower {
                    upper_ids,
                    lost_follower_id,
                } => {
                    for upper_id in upper_ids {
                        let mut upper = ctx.task(upper_id);
                        upper.remove(&CachedDataItemKey::Upper {
                            task: lost_follower_id,
                        });
                        let diff = AggregatedDataUpdate::dirty_task(lost_follower_id);
                        let upper_ids = get_many!(upper, Upper { task } => task);
                        self.jobs.push(AggregationUpdateJob::AggregatedDataUpdate {
                            upper_ids,
                            update: diff,
                        });
                    }
                }
                AggregationUpdateJob::AggregatedDataUpdate { upper_ids, update } => {
                    for upper_id in upper_ids {
                        let mut upper = ctx.task(upper_id);
                        let diff = update.apply(&mut upper, self);
                        if !diff.is_empty() {
                            let upper_ids = get_many!(upper, Upper { task } => task);
                            self.jobs.push(AggregationUpdateJob::AggregatedDataUpdate {
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
                        self.jobs.push(AggregationUpdateJob::AggregatedDataUpdate {
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
            }
        }

        self.jobs.is_empty()
    }
}
