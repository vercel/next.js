use std::mem::take;

use bincode::{Decode, Encode};
use once_cell::unsync::Lazy;
use rustc_hash::FxHashSet;
use smallvec::SmallVec;
#[cfg(not(feature = "verify_determinism"))]
use turbo_tasks::backend::VerificationMode;
use turbo_tasks::{CellId, FxIndexMap, TaskId, TypedSharedReference, backend::CellContent};

#[cfg(feature = "trace_task_dirty")]
use crate::backend::operation::invalidate::TaskDirtyCause;
use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregationUpdateQueue, ExecuteContext, Operation, TaskGuard,
            invalidate::make_task_dirty_internal,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::CellRef,
};

#[derive(Encode, Decode, Clone, Default)]
#[allow(clippy::large_enum_variant)]
pub enum UpdateCellOperation {
    InvalidateWhenCellDependency {
        is_serializable_cell_content: bool,
        cell_ref: CellRef,
        #[bincode(with = "turbo_bincode::indexmap")]
        dependent_tasks: FxIndexMap<TaskId, SmallVec<[Option<u64>; 2]>>,
        #[cfg(feature = "trace_task_dirty")]
        has_updated_key_hashes: bool,
        content: Option<TypedSharedReference>,
        queue: AggregationUpdateQueue,
    },
    FinalCellChange {
        is_serializable_cell_content: bool,
        cell_ref: CellRef,
        content: Option<TypedSharedReference>,
        queue: AggregationUpdateQueue,
    },
    AggregationUpdate {
        queue: AggregationUpdateQueue,
    },
    #[default]
    Done,
}

impl UpdateCellOperation {
    pub fn run(
        task_id: TaskId,
        cell: CellId,
        content: CellContent,
        is_serializable_cell_content: bool,
        updated_key_hashes: Option<SmallVec<[u64; 2]>>,
        #[cfg(feature = "verify_determinism")] verification_mode: VerificationMode,
        #[cfg(not(feature = "verify_determinism"))] _verification_mode: VerificationMode,
        mut ctx: impl ExecuteContext<'_>,
    ) {
        let content = if let CellContent(Some(new_content)) = content {
            Some(new_content.into_typed(cell.type_id))
        } else {
            None
        };

        let mut task = ctx.task(task_id, TaskDataCategory::All);

        // We need to detect recomputation, because here the content has not actually changed (even
        // if it's not equal to the old content, as not all values implement Eq). We have to
        // assume that tasks are deterministic and pure.
        let assume_unchanged = !ctx.should_track_dependencies() || !task.has_dirty();

        if assume_unchanged {
            let has_old_content = task.has_cell_data(is_serializable_cell_content, cell);
            if has_old_content {
                // Never update cells when recomputing if they already have a value.
                // It's not expected that content changes during recomputation.

                // Check if this assumption holds.
                #[cfg(feature = "verify_determinism")]
                if !is_stateful
                    && matches!(verification_mode, VerificationMode::EqualityCheck)
                    && content != task.get_cell_data(is_serializable_cell_content, cell)
                {
                    let task_description = ctx.get_task_description(task_id);
                    let cell_type = turbo_tasks::registry::get_value_type(cell.type_id).global_name;
                    eprintln!(
                        "Task {} updated cell #{} (type: {}) while recomputing",
                        task_description, cell.index, cell_type
                    );
                }
                return;
            } else {
                // Initial computation, or computation after a cell has been cleared.
                // We can just set the content, but we don't want to notify dependent tasks,
                // as we assume that content hasn't changed (deterministic tasks).
            }
        } else {
            // When not recomputing, we need to notify dependent tasks if the content actually
            // changes.

            #[cfg(feature = "trace_task_dirty")]
            let has_updated_key_hashes = updated_key_hashes.is_some();
            let updated_key_hashes_set = updated_key_hashes.map(|updated_key_hashes| {
                Lazy::new(|| updated_key_hashes.into_iter().collect::<FxHashSet<u64>>())
            });

            let tasks_with_keys =
                task.iter_cell_dependents()
                    .filter_map(|(dependent_cell, key, task)| {
                        (dependent_cell == cell
                            && key.is_none_or(|key_hash| {
                                updated_key_hashes_set
                                    .as_ref()
                                    .is_none_or(|set| set.contains(&key_hash))
                            }))
                        .then_some((task, key))
                    });
            let mut dependent_tasks: FxIndexMap<TaskId, SmallVec<[Option<u64>; 2]>> =
                FxIndexMap::default();
            for (task, key) in tasks_with_keys {
                dependent_tasks.entry(task).or_default().push(key);
            }

            if !dependent_tasks.is_empty() {
                // Slow path: We need to invalidate tasks depending on this cell.
                // To avoid a race condition, we need to remove the old content first,
                // then invalidate dependent tasks and only then update the cell content.

                // The reason behind this is that we consider tasks that haven't the dirty flag set
                // as "recomputing" tasks. Recomputing tasks won't invalidate
                // dependent tasks, when a cell is changed. This would cause missing invalidating if
                // a task is recomputing while a dependency is in the middle of a cell update (where
                // the value has been changed, but the dependent tasks have not be flagged dirty
                // yet). So to avoid that we first remove the cell content, invalidate all dependent
                // tasks and after that set the new cell content. When the cell content is unset,
                // readers will wait for it to be set via InProgressCell.

                let old_content = task.remove_cell_data(is_serializable_cell_content, cell);

                drop(task);
                drop(old_content);

                ctx.prepare_tasks(
                    dependent_tasks
                        .keys()
                        .map(|&id| (id, TaskDataCategory::All)),
                );

                UpdateCellOperation::InvalidateWhenCellDependency {
                    is_serializable_cell_content,
                    cell_ref: CellRef {
                        task: task_id,
                        cell,
                    },
                    dependent_tasks,
                    #[cfg(feature = "trace_task_dirty")]
                    has_updated_key_hashes,
                    content,
                    queue: AggregationUpdateQueue::new(),
                }
                .execute(&mut ctx);
                return;
            }
        }

        // Fast path: We don't need to invalidate anything.
        // So we can just update the cell content.

        let old_content = if let Some(new_content) = content {
            task.set_cell_data(is_serializable_cell_content, cell, new_content)
        } else {
            task.remove_cell_data(is_serializable_cell_content, cell)
        };

        let in_progress_cell = task.remove_in_progress_cells(&cell);

        drop(task);
        drop(old_content);

        if let Some(in_progress) = in_progress_cell {
            in_progress.event.notify(usize::MAX);
        }
    }

