//! TaskStorage-owned admission for bounded stateful-cell transactions.
//!
//! Reservation installation/removal is protected by the owner's shard lock.
//! Dependent-task locking and user callbacks run without that lock. Contenders
//! release snapshot admission before waiting. The admitted reservation prevents
//! GC; the transient storage field separately prevents post-snapshot eviction.

use anyhow::{Result, anyhow, ensure};
use turbo_tasks::{
    CellId, SharedReference, TaskId, TurboTasks, ValueTypePersistence, event::Event,
    registry::get_value_type,
};

use crate::{
    backend::{
        TaskDataCategory, TurboTasksBackend, lock_task_and_optional_reader,
        operation::{ExecuteContext, update_stateful_cell},
        storage_schema::TaskStorageAccessors,
    },
    data::{CellRef, StatefulCellOperation},
};

pub(super) struct CellTransaction<'a> {
    pub ctx: ExecuteContext<'a>,
    task: TaskId,
}

impl<'a> CellTransaction<'a> {
    pub fn acquire(
        backend: &'a TurboTasksBackend,
        tt: &'a TurboTasks<TurboTasksBackend>,
        id: TaskId,
    ) -> Result<Self> {
        turbo_tasks::assert_not_in_stateful_update();
        loop {
            let mut ctx = backend.execute_context(tt);
            let mut task = ctx
                .try_task(id, TaskDataCategory::All)
                .ok_or_else(|| anyhow!("stateful cell owner was collected or is unavailable"))?;
            if let Some(reservation) = task.get_stateful_cell_operation_mut() {
                reservation.waiting_accesses = reservation.waiting_accesses.saturating_add(1);
                let listener = reservation.event.listen();
                drop(task);
                drop(ctx);
                tokio::task::block_in_place(|| listener.wait());
                continue;
            }
            task.set_stateful_cell_operation(StatefulCellOperation {
                event: Event::new(move || move || format!("stateful cell transaction ({id})")),
                waiting_accesses: 0,
            });
            drop(task);
            return Ok(Self { ctx, task: id });
        }
    }
}

impl Drop for CellTransaction<'_> {
    fn drop(&mut self) {
        let mut task = self.ctx.task(self.task, TaskDataCategory::All);
        let reservation = task
            .take_stateful_cell_operation()
            .expect("owned reservation");
        drop(task);
        reservation.event.notify(usize::MAX);
    }
}

fn check_type(cell: CellId) -> Result<()> {
    let ty = get_value_type(cell.type_id());
    ensure!(
        ty.stateful && matches!(ty.persistence, ValueTypePersistence::Persistable(..)),
        "not a persistable stateful cell type"
    );
    Ok(())
}

impl TurboTasksBackend {
    pub(super) fn initialize_stateful_cell_impl(
        &self,
        id: TaskId,
        cell: CellId,
        value: SharedReference,
        tt: &TurboTasks<Self>,
    ) -> Result<()> {
        check_type(cell)?;
        ensure!(
            !id.is_transient(),
            "stateful cells require a persistent owner task"
        );
        let mut transaction = CellTransaction::acquire(self, tt, id)?;
        let mut task = transaction.ctx.task(id, TaskDataCategory::All);
        // A stateful owner has an external invalidator even without a user-created
        // Invalidator handle. Persisting this flag prevents immutable classification.
        task.set_invalidator(true);
        #[cfg(feature = "verify_determinism")]
        task.set_stateful(true);
        if task.cell_data_contains(&cell) {
            return Ok(());
        }
        // Canonical data was restored before this check. A declared but unavailable
        // persistable slot is not permission to reset it using the initializer.
        ensure!(
            task.get_cell_type_max_index(&cell.type_id())
                .is_none_or(|max| cell.index() >= *max),
            "existing stateful cell content is unavailable"
        );
        let _ = task.insert_cell_data(cell, value, &get_value_type(cell.type_id()).persistence);
        // Expose the initialized slot before first owner completion, while normal
        // successful completion remains authoritative for retirement.
        let max = task
            .get_cell_type_max_index(&cell.type_id())
            .copied()
            .unwrap_or(0)
            .max(cell.index() + 1);
        task.insert_cell_type_max_index(cell.type_id(), max);
        Ok(())
    }

    pub(super) fn read_stateful_cell_impl(
        &self,
        id: TaskId,
        cell: CellId,
        reader: Option<TaskId>,
        tt: &TurboTasks<Self>,
    ) -> Result<SharedReference> {
        check_type(cell)?;
        self.assert_not_persistent_calling_transient(reader, id);
        loop {
            turbo_tasks::assert_not_in_stateful_update();
            let mut ctx = self.execute_context(tt);
            let owner = ctx
                .try_task(id, TaskDataCategory::All)
                .ok_or_else(|| anyhow!("stateful cell owner was collected or is unavailable"))?;
            drop(owner);
            let reader = reader.filter(|r| *r != id && self.should_track_dependencies());
            let Some((mut task, reader_task)) = lock_task_and_optional_reader(&mut ctx, id, reader)
            else {
                return Err(anyhow!(
                    "stateful cell owner was collected or is unavailable"
                ));
            };
            if let Some(reservation) = task.get_stateful_cell_operation_mut() {
                reservation.waiting_accesses = reservation.waiting_accesses.saturating_add(1);
                let listener = reservation.event.listen();
                drop(task);
                drop(reader_task);
                drop(ctx);
                tokio::task::block_in_place(|| listener.wait());
                continue;
            }
            ensure!(
                task.get_cell_type_max_index(&cell.type_id())
                    .is_some_and(|max| cell.index() < *max),
                "stateful cell was retired or has an invalid index"
            );
            let content = task
                .get_cell_data(&cell)
                .cloned()
                .ok_or_else(|| anyhow!("canonical stateful cell content is unavailable"))?;
            if let Some(mut reader_task) = reader_task {
                let reader = reader.expect("reader task");
                let _ = task.add_cell_dependents(CellRef { task: reader, cell });
                drop(task);
                let target = CellRef { task: id, cell };
                if !reader_task.remove_outdated_cell_dependencies(&target) {
                    let _ = reader_task.add_cell_dependencies(target);
                }
            }
            return Ok(content);
        }
    }

    pub(super) fn mutate_stateful_cell_impl(
        &self,
        id: TaskId,
        cell: CellId,
        update: &mut dyn FnMut(SharedReference) -> Result<SharedReference>,
        tt: &TurboTasks<Self>,
    ) -> Result<()> {
        check_type(cell)?;
        let mut transaction = CellTransaction::acquire(self, tt, id)?;
        let task = transaction.ctx.task(id, TaskDataCategory::All);
        ensure!(
            task.get_cell_type_max_index(&cell.type_id())
                .is_some_and(|max| cell.index() < *max),
            "stateful cell was retired or has an invalid index"
        );
        let old = task
            .get_cell_data(&cell)
            .cloned()
            .ok_or_else(|| anyhow!("canonical stateful cell content is unavailable"))?;
        drop(task);
        let content = update(old)?;
        // The same owner reservation excludes initialization and completion, so
        // slot retirement cannot occur between validation and publication.
        let task = transaction.ctx.task(id, TaskDataCategory::All);
        ensure!(
            task.get_cell_type_max_index(&cell.type_id())
                .is_some_and(|max| cell.index() < *max),
            "stateful cell was retired before publication"
        );
        drop(task);
        let old = update_stateful_cell(id, cell, Some(content), &mut transaction.ctx);
        drop(transaction);
        // Destructors may call back into turbo-tasks: release both the reservation
        // and snapshot admission before dropping the replaced allocation.
        drop(old);
        Ok(())
    }
}
