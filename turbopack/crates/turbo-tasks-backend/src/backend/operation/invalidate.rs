use bincode::{Decode, Encode};
use smallvec::SmallVec;
use turbo_tasks::{TaskExecutionReason, TaskId, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext, Operation, TaskGuard,
            aggregation_update::{
                AggregationUpdateJob, AggregationUpdateQueue, ComputeDirtyAndCleanUpdate,
            },
        },
    },
    data::{Dirtyness, InProgressState, InProgressStateInner},
};

#[derive(Encode, Decode, Clone, Default)]
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
        mut ctx: impl ExecuteContext<'_>,
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
    fn execute(mut self, ctx: &mut impl ExecuteContext<'_>) {
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
                            cause.clone(),
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
#[derive(Encode, Decode, Clone, Debug)]
pub enum TaskDirtyCause {
    InitialDirty,
    CellChange {
        value_type: turbo_tasks::ValueTypeId,
        keys: SmallVec<[Option<u64>; 2]>,
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
struct TaskDirtyCauseInContext<'l> {
    cause: &'l TaskDirtyCause,
    task_description: String,
}

#[cfg(feature = "trace_task_dirty")]
impl<'l> TaskDirtyCauseInContext<'l> {
    fn new(cause: &'l TaskDirtyCause, ctx: &'l mut impl ExecuteContext<'_>) -> Self {
        Self {
            cause,
            task_description: match cause {
                TaskDirtyCause::OutputChange { task_id } => ctx
                    .task(*task_id, TaskDataCategory::Data)
                    .get_task_description(),
                _ => String::new(),
            },
        }
    }
}

#[cfg(feature = "trace_task_dirty")]
impl std::fmt::Display for TaskDirtyCauseInContext<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self.cause {
            TaskDirtyCause::InitialDirty => write!(f, "initial dirty"),
            TaskDirtyCause::CellChange { value_type, keys } => {
                if keys.is_empty() {
                    write!(
                        f,
                        "{} cell changed",
                        turbo_tasks::registry::get_value_type(*value_type).name
                    )
                } else {
                    write!(
                        f,
                        "{} cell changed (keys: {})",
                        turbo_tasks::registry::get_value_type(*value_type).name,
                        keys.iter()
                            .map(|key| match key {
                                Some(k) => k.to_string(),
                                None => "*".to_string(),
                            })
                            .collect::<Vec<_>>()
                            .join(", ")
                    )
                }
            }
            TaskDirtyCause::CellRemoved { value_type } => {
                write!(
                    f,
                    "{} cell removed",
                    turbo_tasks::registry::get_value_type(*value_type).name
                )
            }
            TaskDirtyCause::OutputChange { .. } => {
                write!(f, "task {} output changed", self.task_description)
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
    ctx: &mut impl ExecuteContext<'_>,
) {
    let task = ctx.task(task_id, TaskDataCategory::All);
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
    ctx: &mut impl ExecuteContext<'_>,
) {
    // There must be no way to invalidate immutable tasks. If there would be a way the task is not
    // immutable.
    #[cfg(any(debug_assertions, feature = "verify_immutable"))]
    if task.immutable() {
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
            task.get_task_description(),
        );
    }

    #[cfg(feature = "trace_task_dirty")]
    let task_name = task.get_task_name();
    if make_stale
        && let Some(InProgressState::InProgress(box InProgressStateInner { stale, .. })) =
            task.get_in_progress_mut()
        && !*stale
    {
        #[cfg(feature = "trace_task_dirty")]
        let _span = tracing::trace_span!(
            "make task stale",
            task_id = display(task_id),
            name = task_name,
            cause = %TaskDirtyCauseInContext::new(&cause, ctx)
        )
        .entered();
        *stale = true;
    }
    let current = task.get_dirty();
    let (old_self_dirty, old_current_session_self_clean, parent_priority) = match current {
        Some(Dirtyness::Dirty(current_priority)) => {
            #[cfg(feature = "trace_task_dirty")]
            let _span = tracing::trace_span!(
                "task already dirty",
                task_id = display(task_id),
                name = task_name,
                cause = %TaskDirtyCauseInContext::new(&cause, ctx)
            )
            .entered();
            // already dirty
            let parent_priority = ctx.get_current_task_priority();
            if *current_priority >= parent_priority {
                // Update the priority to be the lower one
                task.set_dirty(Dirtyness::Dirty(parent_priority));
            }
            return;
        }
        Some(Dirtyness::SessionDependent) => {
            let parent_priority = ctx.get_current_task_priority();
            task.set_dirty(Dirtyness::Dirty(parent_priority));
            // It was a session-dependent dirty before, so we need to remove that clean count
            let was_current_session_clean = task.current_session_clean();
            if was_current_session_clean {
                task.set_current_session_clean(false);
                // There was a clean count for a session. If it was the current session, we need to
                // propagate that change.
                (true, true, parent_priority)
            } else {
                #[cfg(feature = "trace_task_dirty")]
                let _span = tracing::trace_span!(
                    "session-dependent task already dirty",
                    name = task_name,
                    cause = %TaskDirtyCauseInContext::new(&cause, ctx)
                )
                .entered();
                // already dirty
                return;
            }
        }
        None => {
            let parent_priority = ctx.get_current_task_priority();
            task.set_dirty(Dirtyness::Dirty(parent_priority));
            // It was clean before, so we need to increase the dirty count
            (false, false, parent_priority)
        }
    };

    let new_self_dirty = true;
    let new_current_session_self_clean = false;

    let dirty_container_count = task
        .get_aggregated_dirty_container_count()
        .copied()
        .unwrap_or_default();
    let current_session_clean_container_count = task
        .get_aggregated_current_session_clean_container_count()
        .copied()
        .unwrap_or_default();

    #[cfg(feature = "trace_task_dirty")]
    let _span = tracing::trace_span!(
        "make task dirty",
        task_id = display(task_id),
        name = task_name,
        cause = %TaskDirtyCauseInContext::new(&cause, ctx)
    )
    .entered();

    let result = ComputeDirtyAndCleanUpdate {
        old_dirty_container_count: dirty_container_count,
        new_dirty_container_count: dirty_container_count,
        old_current_session_clean_container_count: current_session_clean_container_count,
        new_current_session_clean_container_count: current_session_clean_container_count,
        old_self_dirty,
        new_self_dirty,
        old_current_session_self_clean,
        new_current_session_self_clean,
    }
    .compute();

    if let Some(aggregated_update) = result.aggregated_update(task_id) {
        queue.extend(AggregationUpdateJob::data_update(
            &mut task,
            aggregated_update,
        ));
    }

    let should_schedule = !ctx.should_track_activeness() || task.has_activeness();

    if should_schedule {
        let description = EventDescription::new(|| task.get_task_desc_fn());
        if task.add_scheduled(TaskExecutionReason::Invalidated, description) {
            drop(task);
            let task = ctx.task(task_id, TaskDataCategory::All);
            ctx.schedule_task(task, parent_priority);
        }
    }
}
