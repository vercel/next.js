//! Experimental, single-owner mutable cells with immutable read snapshots.

use std::{
    cell::Cell,
    fmt,
    hash::{Hash, Hasher},
    marker::PhantomData,
};

use anyhow::{Result, anyhow, ensure};
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};

use crate::{
    CellId, NonLocalValue, OperationValue, ReadRef, SharedReference, ShrinkToFit, TaskId,
    TaskInput, VcValueType,
    manager::{current_task, current_task_if_available, find_cell_by_type, mark_stateful},
    try_turbo_tasks,
};

thread_local! {
    static IN_UPDATE: Cell<bool> = const { Cell::new(false) };
}

/// Reject reentrant task operations before they can acquire locks or snapshot admission.
#[doc(hidden)]
pub fn assert_not_in_mutable_update() {
    IN_UPDATE.with(|active| {
        assert!(
            !active.get(),
            "turbo-tasks calls are forbidden inside MutableCell::update"
        )
    });
}

struct UpdateScope;
impl UpdateScope {
    fn enter() -> Self {
        assert_not_in_mutable_update();
        IN_UPDATE.with(|active| active.set(true));
        Self
    }
}
impl Drop for UpdateScope {
    fn drop(&mut self) {
        IN_UPDATE.with(|active| active.set(false));
    }
}

/// An **experimental** identity-only handle to a mutable cell owned by one task.
///
/// Only `#[turbo_tasks::value(cell = "mutable")]` values in persistent owner tasks
/// can construct these handles; transient/Once Tasks cannot own this prototype's state.
/// Initialization is first-value-wins, including after persistence restore. Identity
/// follows per-type construction order: use a fixed-layout creator. Reordering or
/// conditionally omitting allocations is not a state migration mechanism. Successful
/// omission retires a cell; reuse of a retired index is unsupported.
///
/// Handles may be shared by multiple consumers, but never transfer cell ownership.
/// They do not pin their creator against GC. Keep the creator connected to an explicit
/// root when a handle escapes the tracked graph. Access after collection/retirement
/// fails. In-memory handles belong to one TurboTasks instance; reacquire them through
/// the creator after reopening a persistent backend.
///
/// All access is synchronous and requires a current turbo-tasks context and a
/// multi-threaded Tokio runtime. Reads return immutable snapshots; previously obtained
/// snapshots never refresh. Every committed write invalidates tracked readers,
/// including equal values. No equality comparison or physical interior mutation occurs.
#[derive(Serialize, Deserialize, Encode, Decode)]
#[bincode(bounds = "T: VcValueType")]
#[serde(bound = "")]
pub struct MutableCell<T: VcValueType> {
    task: TaskId,
    cell: CellId,
    _t: PhantomData<T>,
}

impl<T: VcValueType + Clone + OperationValue> MutableCell<T> {
    /// Internal constructor used by the mutable value macro.
    #[doc(hidden)]
    pub fn cell_private(value: T) -> Self {
        assert_not_in_mutable_update();
        ensure_mutable::<T>().expect("invalid mutable value declaration");
        let task = current_task("constructing mutable cells");
        let cell = find_cell_by_type::<T>();
        let raw: crate::RawVc = cell.into();
        let (_, index) = raw.as_task_cell().expect("creator-owned cell");
        mark_stateful();
        crate::turbo_tasks()
            .initialize_mutable_cell(task, index, SharedReference::new(triomphe::Arc::new(value)))
            .expect("failed to initialize mutable cell");
        Self {
            task,
            cell: index,
            _t: PhantomData,
        }
    }

    /// Read an immutable snapshot and register the current task as a reader.
    pub fn get(&self) -> Result<ReadRef<T>> {
        self.read(true)
    }

    /// Read a snapshot without registering a dependency. Use only when invalidation
    /// is managed explicitly; this does not pin the owning task.
    pub fn get_untracked(&self) -> Result<ReadRef<T>> {
        self.read(false)
    }

