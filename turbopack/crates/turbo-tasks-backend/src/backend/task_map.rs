#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};
use std::{
    marker::PhantomData,
    ops::{Deref, DerefMut},
    ptr,
};

use papaya::{HashMap, LocalGuard};
use rustc_hash::FxBuildHasher;
use turbo_tasks::TaskId;

use crate::backend::storage_schema::{TaskSlot, TaskStorage};

/// Sparse resident task map backed by Papaya.
///
/// Papaya pins keep entries alive across concurrent removal. `TaskSlot`'s intrusive lock provides
/// payload exclusion. A lookup that loaded a value before removal locks it and observes its
/// lock-protected `present` byte; removal clears that byte before unlock, so the stale reader
/// retries without a second map probe.
pub(crate) struct TaskMap {
    map: HashMap<TaskId, TaskSlot, FxBuildHasher>,
    #[cfg(test)]
    task_id_scans: AtomicUsize,
}

impl TaskMap {
    pub(crate) fn new(capacity: usize) -> Self {
        // DashMap's million-entry preallocation is split across many shards. Applying it to one
        // contiguous Papaya table hurts small working sets; start modestly and let Papaya resize.
        let capacity = capacity.min(16 * 1024);
        Self {
            map: HashMap::with_capacity_and_hasher(capacity, FxBuildHasher),
            #[cfg(test)]
            task_id_scans: AtomicUsize::new(0),
        }
    }

    pub(crate) fn len(&self) -> usize {
        self.map.len()
    }

    pub(crate) fn get(&self, task_id: TaskId) -> Option<TaskMapGuard<'_>> {
        self.get_inner(task_id, false)
    }

    pub(crate) fn get_or_insert(&self, task_id: TaskId) -> TaskMapGuard<'_> {
        self.get(task_id).unwrap_or_else(|| {
            self.get_inner(task_id, true)
                .expect("get-or-insert must return the inserted task")
        })
    }

    fn get_inner(&self, task_id: TaskId, insert: bool) -> Option<TaskMapGuard<'_>> {
        loop {
            let guard = self.map.guard();
            let slot = if insert {
                self.map.get_or_insert_with(task_id, TaskSlot::new, &guard)
            } else {
                self.map.get(&task_id, &guard)?
            } as *const TaskSlot;

            // The Papaya guard keeps this slot allocated while its task lock is acquired.
            unsafe { &*slot }.lock();

            // Removal may have detached this slot while we waited. It clears `present` under this
            // same lock before releasing it, so a stale reader can retry without another hash
            // probe.
            if unsafe { (&*slot).is_present() } {
                return Some(TaskMapGuard {
                    map: self,
                    guard,
                    task_id,
                    slot,
                    _not_send: PhantomData,
                });
            }

            // SAFETY: We acquired this exact slot's task lock above and expose no task reference.
            unsafe { (&*slot).unlock() };
        }
    }

    pub(crate) fn task_ids(&self) -> Vec<TaskId> {
        #[cfg(test)]
        self.task_id_scans.fetch_add(1, Ordering::Relaxed);
        let guard = self.map.guard();
        self.map.iter(&guard).map(|(key, _)| *key).collect()
    }

    /// Process a batch of still-present tasks with one Papaya protection guard. Each callback owns
    /// only the current task's intrusive lock; no task reference escapes the call.
    pub(crate) fn for_each_locked(
        &self,
        task_ids: &[TaskId],
        mut process: impl FnMut(TaskId, &TaskStorage),
    ) {
        struct Unlock<'a>(&'a TaskSlot);
        impl Drop for Unlock<'_> {
            fn drop(&mut self) {
                // SAFETY: The loop acquired this exact slot lock before constructing the guard.
                unsafe { self.0.unlock() };
            }
        }

        let guard = self.map.guard();
        for &task_id in task_ids {
            let Some(slot) = self.map.get(&task_id, &guard) else {
                continue;
            };
            slot.lock();
            let _unlock = Unlock(slot);
            // SAFETY: `_unlock` owns the slot lock. Removed entries have `present` cleared before
            // unlock, so stale protected values are skipped.
            if unsafe { slot.is_present() } {
                process(task_id, unsafe { slot.get() });
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn task_id_scan_count(&self) -> usize {
        self.task_id_scans.load(Ordering::Relaxed)
    }

    #[cfg(test)]
    pub(crate) fn contains(&self, task_id: TaskId) -> bool {
        let guard = self.map.guard();
        self.map.get(&task_id, &guard).is_some()
    }

    #[cfg(test)]
    pub(crate) fn remove(&self, task_id: TaskId) -> bool {
        self.get(task_id)
            .is_some_and(|task| self.remove_locked(&task))
    }

    pub(crate) fn remove_locked(&self, task: &TaskMapGuard<'_>) -> bool {
        debug_assert!(ptr::eq(self, task.map));
        let removed = self
            .map
            .remove_if(
                &task.task_id,
                |_, current| ptr::eq(current, task.slot),
                &task.guard,
            )
            .is_ok_and(|removed| removed.is_some());
        if removed {
            // SAFETY: `task` owns this exact slot's lock, and remove_if detached this exact value.
            unsafe { (&*task.slot).mark_removed() };
        }
        removed
    }

    pub(crate) fn clear(&self) {
        for task_id in self.task_ids() {
            if let Some(task) = self.get(task_id) {
                self.remove_locked(&task);
            }
        }
    }
}

/// Owns both Papaya's lifetime protection and one task's intrusive lock.
pub(crate) struct TaskMapGuard<'a> {
    map: &'a TaskMap,
    // Declared before `slot` only for clarity; `Drop` releases the task lock explicitly before
    // Papaya protection is dropped.
    guard: LocalGuard<'a>,
    task_id: TaskId,
    slot: *const TaskSlot,
    // Task guards must not cross `.await`, even if Papaya changes LocalGuard's auto traits.
    _not_send: PhantomData<*const ()>,
}

