use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
use turbo_tasks::{TaskExecutionReason, TaskId};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, Operation, TaskGuard,
            aggregation_update::{
                AggregatedDataUpdate, AggregationUpdateJob, AggregationUpdateQueue,
            },
        },
        storage::{get, get_mut},
    },
    data::{
        CachedDataItem, CachedDataItemKey, CachedDataItemValue, DirtyState, InProgressState,
        InProgressStateInner,
    },
};

#[derive(Serialize, Deserialize, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum InvalidateOperation {
    MakeDirty {
        task_ids: SmallVec<[TaskId; 4]>,
        #[cfg(feature = "trace_task_dirty")]
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
        #[cfg(feature = "trace_task_dirty")] cause: TaskDirtyCause,
        mut ctx: impl ExecuteContext,
    ) {
        InvalidateOperation::MakeDirty {
            task_ids,
            #[cfg(feature = "trace_task_dirty")]
            cause,
        }
        .execute(&mut ctx)
    }
}

impl Operation for InvalidateOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext) {
        loop {
            ctx.operation_suspend_point(&self);
            match self {
                InvalidateOperation::MakeDirty {
                    task_ids,
                    #[cfg(feature = "trace_task_dirty")]
                    cause,
                } => {
                    let mut queue = AggregationUpdateQueue::new();
                    for task_id in task_ids {
                        make_task_dirty(
                            task_id,
                            #[cfg(feature = "trace_task_dirty")]
                            cause,
                            &mut queue,
                            ctx,
                        );
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

#[cfg(feature = "trace_task_dirty")]
#[derive(Serialize, Deserialize, Clone, Copy, Debug)]
pub enum TaskDirtyCause {
    InitialDirty,
    CellChange {
        value_type: turbo_tasks::ValueTypeId,
    },
    CellRemoved {
        value_type: turbo_tasks::ValueTypeId,
    },
    OutputChange {
        task_id: TaskId,
    },
    CollectiblesChange {
        collectible_type: turbo_tasks::TraitTypeId,
    },
    Invalidator,
    Unknown,
}

#[cfg(feature = "trace_task_dirty")]
struct TaskDirtyCauseInContext<'l, 'e, E: ExecuteContext<'e>> {
    cause: &'l TaskDirtyCause,
    ctx: &'l E,
    _phantom: std::marker::PhantomData<&'e ()>,
}

#[cfg(feature = "trace_task_dirty")]
impl<'l, 'e, E: ExecuteContext<'e>> TaskDirtyCauseInContext<'l, 'e, E> {
    fn new(cause: &'l TaskDirtyCause, ctx: &'l E) -> Self {
        Self {
            cause,
            ctx,
            _phantom: Default::default(),
        }
    }
}

#[cfg(feature = "trace_task_dirty")]
impl<'e, E: ExecuteContext<'e>> std::fmt::Display for TaskDirtyCauseInContext<'_, 'e, E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.cause {
            TaskDirtyCause::InitialDirty => write!(f, "initial dirty"),
            TaskDirtyCause::CellChange { value_type } => {
                write!(
                    f,
                    "{} cell changed",
                    turbo_tasks::registry::get_value_type(*value_type).name
                )
            }
            TaskDirtyCause::CellRemoved { value_type } => {
                write!(
                    f,
                    "{} cell removed",
                    turbo_tasks::registry::get_value_type(*value_type).name
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
                    turbo_tasks::registry::get_trait(*collectible_type).name
                )
            }
            TaskDirtyCause::Invalidator => write!(f, "invalidator"),
            TaskDirtyCause::Unknown => write!(f, "unknown"),
        }
    }
}

pub fn make_task_dirty(
    task_id: TaskId,
    #[cfg(feature = "trace_task_dirty")] cause: TaskDirtyCause,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut impl ExecuteContext,
) {
    if ctx.is_once_task(task_id) {
        return;
    }

    let task = ctx.task(task_id, TaskDataCategory::Meta);

    make_task_dirty_internal(
        task,
        task_id,
        true,
        #[cfg(feature = "trace_task_dirty")]
        cause,
        queue,
        ctx,
    );
}

pub fn make_task_dirty_internal(
    mut task: impl TaskGuard,
    task_id: TaskId,
    make_stale: bool,
    #[cfg(feature = "trace_task_dirty")] cause: TaskDirtyCause,
    queue: &mut AggregationUpdateQueue,
    ctx: &mut impl ExecuteContext,
) {
    // There must be no way to invalidate immutable tasks. If there would be a way the task is not
    // immutable.
    #[cfg(any(debug_assertions, feature = "verify_immutable"))]
    if task.is_immutable() {
        #[cfg(feature = "trace_task_dirty")]
        let extra_info = format!(
            " Invalidation cause: {}",
            TaskDirtyCauseInContext::new(&cause, ctx)
        );
        #[cfg(not(feature = "trace_task_dirty"))]
        let extra_info = "";

        panic!(
            "Task {} is immutable, but was made dirty. This should not happen and is a \
             bug.{extra_info}",
            ctx.get_task_description(task_id),
        );
    }

    if make_stale
        && let Some(InProgressState::InProgress(box InProgressStateInner { stale, .. })) =
            get_mut!(task, InProgress)
        && !*stale
    {
        #[cfg(feature = "trace_task_dirty")]
        let _span = tracing::trace_span!(
            "make task stale",
            name = ctx.get_task_description(task_id),
            cause = %TaskDirtyCauseInContext::new(&cause, ctx)
        )
        .entered();
        *stale = true;
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
            #[cfg(feature = "trace_task_dirty")]
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

    #[cfg(feature = "trace_task_dirty")]
    let _span = tracing::trace_span!(
        "make task dirty",
        name = ctx.get_task_description(task_id),
        cause = %TaskDirtyCauseInContext::new(&cause, ctx)
    )
    .entered();

    let should_schedule = {
        let aggregated_update = dirty_container.update_with_dirty_state(&DirtyState {
            clean_in_session: None,
        });
        if !aggregated_update.is_zero() {
            queue.extend(AggregationUpdateJob::data_update(
                &mut task,
                AggregatedDataUpdate::new().dirty_container_update(task_id, aggregated_update),
            ));
        }
        !ctx.should_track_activeness() || task.has_key(&CachedDataItemKey::Activeness {})
    };

    if should_schedule {
        let description = || ctx.get_task_desc_fn(task_id);
        if task.add(CachedDataItem::new_scheduled(
            TaskExecutionReason::Invalidated,
            description,
        )) {
            drop(task);
            let task = ctx.task(task_id, TaskDataCategory::All);
            ctx.schedule_task(task);
        }
    }
}
