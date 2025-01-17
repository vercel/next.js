use std::{cmp::max, num::NonZeroU32};

use serde::{Deserialize, Serialize};
use turbo_tasks::TaskId;

use crate::{
    backend::{
        operation::{
            aggregation_update::{
                get_uppers, is_aggregating_node, AggregationUpdateJob, AggregationUpdateQueue,
                LEAF_NUMBER,
            },
            is_root_node, ExecuteContext, Operation, TaskGuard,
        },
        storage::{count, get},
        TaskDataCategory,
    },
    data::{CachedDataItem, CachedDataItemKey},
};

const AGGREGATION_NUMBER_BUFFER_SPACE: u32 = 3;

#[derive(Serialize, Deserialize, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum ConnectChildOperation {
    UpdateAggregation {
        aggregation_update: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl ConnectChildOperation {
    pub fn run(parent_task_id: TaskId, child_task_id: TaskId, mut ctx: impl ExecuteContext) {
        if !ctx.should_track_children() {
            let mut task = ctx.task(child_task_id, TaskDataCategory::Data);
            if !task.has_key(&CachedDataItemKey::Output {}) {
                let description = ctx.get_task_desc_fn(child_task_id);
                let should_schedule = task.add(CachedDataItem::new_scheduled(description));
                drop(task);
                if should_schedule {
                    ctx.schedule(child_task_id);
                }
            }
            return;
        }
        let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::All);
        // Quick skip if the child was already connected before
        if parent_task
            .remove(&CachedDataItemKey::OutdatedChild {
                task: child_task_id,
            })
            .is_some()
        {
            return;
        }
        if parent_task.add(CachedDataItem::Child {
            task: child_task_id,
            value: (),
        }) {
            let mut queue = AggregationUpdateQueue::new();

            if get!(parent_task, Activeness).is_some_and(|a| a.active_counter > 0) {
                queue.push(AggregationUpdateJob::IncreaseActiveCount {
                    task: child_task_id,
                })
            }

            // Get the children count
            let children_count = count!(parent_task, Child);

            // Compute future parent aggregation number based on the number of children
            let current_parent_aggregation = get!(parent_task, AggregationNumber)
                .copied()
                .unwrap_or_default();
            let (parent_aggregation, future_parent_aggregation) =
                if is_root_node(current_parent_aggregation.base) {
                    (u32::MAX, u32::MAX)
                } else {
                    let target_distance = children_count.ilog2() * 2;
                    if target_distance > current_parent_aggregation.distance {
                        queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                            task_id: parent_task_id,
                            base_aggregation_number: 0,
                            distance: NonZeroU32::new(target_distance),
                        })
                    }
                    (
                        current_parent_aggregation.effective,
                        current_parent_aggregation.base.saturating_add(max(
                            target_distance,
                            current_parent_aggregation.distance,
                        )),
                    )
                };

            // Update child aggregation number based on parent aggregation number
            let aggregating_node = is_aggregating_node(parent_aggregation);
            if parent_task_id.is_transient() && !child_task_id.is_transient() {
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: u32::MAX,
                    distance: None,
                });
            } else if !aggregating_node {
                let base_aggregation_number =
                    future_parent_aggregation.saturating_add(AGGREGATION_NUMBER_BUFFER_SPACE);
                queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                    task_id: child_task_id,
                    base_aggregation_number: if is_aggregating_node(
                        base_aggregation_number.saturating_add(AGGREGATION_NUMBER_BUFFER_SPACE - 1),
                    ) {
                        LEAF_NUMBER
                    } else {
                        base_aggregation_number
                    },
                    distance: None,
                });
            }
            if aggregating_node {
                queue.push(AggregationUpdateJob::InnerOfUpperHasNewFollower {
                    upper_id: parent_task_id,
                    new_follower_id: child_task_id,
                });
            } else {
                let upper_ids = get_uppers(&parent_task);
                queue.push(AggregationUpdateJob::InnerOfUppersHasNewFollower {
                    upper_ids,
                    new_follower_id: child_task_id,
                });
            }
            drop(parent_task);

            {
                let mut task = ctx.task(child_task_id, TaskDataCategory::Meta);
                if !task.has_key(&CachedDataItemKey::Output {}) {
                    let description = ctx.get_task_desc_fn(child_task_id);
                    let should_schedule = task.add(CachedDataItem::new_scheduled(description));
                    drop(task);
                    if should_schedule {
                        ctx.schedule(child_task_id);
                    }
                }
            }

            #[cfg(feature = "trace_aggregation_update")]
            let _span = tracing::trace_span!("connect_child").entered();
            ConnectChildOperation::UpdateAggregation {
                aggregation_update: queue,
            }
            .execute(&mut ctx);
        }
    }
}

impl Operation for ConnectChildOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                ConnectChildOperation::UpdateAggregation {
                    ref mut aggregation_update,
                } => {
                    if aggregation_update.process(ctx) {
                        self = ConnectChildOperation::Done
                    }
                }

                ConnectChildOperation::Done => {
                    return;
                }
            }
        }
    }
}
