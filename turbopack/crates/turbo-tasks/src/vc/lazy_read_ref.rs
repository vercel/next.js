use std::{
    fmt::{self, Debug},
    sync::atomic::{AtomicBool, Ordering},
};

use crate::{
    CellId, ReadRef, TaskId,
    manager::{ProvisionalReadDependency, with_turbo_tasks},
    vc::{VcReadTarget, VcValueType},
};

/// The result of [`Vc::lazy_reader`](crate::Vc::lazy_reader): a cell read that can be canceled.
///
/// The value is only accessible via [`LazyReadRef::get`]. When the `LazyReadRef` is dropped
/// without [`get`](LazyReadRef::get) ever being called, the read is canceled and the task no longer
/// depends on the cell through it. Otherwise it behaves like a normal read (`.await`).
///
/// This allows reading a cell that is rarely needed ahead of time, e.g. to pass it into
/// synchronous code that decides whether it needs the value, without depending on it when it
/// isn't needed.
///
/// It **must** be dropped within the task execution that called
/// [`lazy_reader`](crate::Vc::lazy_reader), and the same applies to the future returned by
/// `lazy_reader`. Otherwise completing that execution panics, which aborts the process.
#[must_use]
pub struct LazyReadRef<T>
where
    T: VcValueType,
{
    read_ref: ReadRef<T>,
    /// `None` if the read can't be canceled (e.g. a read outside of a task execution).
    dependency: Option<(TaskId, CellId, ProvisionalReadDependency)>,
    accessed: AtomicBool,
}

impl<T> LazyReadRef<T>
where
    T: VcValueType,
{
    /// `dependency` must only be `Some` within the task execution that created it, and must
    /// already be registered as alive ([`ProvisionalReadDependency::register_alive_ref`]). The
    /// registration is released when this is dropped within that execution.
    pub(crate) fn new(
        read_ref: ReadRef<T>,
        dependency: Option<(TaskId, CellId, ProvisionalReadDependency)>,
    ) -> Self {
        Self {
            read_ref,
            dependency,
            accessed: AtomicBool::new(false),
        }
    }

    /// Accesses the value. Once this is called, the task depends on the value like with a normal
    /// read, even when it's only called conditionally.
    pub fn get(&self) -> &VcReadTarget<T> {
        // Only the creating execution reads the flag (when dropping the ref), so relaxed is
        // enough.
        self.accessed.store(true, Ordering::Relaxed);
        &self.read_ref
    }
}

impl<T> Drop for LazyReadRef<T>
where
    T: VcValueType,
{
    fn drop(&mut self) {
        let Some((task, index, dependency)) = self.dependency.take() else {
            return;
        };
        if !dependency.is_current_execution() {
            // Dropped outside of the creating execution: a bug in the task function. Don't panic
            // in `drop`. The registration stays counted, so the creating execution panics when it
            // completes.
            return;
        }
        dependency.release_alive_ref();
        if *self.accessed.get_mut() {
            // Keep the dependency. It's converted to a normal dependency when the execution
            // completes.
            return;
        }
        // Refining the provisional dependency to no hashed dependencies at all removes it.
        with_turbo_tasks(|tt| {
            tt.refine_provisional_cell_dependency(
                task,
                index,
                dependency.reader,
                dependency.id,
                &mut std::iter::empty(),
            )
        });
    }
}

impl<T> Debug for LazyReadRef<T>
where
    T: VcValueType,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Must not access the value, as that would count as an access.
        f.debug_struct("LazyReadRef")
            .field("accessed", &self.accessed.load(Ordering::Relaxed))
            .finish_non_exhaustive()
    }
}
