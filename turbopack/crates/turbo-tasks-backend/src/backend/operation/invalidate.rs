use std::fmt::Display;

use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{registry, TaskId, TraitTypeId, ValueTypeId};

use crate::{
    backend::{
        operation::{
            aggregation_update::{
                AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue,
            },
            ExecuteContext, Operation, TaskGuard,
        },
        storage::{get, get_mut},
        TaskDataCategory,
    },
    data::{CachedDataItem, CachedDataItemKey, CachedDataItemValue, DirtyState, InProgressState},
};

#[derive(Serialize, Deserialize, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum InvalidateOperation {
    // TODO DetermineActiveness
    MakeDirty {
        task_ids: SmallVec<[TaskId; 4]>,
        cause: TaskDirtyCause,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl InvalidateOperation {
    pub fn run(
        task_ids: SmallVec<[TaskId; 4]>,
        cause: TaskDirtyCause,
        mut ctx: impl ExecuteContext,
    ) {
        InvalidateOperation::MakeDirty { task_ids, cause }.execute(&mut ctx)
    }
}

impl Operation for InvalidateOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                InvalidateOperation::MakeDirty { task_ids, cause } => {
                    let mut queue = AggregationUpdateQueue::new();
                    for task_id in task_ids {
                        make_task_dirty(task_id, cause, &mut queue, ctx);
                    }
                    if queue.is_empty() {
                        self = InvalidateOperation::Done
                    } else {
                        self = InvalidateOperation::AggregationUpdate { queue }
                    }
                    continue;
                }
                InvalidateOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = InvalidateOperation::Done
                    }
                }
                InvalidateOperation::Done => {
                    return;
                }
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub enum TaskDirtyCause {
    InitialDirty,
    CellChange { value_type: ValueTypeId },
    CellRemoved { value_type: ValueTypeId },
    OutputChange { task_id: TaskId },
    CollectiblesChange { collectible_type: TraitTypeId },
    Invalidator,
    Unknown,
}

struct TaskDirtyCauseInContext<'l, 'e, E: ExecuteContext<'e>> {
    cause: &'l TaskDirtyCause,
    ctx: &'l E,
    _phantom: std::marker::PhantomData<&'e ()>,
}

impl<'l, 'e, E: ExecuteContext<'e>> TaskDirtyCauseInContext<'l, 'e, E> {
    fn new(cause: &'l TaskDirtyCause, ctx: &'l E) -> Self {
        Self {
            cause,
            ctx,
            _phantom: Default::default(),
        }
    }
}

impl<'e, E: ExecuteContext<'e>> Display for TaskDirtyCauseInContext<'_, 'e, E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.cause {
            TaskDirtyCause::InitialDirty => write!(f, "initial dirty"),
            TaskDirtyCause::CellChange { value_type } => {
                write!(
                    f,
                    "{} cell changed",
                    registry::get_value_type(*value_type).name
                )
            }
            TaskDirtyCause::CellRemoved { value_type } => {
                write!(
                    f,
                    "{} cell removed",
                    registry::get_value_type(*value_type).name
                )
            }
            TaskDirtyCause::OutputChange { task_id } => {
                write!(
                    f,
                    "task {} output changed",
                    self.ctx.get_task_description(*task_id)
                )
            }
            TaskDirtyCause::CollectiblesChange { collectible_type } => {
                write!(
                    f,
                    "{} collectible changed",
                    registry::get_trait(*collectible_type).name
                )
            }
            TaskDirtyCause::Invalidator => write!(f, "invalidator"),
            TaskDirtyCause::Unknown => write!(f, "unknown"),
        }
    }
}

pub fn make_task_dirty(
    task_id: TaskId,
    cause: TaskDirtyCause,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut impl ExecuteContext,
) {
    if ctx.is_once_task(task_id) {
        return;
    }

    let mut task = ctx.task(task_id, TaskDataCategory::All);

    make_task_dirty_internal(&mut task, task_id, true, cause, queue, ctx);
}

pub fn make_task_dirty_internal(
    task: &mut impl TaskGuard,
    task_id: TaskId,
    make_stale: bool,
    cause: TaskDirtyCause,
    queue: &mut AggregationUpdateQueue,
    ctx: &impl ExecuteContext,
) {
    if make_stale {
        if let Some(InProgressState::InProgress { stale, .. }) = get_mut!(task, InProgress) {
            if !*stale {
                let _span = tracing::trace_span!(
                    "make task stale",
                    name = ctx.get_task_description(task_id),
                    cause = %TaskDirtyCauseInContext::new(&cause, ctx)
                )
                .entered();
                *stale = true;
            }
        }
    }
    let old = task.insert(CachedDataItem::Dirty {
        value: DirtyState {
            clean_in_session: None,
        },
    });
    let mut dirty_container = match old {
        Some(CachedDataItemValue::Dirty {
            value: DirtyState {
                clean_in_session: None,
            },
        }) => {
            let _span = tracing::trace_span!(
                "task already dirty",
                name = ctx.get_task_description(task_id),
                cause = %TaskDirtyCauseInContext::new(&cause, ctx)
            )
            .entered();
            // already dirty
            return;
        }
        Some(CachedDataItemValue::Dirty {
            value: DirtyState {
                clean_in_session: Some(session_id),
            },
        }) => {
            // Got dirty in that one session only
            let mut dirty_container = get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default();
            dirty_container.update_session_dependent(session_id, 1);
            dirty_container
        }
        None => {
            // Get dirty for all sessions
            get!(task, AggregatedDirtyContainerCount)
                .cloned()
                .unwrap_or_default()
        }
        _ => unreachable!(),
    };

    let _span = tracing::trace_span!(
        "make task dirty",
        name = ctx.get_task_description(task_id),
        cause = %TaskDirtyCauseInContext::new(&cause, ctx)
    )
    .entered();

    let should_schedule = if ctx.should_track_children() {
        let aggregated_update = dirty_container.update_with_dirty_state(&DirtyState {
            clean_in_session: None,
        });
        if !aggregated_update.is_zero() {
            queue.extend(AggregationUpdateJob::data_update(
                task,
                AggregatedDataUpdate::new().dirty_container_update(task_id, aggregated_update),
            ));
        }
        task.has_key(&CachedDataItemKey::AggregateRoot {})
    } else {
        true
    };

    if should_schedule {
        let description = ctx.get_task_desc_fn(task_id);
        if task.add(CachedDataItem::new_scheduled(description)) {
            ctx.schedule(task_id);
        }
    }
}