    fn read(&self, tracked: bool) -> Result<ReadRef<T>> {
        assert_not_in_mutable_update();
        self.ensure_type()?;
        let tt = try_turbo_tasks()
            .ok_or_else(|| anyhow!("MutableCell access requires a turbo-tasks context"))?;
        let reader = current_task_if_available("reading mutable cells");
        let reference =
            tt.read_mutable_cell(self.task, self.cell, if tracked { reader } else { None })?;
        Ok(ReadRef::new_arc(
            reference
                .downcast::<T>()
                .map_err(|_| anyhow!("mutable cell type mismatch"))?,
        ))
    }

    fn ensure_type(&self) -> Result<()> {
        ensure_mutable::<T>()?;
        ensure!(
            self.cell.type_id() == T::get_value_type_id(),
            "mutable cell handle type mismatch"
        );
        Ok(())
    }

    /// Replace the canonical value and invalidate readers. Writes by the currently
    /// executing owner task are rejected; use the constructor for initialization.
    pub fn set(&self, value: T) -> Result<()> {
        let mut value = Some(value);
        self.replace(&mut |_| {
            Ok(SharedReference::new(triomphe::Arc::new(
                value.take().expect("called once"),
            )))
        })
    }

    /// Serialize writers, clone the canonical value, edit it once, then publish.
    ///
    /// The closure must return promptly and must not call turbo-tasks, nest cell
    /// access, perform async work, or spawn/wait for task work. Reentrant backend
    /// calls panic in release builds too. A panicking closure discards its private
    /// clone, leaves the published value unchanged, and releases its reservation.
    pub fn update(&self, f: impl FnOnce(&mut T)) -> Result<()> {
        let mut f = Some(f);
        self.replace(&mut |old| {
            let _scope = UpdateScope::enter();
            let mut value = old
                .downcast_ref::<T>()
                .ok_or_else(|| anyhow!("mutable cell type mismatch"))?
                .clone();
            f.take().expect("called once")(&mut value);
            Ok(SharedReference::new(triomphe::Arc::new(value)))
        })
    }

    fn replace(&self, f: &mut dyn FnMut(SharedReference) -> Result<SharedReference>) -> Result<()> {
        assert_not_in_mutable_update();
        self.ensure_type()?;
        let tt = try_turbo_tasks()
            .ok_or_else(|| anyhow!("MutableCell access requires a turbo-tasks context"))?;
        ensure!(
            current_task_if_available("writing mutable cells") != Some(self.task),
            "the owner task cannot mutate its own MutableCell"
        );
        tt.mutate_mutable_cell(self.task, self.cell, f)
    }
}

fn ensure_mutable<T: VcValueType>() -> Result<()> {
    ensure!(
        crate::registry::get_value_type(T::get_value_type_id()).mutable_cell,
        "not a mutable value type"
    );
    Ok(())
}

impl<T: VcValueType> Copy for MutableCell<T> {}
impl<T: VcValueType> Clone for MutableCell<T> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<T: VcValueType> PartialEq for MutableCell<T> {
    fn eq(&self, other: &Self) -> bool {
        self.task == other.task && self.cell == other.cell
    }
}
impl<T: VcValueType> Eq for MutableCell<T> {}
impl<T: VcValueType> Hash for MutableCell<T> {
    fn hash<H: Hasher>(&self, h: &mut H) {
        self.task.hash(h);
        self.cell.hash(h);
    }
}
impl<T: VcValueType> fmt::Debug for MutableCell<T> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("MutableCell")
            .field("task", &self.task)
            .field("cell", &self.cell)
            .finish()
    }
}
impl<T: VcValueType> ShrinkToFit for MutableCell<T> {
    fn shrink_to_fit(&mut self) {}
}
impl<T: VcValueType> TaskInput for MutableCell<T> {
    fn is_transient(&self) -> bool {
        self.task.is_transient()
    }
}
// SAFETY: this handle contains only a task id and concrete cell id, never a local Vc
// or a connected operation. Reading it explicitly establishes its dependency edge.
unsafe impl<T: VcValueType> NonLocalValue for MutableCell<T> {}
unsafe impl<T: VcValueType + OperationValue> OperationValue for MutableCell<T> {}