    fn is_serializable(&self) -> bool {
        match self {
            UpdateCellOperation::InvalidateWhenCellDependency {
                is_serializable_cell_content,
                ..
            } => *is_serializable_cell_content,
            UpdateCellOperation::FinalCellChange {
                is_serializable_cell_content,
                ..
            } => *is_serializable_cell_content,
            UpdateCellOperation::AggregationUpdate { .. } => true,
            UpdateCellOperation::Done => true,
        }
    }
}

impl Operation for UpdateCellOperation {
    fn execute(mut self, ctx: &mut impl ExecuteContext<'_>) {
        loop {
            if self.is_serializable() {
                ctx.operation_suspend_point(&self);
            }
            match self {
                UpdateCellOperation::InvalidateWhenCellDependency {
                    is_serializable_cell_content,
                    cell_ref,
                    ref mut dependent_tasks,
                    #[cfg(feature = "trace_task_dirty")]
                    has_updated_key_hashes,
                    ref mut content,
                    ref mut queue,
                } => {
                    if let Some((dependent_task_id, keys)) = dependent_tasks.pop() {
                        let mut make_stale = false;
                        let dependent = ctx.task(dependent_task_id, TaskDataCategory::All);
                        for key in keys.iter().copied() {
                            if dependent.outdated_cell_dependencies_contains(&(cell_ref, key)) {
                                // cell dependency is outdated, so it hasn't read the cell yet
                                // and doesn't need to be invalidated.
                                // We do not need to make the task stale in this case.
                                // But importantly we still need to make the task dirty as it should
                                // no longer be considered as
                                // "recomputation".
                            } else if !dependent.cell_dependencies_contains(&(cell_ref, key)) {
                                // cell dependency has been removed, so the task doesn't depend on
                                // the cell anymore and doesn't need
                                // to be invalidated
                                continue;
                            } else {
                                make_stale = true;
                            }
                        }
                        make_task_dirty_internal(
                            dependent,
                            dependent_task_id,
                            make_stale,
                            #[cfg(feature = "trace_task_dirty")]
                            TaskDirtyCause::CellChange {
                                value_type: cell_ref.cell.type_id,
                                keys: has_updated_key_hashes.then_some(keys).unwrap_or_default(),
                            },
                            queue,
                            ctx,
                        );
                    }
                    if dependent_tasks.is_empty() {
                        self = UpdateCellOperation::FinalCellChange {
                            is_serializable_cell_content,
                            cell_ref,
                            content: take(content),
                            queue: take(queue),
                        };
                    }
                }
                UpdateCellOperation::FinalCellChange {
                    is_serializable_cell_content,
                    cell_ref: CellRef { task, cell },
                    content,
                    ref mut queue,
                } => {
                    let mut task = ctx.task(task, TaskDataCategory::Data);

                    if let Some(content) = content {
                        task.add_cell_data(is_serializable_cell_content, cell, content);
                    }

                    let in_progress_cell = task.remove_in_progress_cells(&cell);

                    drop(task);

                    if let Some(in_progress) = in_progress_cell {
                        in_progress.event.notify(usize::MAX);
                    }

                    self = UpdateCellOperation::AggregationUpdate { queue: take(queue) };
                }
                UpdateCellOperation::AggregationUpdate { ref mut queue } => {
                    if queue.process(ctx) {
                        self = UpdateCellOperation::Done
                    }
                }
                UpdateCellOperation::Done => {
                    return;
                }
            }
        }
    }
}
