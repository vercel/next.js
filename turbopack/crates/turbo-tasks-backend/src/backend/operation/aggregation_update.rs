use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use super::ExecuteContext;
use crate::data::{CachedDataItem, CachedDataItemKey};

#[derive(Serialize, Deserialize, Clone)]
pub enum AggregationUpdateJob {
    InnerHasNewFollower {
        upper_ids: Vec<TaskId>,
        new_follower_id: TaskId,
        new_follower_data: (),
    },
}

#[derive(Default, Serialize, Deserialize, Clone)]
pub struct AggregationUpdateQueue {
    jobs: Vec<AggregationUpdateJob>,
}

impl AggregationUpdateQueue {
    pub fn new() -> Self {
        Self { jobs: Vec::new() }
    }

    pub fn push(&mut self, job: AggregationUpdateJob) {
        self.jobs.push(job);
    }

    pub fn process(&mut self, ctx: &ExecuteContext<'_>) -> bool {
        if let Some(job) = self.jobs.pop() {
            match job {
                AggregationUpdateJob::InnerHasNewFollower {
                    mut upper_ids,
                    new_follower_id,
                    new_follower_data,
                } => {
                    upper_ids.retain(|&upper_id| {
                        // let mut upper = ctx.task(upper_id);
                        // TODO decide if it should be an inner or follower
                        // TODO for now: always inner

                        // TODO add new_follower_data
                        // TODO propagate change to all uppers

                        // TODO return true for inner, false for follower
                        true
                    });
                    let children;
                    let data;
                    {
                        let mut follower = ctx.task(new_follower_id);
                        upper_ids.retain(|&upper_id| {
                            if follower.add(CachedDataItem::Upper {
                                task: upper_id,
                                value: (),
                            }) {
                                // It's a new upper
                                true
                            } else {
                                // It's already an upper
                                false
                            }
                        });
                        if !upper_ids.is_empty() {
                            // TODO get data
                            data = ();
                            children = follower
                                .iter()
                                .filter_map(|(key, _)| match *key {
                                    CachedDataItemKey::Child { task } => Some(task),
                                    _ => None,
                                })
                                .collect::<Vec<_>>();
                        } else {
                            data = Default::default();
                            children = Default::default();
                        }
                    }
                    for upper_id in upper_ids.iter() {
                        // TODO add data to upper
                    }
                    for child_id in children {
                        let child = ctx.task(child_id);
                        // TODO get child data
                        self.jobs.push(AggregationUpdateJob::InnerHasNewFollower {
                            upper_ids: upper_ids.clone(),
                            new_follower_id: child_id,
                            new_follower_data: (),
                        })
                    }
                }
            }
        }

        self.jobs.is_empty()
    }
}
