use std::{
    fmt::{self, Debug},
    hash::{BuildHasher, Hash},
};

use parking_lot::Mutex;
use rustc_hash::{FxBuildHasher, FxHashSet};

use crate::{
    CellId, ReadRef, TaskId,
    keyed::{KeyedAccess, KeyedEq},
    manager::{KeyedReadDependency, with_turbo_tasks},
    vc::{VcReadTarget, VcValueType},
};

/// The result of [`Vc::keyed_reader`](crate::Vc::keyed_reader): a read of a keyed cell (a
/// [`cell = "keyed"`](macro@crate::value) map or set) that only allows synchronous keyed access via
/// [`KeyedReadRef::get`] and [`KeyedReadRef::contains_key`].
///
/// This is an efficient alternative to many [`Vc::get`](crate::Vc::get) /
/// [`Vc::contains_key`](crate::Vc::contains_key) reads of the same cell within a single task: the
/// cell is read (and the dependency registered) only once, and the accessed keys don't need an
/// `await` or any locking of the backend.
///
/// While it is alive, the reading task depends on the whole cell, so it is invalidated by any
/// change. The hashes of the accessed keys are recorded. When it is dropped within the task
/// execution that read it, that dependency is replaced (in a single batch operation) with
/// dependencies on only the accessed keys, so the task is only invalidated when one of the
/// accessed keys changes, like with [`Vc::get`](crate::Vc::get).
///
/// It **must** be dropped within the task execution that called
/// [`keyed_reader`](crate::Vc::keyed_reader) (it may be dropped in local tasks of that execution),
/// and the same applies to the future returned by `keyed_reader`. When either is still alive at the
/// end of that task execution (e.g. forgotten, or moved to another thread or task), that is a bug
/// in the task function: completing the execution panics, which aborts the process.
///
/// Note: Like with [`Vc::contains_key`](crate::Vc::contains_key), a
/// [`contains_key`](KeyedReadRef::contains_key) access is also invalidated when the value of the
/// key changes, not only when its presence changes.
#[must_use]
pub struct KeyedReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    read_ref: ReadRef<T>,
    /// `None` if the read wasn't tracked (e.g. a read outside of a task execution).
    dependency: Option<(TaskId, CellId, KeyedReadDependency)>,
    accessed_key_hashes: Mutex<FxHashSet<u64>>,
}

impl<T> KeyedReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    /// `dependency` must only be `Some` within the task execution that created it, and must
    /// already be registered as alive ([`KeyedReadDependency::register_alive_ref`]). The
    /// registration is released when this is dropped within that execution.
    pub(crate) fn new(
        read_ref: ReadRef<T>,
        dependency: Option<(TaskId, CellId, KeyedReadDependency)>,
    ) -> Self {
        Self {
            read_ref,
            dependency,
            accessed_key_hashes: Mutex::new(FxHashSet::default()),
        }
    }

    fn track<Q: Hash + ?Sized>(&self, key: &Q) {
        if self.dependency.is_some() {
            // Same hash as `Vc::get` uses.
            self.accessed_key_hashes
                .lock()
                .insert(FxBuildHasher.hash_one(key));
        }
    }

    /// Selects a keyed value. The task will only depend on the accessed keys.
    pub fn get<Q>(&self, key: &Q) -> Option<&<VcReadTarget<T> as KeyedAccess<Q>>::Value>
    where
        Q: Hash + ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        self.track(key);
        (*self.read_ref).get(key)
    }

    /// Checks if the value contains the given key. The task will only depend on the accessed keys.
    ///
    /// Note: This is also invalidated when the value of the key changes, not only when the presence
    /// of the key changes.
    pub fn contains_key<Q>(&self, key: &Q) -> bool
    where
        Q: Hash + ?Sized,
        VcReadTarget<T>: KeyedAccess<Q>,
    {
        self.track(key);
        (*self.read_ref).contains_key(key)
    }
}

impl<T> Drop for KeyedReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
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
        let key_hashes = std::mem::take(self.accessed_key_hashes.get_mut());
        with_turbo_tasks(|tt| {
            tt.convert_keyed_cell_dependency(
                task,
                index,
                dependency.reader,
                dependency.id,
                &mut key_hashes.into_iter(),
            )
        });
    }
}

impl<T> Debug for KeyedReadRef<T>
where
    T: VcValueType,
    VcReadTarget<T>: KeyedEq,
{
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("KeyedReadRef")
            .field("accessed_keys", &self.accessed_key_hashes.lock().len())
            .finish_non_exhaustive()
    }
}
