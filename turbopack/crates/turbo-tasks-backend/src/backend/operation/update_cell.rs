use std::cell::LazyCell;

use rustc_hash::FxHashSet;
use smallvec::SmallVec;
#[cfg(feature = "task_dirty_cause")]
use turbo_tasks::TaskDirtyCause;
use turbo_tasks::{
    CellId, FxIndexMap, TaskId, TypedSharedReference, ValueTypePersistence,
    backend::{CellContent, CellHash, VerificationMode},
    registry,
};

use crate::{
    backend::{
        TaskDataCategory,
        operation::{
            AggregationUpdateQueue, ExecuteContext, TaskGuard,
            invalidate::make_task_dirty_without_scheduling,
        },
        storage_schema::TaskStorageAccessors,
    },
    data::CellRef,
};

pub fn update_cell(
    task_id: TaskId,
    cell: CellId,
    content: CellContent,
    updated_key_hashes: Option<SmallVec<[u64; 2]>>,
    content_hash: Option<CellHash>,
    #[cfg(feature = "verify_determinism")] verification_mode: VerificationMode,
    #[cfg(not(feature = "verify_determinism"))] _verification_mode: VerificationMode,
    mut ctx: ExecuteContext<'_>,
) {
    let value_type = registry::get_value_type(cell.type_id());
    // `content_hash` is only ever supplied for `HashOnly` cells — only the
    // `"hash"`-mode write path emits a hash, and no other mode consumes
    // it. (It can still be `None` for `HashOnly` when the cell is being
    // cleared.)
    debug_assert!(
        content_hash.is_none() || matches!(value_type.persistence, ValueTypePersistence::HashOnly),
        "content_hash must only be supplied for HashOnly cells"
    );

    let content = content.0;

    let mut task = ctx.task(task_id, TaskDataCategory::All);

    // We need to detect recomputation, because here the content has not actually changed (even
    // if it's not equal to the old content, as not all values implement Eq). We have to
    // assume that tasks are deterministic and pure.
    let assume_unchanged = !ctx.should_track_dependencies() || !task.has_dirty();

    if assume_unchanged {
        let has_old_content = task.cell_data_contains(&cell);
        if has_old_content {
            // Never update cells when recomputing if they already have a value.
            // It's not expected that content changes during recomputation.

            // Check if this assumption holds.
            #[cfg(feature = "verify_determinism")]
            if !task.stateful()
                && matches!(
                    verification_mode,
                    turbo_tasks::backend::VerificationMode::EqualityCheck
                )
                && content.as_ref() != task.get_cell_data(&cell)
            {
                let task_description = task.get_task_description();
                let cell_type = value_type.ty.global_name;
                eprintln!(
                    "Task {} updated cell #{} (type: {}) while recomputing",
                    task_description,
                    cell.index(),
                    cell_type
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

        // For HashOnly cells without available content, use hash-based comparison to
        // detect whether the value actually changed—avoiding unnecessary invalidation.
        let skip_invalidation = matches!(value_type.persistence, ValueTypePersistence::HashOnly)
            && {
                let has_old_content = task.cell_data_contains(&cell);
                if !has_old_content {
                    match (content_hash, task.get_cell_data_hash(&cell)) {
                        (Some(new_hash), Some(old_hash)) => new_hash == *old_hash,
                        _ => false,
                    }
                } else {
                    false
                }
            };

        #[cfg(feature = "task_dirty_cause")]
        let has_updated_key_hashes = updated_key_hashes.is_some();
        let updated_key_hashes_set = updated_key_hashes.map(|updated_key_hashes| {
            LazyCell::new(|| updated_key_hashes.into_iter().collect::<FxHashSet<u64>>())
        });

        // Collect dependent tasks only when not skipping invalidation.
        // The iterators borrow from `task`, so they must be scoped to drop before
        // we mutably borrow `task` again in the fast path.
        let mut dependent_tasks: FxIndexMap<TaskId, SmallVec<[Option<u64>; 2]>> =
            FxIndexMap::default();
        if !skip_invalidation {
            // Keyless dependents: always invalidate when the cell matches.
            for CellRef {
                task: dependent_task,
                cell: dependent_cell,
            } in task.iter_cell_dependents()
            {
                if dependent_cell == cell {
                    dependent_tasks
                        .entry(dependent_task)
                        .or_default()
                        .push(None);
                }
            }
            // Keyed dependents: invalidate only when the changed sub-value (key) matches.
            for (
                CellRef {
                    task: dependent_task,
                    cell: dependent_cell,
                },
                key_hash,
            ) in task.iter_cell_dependents_hashed()
            {
                if dependent_cell == cell
                    && updated_key_hashes_set
                        .as_ref()
                        .is_none_or(|set| set.contains(&key_hash))
                {
                    dependent_tasks
                        .entry(dependent_task)
                        .or_default()
                        .push(Some(key_hash));
                }
            }
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

            let old_content = task.remove_cell_data(&cell, &value_type.persistence);

            // Update cell_data_hash before dropping the task lock
            if matches!(value_type.persistence, ValueTypePersistence::HashOnly) {
                update_cell_data_hash(&mut task, &cell, content_hash);
            }

            drop(task);
            drop(old_content);

            ctx.prepare_tasks(
                dependent_tasks
                    .keys()
                    .map(|&id| (id, TaskDataCategory::All)),
                "invalidate cell dependents",
            );

            invalidate_cell_dependents(
                CellRef {
                    task: task_id,
                    cell,
                },
                dependent_tasks,
                #[cfg(feature = "task_dirty_cause")]
                has_updated_key_hashes,
                content.map(|r| r.into_typed(cell.type_id())),
                &mut ctx,
            );
            return;
        }
    }

    // Fast path: We don't need to invalidate anything.
    // So we can just update the cell content.

    let old_content = if let Some(new_content) = content {
        task.insert_cell_data(cell, new_content, &value_type.persistence)
    } else {
        task.remove_cell_data(&cell, &value_type.persistence)
    };

    // Update cell_data_hash for hash-only cells.
    if matches!(value_type.persistence, ValueTypePersistence::HashOnly) {
        update_cell_data_hash(&mut task, &cell, content_hash);
    }

    let in_progress_cell = task.remove_in_progress_cells(&cell);

    drop(task);
    drop(old_content);

    if let Some(in_progress) = in_progress_cell {
        in_progress.event.notify(usize::MAX);
    }
}

/// Updates the stored cell_data_hash, which only `serialization = "hash"`
/// cells consult (on eviction + recompute). Skips the update for all other
/// persistence modes and when the hash hasn't changed.
fn update_cell_data_hash(task: &mut TaskGuard<'_>, cell: &CellId, content_hash: Option<CellHash>) {
    let old_hash = task.get_cell_data_hash(cell).copied();
    if old_hash != content_hash {
        if let Some(hash) = content_hash {
            task.insert_cell_data_hash(*cell, hash);
        } else {
            task.remove_cell_data_hash(cell);
        }
    }
}

fn invalidate_cell_dependents(
    cell_ref: CellRef,
    mut dependent_tasks: FxIndexMap<TaskId, SmallVec<[Option<u64>; 2]>>,
    #[cfg(feature = "task_dirty_cause")] has_updated_key_hashes: bool,
    content: Option<TypedSharedReference>,
    ctx: &mut ExecuteContext<'_>,
) {
    let mut queue = AggregationUpdateQueue::new();
    // The dependents to schedule are collected and handed to the scheduler as one batch, which
    // takes the scheduler's queue lock once instead of once per dependent.
    let mut to_schedule = Vec::with_capacity(dependent_tasks.len());
    while let Some((dependent_task_id, keys)) = dependent_tasks.pop() {
        // Each key is a separate dependency; they are only grouped per task to reduce task
        // locking. The task is made dirty if any key is still a (current or outdated) dependency.
        let mut make_dirty = false;
        let mut make_stale = false;
        let mut dependent = ctx.task(dependent_task_id, TaskDataCategory::All);
        for key in keys.iter().copied() {
            let (in_outdated, in_current) = if let Some(k) = key {
                let in_outdated =
                    dependent.outdated_cell_dependencies_hashed_contains(&(cell_ref, k));
                let in_current =
                    !in_outdated && dependent.cell_dependencies_hashed_contains(&(cell_ref, k));
                (in_outdated, in_current)
            } else {
                let in_outdated = dependent.outdated_cell_dependencies_contains(&cell_ref);
                let in_current = !in_outdated && dependent.cell_dependencies_contains(&cell_ref);
                (in_outdated, in_current)
            };
            if in_outdated {
                // cell dependency is outdated, so it hasn't read the cell yet
                // and doesn't need to be invalidated.
                // We do not need to make the task stale in this case.
                // But importantly we still need to make the task dirty as it should
                // no longer be considered as
                // "recomputation".
                make_dirty = true;
            } else if in_current {
                // cell dependency has been read, so the task needs to be made stale
                // (which implies dirty).
                make_stale = true;
            }
            // Otherwise the cell dependency has been removed, so the task doesn't depend
            // on this key anymore and it doesn't contribute to the invalidation.
        }
        if !make_dirty && !make_stale {
            continue;
        }
        if let Some(parent_priority) = make_task_dirty_without_scheduling(
            &mut dependent,
            make_stale,
            #[cfg(feature = "task_dirty_cause")]
            TaskDirtyCause::CellChange {
                value_type: cell_ref.cell.type_id(),
                keys: if has_updated_key_hashes {
                    keys
                } else {
                    Default::default()
                },
            },
            &mut queue,
            ctx,
        ) {
            to_schedule.push((
                dependent_task_id,
                ctx.schedule_task_priority(&dependent, parent_priority),
            ));
        }
    }
    ctx.schedule_tasks(&to_schedule);
    let mut task = ctx.task(cell_ref.task, TaskDataCategory::Data);

    if let Some(content) = content {
        // This arm only carries the CellId, so resolve the cell's
        // persistence here (one lookup per final change, not on the
        // inner hot path) to decide whether the write tracks.
        let persistence = &registry::get_value_type(cell_ref.cell.type_id()).persistence;
        task.add_cell_data(cell_ref.cell, content.into_untyped(), persistence);
    }

    let in_progress_cell = task.remove_in_progress_cells(&cell_ref.cell);

    drop(task);

    if let Some(in_progress) = in_progress_cell {
        in_progress.event.notify(usize::MAX);
    }

    queue.execute(ctx);
}

#[cfg(test)]
mod invalidate_cell_dependents_tests {
    //! `invalidate_cell_dependents` must only dirty a dependent when at least one of its
    //! dependency keys is still current or outdated. Dependencies that were removed between
    //! reading `cell_dependents` and locking the dependent must not dirty it.
    use std::sync::Arc;

    use smallvec::{SmallVec, smallvec};
    use turbo_tasks::{CellId, FxIndexMap, TaskId, TurboTasks, ValueTypeId, event::Event};

    use super::invalidate_cell_dependents;
    use crate::{
        TurboTasksBackend,
        backend::{
            BackendOptions, StorageMode, TaskDataCategory, operation::ExecuteContext,
            storage_schema::TaskStorageAccessors,
        },
        data::{CellRef, InProgressState, InProgressStateInner},
        noop_backing_storage,
    };

    const CELL_TASK: u32 = 1;
    const DEPENDENT: u32 = 2;

    fn task(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    fn cell_ref() -> CellRef {
        CellRef {
            task: task(CELL_TASK),
            // SAFETY: the id is only used as an opaque key; the registry is never consulted
            // because no new content is written.
            cell: CellId::new(unsafe { ValueTypeId::new_unchecked(1) }, 0),
        }
    }

    fn backend() -> Arc<TurboTasks<TurboTasksBackend>> {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadOnly),
                num_workers: Some(1),
                small_preallocation: true,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        for id in [CELL_TASK, DEPENDENT] {
            tt.backend()
                .storage
                .access_mut(task(id))
                .flags
                .set_restored(TaskDataCategory::All);
        }
        tt
    }

    /// Dependency state of the dependent task before the invalidation.
    #[derive(Default)]
    struct Setup {
        current_keys: Vec<u64>,
        outdated_keys: Vec<u64>,
        current_unkeyed: bool,
    }

    /// Marks the dependent as in progress (so it is never scheduled for real), applies `setup`,
    /// invalidates the cell for `keys` and returns `(dirty, stale)` of the dependent.
    fn run(setup: Setup, keys: SmallVec<[Option<u64>; 2]>) -> (bool, bool) {
        let tt = backend();
        let mut ctx = ExecuteContext::new(tt.backend(), &tt);
        {
            let mut dependent = ctx.task(task(DEPENDENT), TaskDataCategory::All);
            dependent.set_in_progress(InProgressState::InProgress(Box::new(
                InProgressStateInner {
                    stale: false,
                    once_task: false,
                    done_event: Event::new(|| || "test done_event".to_string()),
                    marked_as_completed: false,
                    completing: false,
                    held_dirty_uppers: Vec::new(),
                    new_children: Default::default(),
                },
            )));
            for k in setup.current_keys {
                let _ = dependent.add_cell_dependencies_hashed((cell_ref(), k));
            }
            for k in setup.outdated_keys {
                let _ = dependent.add_outdated_cell_dependencies_hashed((cell_ref(), k));
            }
            if setup.current_unkeyed {
                let _ = dependent.add_cell_dependencies(cell_ref());
            }
        }

        let mut dependent_tasks = FxIndexMap::default();
        dependent_tasks.insert(task(DEPENDENT), keys);
        invalidate_cell_dependents(
            cell_ref(),
            dependent_tasks,
            #[cfg(feature = "task_dirty_cause")]
            true,
            None,
            &mut ctx,
        );

        let dependent = ctx.task(task(DEPENDENT), TaskDataCategory::All);
        let dirty = dependent.get_dirty().is_some();
        let stale = matches!(
            dependent.get_in_progress(),
            Some(InProgressState::InProgress(inner)) if inner.stale
        );
        (dirty, stale)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn all_dependencies_removed_does_not_dirty() {
        // The dependent still tracks a different key, but none of the invalidated ones.
        let setup = Setup {
            current_keys: vec![99],
            ..Default::default()
        };
        assert_eq!(run(setup, smallvec![Some(1), Some(2)]), (false, false));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn unkeyed_dependency_removed_does_not_dirty() {
        assert_eq!(run(Setup::default(), smallvec![None]), (false, false));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn removed_and_current_dependencies_dirty_and_stale() {
        let setup = Setup {
            current_keys: vec![2],
            ..Default::default()
        };
        assert_eq!(run(setup, smallvec![Some(1), Some(2)]), (true, true));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn current_unkeyed_dependency_dirty_and_stale() {
        let setup = Setup {
            current_unkeyed: true,
            ..Default::default()
        };
        assert_eq!(run(setup, smallvec![None]), (true, true));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn outdated_dependency_dirty_not_stale() {
        let setup = Setup {
            outdated_keys: vec![1],
            ..Default::default()
        };
        assert_eq!(run(setup, smallvec![Some(1), Some(2)]), (true, false));
    }
}
