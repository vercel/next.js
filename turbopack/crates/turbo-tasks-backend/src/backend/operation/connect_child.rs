use turbo_tasks::{TaskExecutionReason, TaskId, event::EventDescription};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            ExecuteContext,
            aggregation_update::{AggregationUpdateJob, AggregationUpdateQueue},
        },
        storage_schema::TaskStorageAccessors,
    },
    data::{InProgressState, InProgressStateInner},
};

fn release_construction_ref(task_id: TaskId, ctx: &mut ExecuteContext<'_>) {
    let mut task = ctx.task(task_id, TaskDataCategory::Meta);
    task.update_and_get_transient_ref_count(-1);
}

pub fn connect_child(
    parent_task_id: Option<TaskId>,
    child_task_id: TaskId,
    release_construction_ref: bool,
    mut ctx: ExecuteContext<'_>,
) {
    if parent_task_id.is_none() {
        // All parentless tasks receive a transient ref when connected: their lifetime cannot be
        // constrained by turbo-tasks and needs to be managed by the caller. If the caller
        // doesn't manage it, the GC root TTL handles it in a later session.
        let mut child_task = ctx.task_or_create(child_task_id, TaskDataCategory::Meta);
        child_task.update_and_get_transient_ref_count(1);
    }
    if let Some(parent_task_id) = parent_task_id {
        let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::Meta);
        let Some(InProgressState::InProgress(InProgressStateInner { new_children, .. })) =
            parent_task.get_in_progress()
        else {
            panic!("Task is not in progress while calling another task: {parent_task:?}");
        };

        // Quick skip if the child was already connected before
        // We defer the insert until after the aggregation queue is processed.
        if new_children.contains(&child_task_id) {
            drop(parent_task);
            if release_construction_ref {
                self::release_construction_ref(child_task_id, &mut ctx);
            }
            return;
        }

        // `children` is the previous execution's set, inflated when the execution started.
        if parent_task.children_contains(&child_task_id) {
            // It is already connected, we can skip the rest
            // but we still need to update the new_children set
            let Some(InProgressState::InProgress(InProgressStateInner { new_children, .. })) =
                parent_task.get_in_progress_mut()
            else {
                unreachable!();
            };
            new_children.insert(child_task_id);
            drop(parent_task);
            if release_construction_ref {
                self::release_construction_ref(child_task_id, &mut ctx);
            }
            return;
        }
    }

    let mut queue = AggregationUpdateQueue::new();

    // Handle the transient to persistent boundary by making the persistent task a root task. The
    // root aggregates the whole persistent subgraph, so the transient parent only needs an edge
    // to that root instead of upper edges into the whole persistent graph.
    //
    // Parentless connects (e.g. calls from a `turbo_tasks::run` closure) have no upper at all, so
    // there is nothing to shield the graph from, for persistent and transient children alike.
    // Tasks that need to be roots are already roots: strongly consistent reads and reading
    // collectibles are only allowed on `root` functions, which are made roots when they are
    // created, and top-level transient tasks (root and once tasks) are created as roots. Making
    // every parentless callee a root would make each of them aggregate its whole (possibly large
    // and existing) subgraph.
    let should_make_root = parent_task_id.is_some_and(|parent_task_id| {
        parent_task_id.is_transient() && !child_task_id.is_transient()
    });

    if ctx.should_track_activeness() && parent_task_id.is_some() {
        if should_make_root {
            queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id: child_task_id,
                base_aggregation_number: u32::MAX,
                distance: None,
            });
        }
        queue.push(AggregationUpdateJob::IncreaseActiveCount {
            task: child_task_id,
            release_construction_ref,
        });
    } else {
        // First connect of this child: its id is minted but the storage entry may not exist
        // yet, and concurrent connects race to be the one that first touches it.
        let mut child_task = ctx.task_or_create(child_task_id, TaskDataCategory::Meta);

        let has_output = child_task.has_output();

        if should_make_root {
            queue.push(AggregationUpdateJob::UpdateAggregationNumber {
                task_id: child_task_id,
                base_aggregation_number: u32::MAX,
                distance: None,
            });
        }

        if !has_output
            && child_task.add_scheduled(
                TaskExecutionReason::Connect,
                EventDescription::new(|| child_task.get_task_desc_fn()),
            )
        {
            ctx.schedule_task(&child_task, ctx.get_current_task_priority());
        }
        if release_construction_ref {
            child_task.update_and_get_transient_ref_count(-1);
        }
    }

    if !queue.is_empty() {
        queue.execute(&mut ctx);
    }

    if let Some(parent_task_id) = parent_task_id {
        let mut parent_task = ctx.task(parent_task_id, TaskDataCategory::Meta);
        let Some(InProgressState::InProgress(InProgressStateInner { new_children, .. })) =
            parent_task.get_in_progress_mut()
        else {
            panic!("Task is not in progress while calling another task: {parent_task:?}");
        };

        // Really add the child to the new children set
        if !new_children.insert(child_task_id) {
            drop(parent_task);

            // There was a concurrent connect child operation,
            // so we need to undo the active count update.
            AggregationUpdateQueue::run(
                AggregationUpdateJob::DecreaseActiveCount {
                    task: child_task_id,
                },
                &mut ctx,
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use turbo_tasks::{TRANSIENT_TASK_BIT, TaskId, TurboTasks, event::Event};

    use super::connect_child;
    use crate::{
        backend::{
            BackendOptions, StorageMode, TaskDataCategory, TurboTasksBackend,
            operation::{ExecuteContext, aggregation_update::get_aggregation_number},
            storage_schema::TaskStorageAccessors,
        },
        data::{CellRef, InProgressState, InProgressStateInner, OutputValue},
        noop_backing_storage,
    };

    const PERSISTENT_CHILD: u32 = 1;
    const TRANSIENT_CHILD: u32 = 2 | TRANSIENT_TASK_BIT;
    const TRANSIENT_PARENT: u32 = 3 | TRANSIENT_TASK_BIT;

    fn id(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    /// Creates a backend with already computed tasks (they have an output, so connecting them
    /// doesn't schedule them).
    fn setup() -> Arc<TurboTasks<TurboTasksBackend>> {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadOnly),
                num_workers: Some(1),
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        for task_id in [PERSISTENT_CHILD, TRANSIENT_CHILD, TRANSIENT_PARENT] {
            tt.backend()
                .storage
                .access_mut(id(task_id))
                .flags
                .set_restored(TaskDataCategory::All);
        }
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            for task_id in [PERSISTENT_CHILD, TRANSIENT_CHILD] {
                let mut task = ctx.task(id(task_id), TaskDataCategory::All);
                task.set_output(OutputValue::Cell(CellRef {
                    task: id(task_id),
                    cell: turbo_tasks::CellId::new(turbo_tasks::ValueTypeId::new(1).unwrap(), 0),
                }));
            }
        }
        tt
    }

    fn aggregation_number(tt: &TurboTasks<TurboTasksBackend>, task_id: u32) -> u32 {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let task = ctx.task(id(task_id), TaskDataCategory::Meta);
        get_aggregation_number(&task)
    }

    fn transient_ref_count(tt: &TurboTasks<TurboTasksBackend>, task_id: u32) -> u32 {
        let mut ctx = ExecuteContext::new(tt.backend(), tt);
        let task = ctx.task(id(task_id), TaskDataCategory::Meta);
        task.get_transient_ref_count().copied().unwrap_or(0)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn parentless_persistent_child_is_not_made_a_root() {
        let tt = setup();
        connect_child(
            None,
            id(PERSISTENT_CHILD),
            false,
            ExecuteContext::new(tt.backend(), &tt),
        );
        assert_ne!(aggregation_number(&tt, PERSISTENT_CHILD), u32::MAX);
        // The caller still holds the task alive with a transient ref.
        assert_eq!(transient_ref_count(&tt, PERSISTENT_CHILD), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn parentless_transient_child_is_not_made_a_root() {
        let tt = setup();
        connect_child(
            None,
            id(TRANSIENT_CHILD),
            false,
            ExecuteContext::new(tt.backend(), &tt),
        );
        assert_ne!(aggregation_number(&tt, TRANSIENT_CHILD), u32::MAX);
        assert_eq!(transient_ref_count(&tt, TRANSIENT_CHILD), 1);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn persistent_child_of_transient_parent_is_made_a_root() {
        let tt = setup();
        {
            let mut ctx = ExecuteContext::new(tt.backend(), &tt);
            let mut parent = ctx.task(id(TRANSIENT_PARENT), TaskDataCategory::All);
            parent.set_in_progress(InProgressState::InProgress(Box::new(
                InProgressStateInner {
                    stale: false,
                    once_task: false,
                    done_event: Event::new(|| || "test done_event".to_string()),
                    marked_as_completed: false,
                    new_children: Default::default(),
                },
            )));
        }
        connect_child(
            Some(id(TRANSIENT_PARENT)),
            id(PERSISTENT_CHILD),
            false,
            ExecuteContext::new(tt.backend(), &tt),
        );
        // The persistent child shields the persistent graph from the transient parent.
        assert_eq!(aggregation_number(&tt, PERSISTENT_CHILD), u32::MAX);
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        let parent = ctx.task(id(TRANSIENT_PARENT), TaskDataCategory::All);
        let Some(InProgressState::InProgress(inner)) = parent.get_in_progress() else {
            panic!("parent must still be in progress");
        };
        assert!(inner.new_children.contains(&id(PERSISTENT_CHILD)));
    }
}