impl TaskMapGuard<'_> {
    pub(crate) fn key(&self) -> &TaskId {
        &self.task_id
    }
}

impl Deref for TaskMapGuard<'_> {
    type Target = TaskStorage;

    fn deref(&self) -> &Self::Target {
        // SAFETY: TaskMapGuard owns this slot's task lock and observed it present.
        unsafe { (&*self.slot).get() }
    }
}

impl DerefMut for TaskMapGuard<'_> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        // SAFETY: TaskMapGuard exclusively owns this slot's task lock and observed it present.
        unsafe { &mut *(&*self.slot).as_ptr() }
    }
}

impl Drop for TaskMapGuard<'_> {
    fn drop(&mut self) {
        // SAFETY: This guard acquired this slot's task lock and performs no payload access after
        // unlocking. `guard` remains alive until after this Drop body, so the slot cannot be freed.
        unsafe { (&*self.slot).unlock() };
    }
}

#[cfg(test)]
mod tests {
    use turbo_tasks::TaskId;

    use super::{TaskMap, TaskSlot};

    fn task_id(id: u32) -> TaskId {
        TaskId::new(id).unwrap()
    }

    #[test]
    fn removed_guard_stays_alive_but_cannot_replace_reinserted_task() {
        let map = TaskMap::new(16);
        let id = task_id(1);
        let old = map.get_or_insert(id);
        let stale_guard = map.map.guard();
        let stale_slot = map.map.get(&id, &stale_guard).unwrap() as *const TaskSlot;
        assert_eq!(stale_slot, old.slot);
        assert!(map.remove_locked(&old));

        let replacement = map.get_or_insert(id);
        assert_ne!(stale_slot, replacement.slot);
        assert_eq!(*old.key(), id);
        assert_eq!(*replacement.key(), id);
        assert!(!map.remove_locked(&old));
        drop(old);

        // This simulates a reader that protected the old entry before removal but reached its task
        // lock only after the replacement was published.
        unsafe { &*stale_slot }.lock();
        // SAFETY: This test owns the stale slot's lock, and stale_guard keeps it allocated.
        assert!(!unsafe { (&*stale_slot).is_present() });
        // SAFETY: This test acquired the stale slot lock above.
        unsafe { (&*stale_slot).unlock() };
        drop(stale_guard);

        assert!(map.remove_locked(&replacement));
        assert_eq!(map.len(), 0);
    }
}
