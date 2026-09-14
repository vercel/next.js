//! Deferred reuse of the task ids freed by GC.
//!
//! # Why reuse ids at all
//!
//! Not exhaustion — the persistent id space is ~1.07B and real sessions stay well under 15M. The
//! goal is **density**: keeping the live id set packed near `[1, max_live)` is what makes flat,
//! array-backed storage viable in place of a sharded `DashMap<TaskId, _>`. So the metric that
//! matters is peak `next_free_task_id` against peak live task count, not the reuse count itself.
//!
//! # Why the ids are held back
//!
//! Handing a freed id straight back to [`IdFactoryWithReuse`] would make a stale reference — one
//! that outlived the task it names — silently resolve to an unrelated live task. Today such a
//! reference fails loudly instead: `open_task` with `TaskAccess::MustExist` asserts that the task
//! "exists in neither memory nor persistent storage". Reuse is what would turn that panic into a
//! wrong answer.
//!
//! While an id sits in this queue it is in neither the resident map, the task cache, nor on disk,
//! so a stale reference still hits that assert. The queue is therefore not merely probabilistic
//! hardening: it *preserves the existing loud failure* for the whole deferral window. A bug in the
//! reuse pipeline shows up as the same panic it does today, just later.
//!
//! The window is measured in snapshot cycles rather than queue depth because the hazard is
//! phase-relative (a task is freed as part of one cycle's eviction), not volume-relative. A quiet
//! session simply doesn't reuse, which costs nothing but a little density.
//!
//! # Alternative considered and rejected: generation-tagged ids
//!
//! Stealing 2 bits of [`TaskId`] for a generation counter, bumped on each reuse, would make a
//! stale reference resolve to a *different* id and so fail loudly forever rather than for a
//! window. It was rejected because it gives every task two identities — a masked in-memory id and
//! an unmasked on-disk key — and `kv_backing_storage` converts ids to key bytes by bare deref in
//! several places (`IntKey::new(*task_id)`, `(*task_id).to_le_bytes()`), plus
//! `max_new_task_id.max(*task_id)`, which would compare generation bits as magnitude. Any missed
//! mask is a silent wrong-row read. It would also change the on-disk key format, requiring a
//! `db_versioning` bump. Revisit only if deferral proves insufficient in practice.

use std::collections::VecDeque;

use parking_lot::Mutex;
use rustc_hash::FxHashSet;
use turbo_tasks::TaskId;

/// How many snapshot cycles a freed id waits before it may be handed out again.
///
/// One cycle would already cover the eviction that freed it; the extra margin covers a stale
/// reference held across a cycle boundary. Overridable per-backend for tests.
pub(crate) const DEFAULT_ID_REUSE_DELAY_CYCLES: u32 = 2;

/// Freed task ids waiting out their deferral window, oldest first.
///
/// Ids enter from
/// [`Storage::evict_after_snapshot`](crate::backend::storage::Storage::evict_after_snapshot) once a
/// GC-deleted task has been erased from both the resident map and the task cache, and leave
/// once `delay_cycles` snapshot cycles have elapsed.
pub(crate) struct DeferredIdReuse {
    /// `(id, cycle it was freed in)`, pushed in cycle order so the front is always the oldest.
    queue: Mutex<VecDeque<(TaskId, u32)>>,
    /// Monotonic count of completed snapshot cycles. Only ever advanced by
    /// [`Self::advance_cycle`].
    cycle: Mutex<u32>,
    /// Cycles an id must wait. `0` releases immediately, which is what the aliasing-pressure tests
    /// want.
    delay_cycles: u32,
    /// Ids already handed back to the factory this session. Retained only so that
    /// [`Self::persistable`] can offer them to the next session too — an id reused in *this*
    /// session is still free from the perspective of a fresh one, which rebuilds its own graph.
    released: Mutex<FxHashSet<TaskId>>,
}

impl DeferredIdReuse {
    pub(crate) fn new(delay_cycles: u32) -> Self {
        Self {
            queue: Mutex::new(VecDeque::new()),
            cycle: Mutex::new(0),
            delay_cycles,
            released: Mutex::new(FxHashSet::default()),
        }
    }

    /// Records ids freed by the eviction sweep of the current cycle.
    ///
    /// The caller must have already removed each id from the resident map **and** the task cache;
    /// an id whose `task_cache` entry survives could still be handed back by
    /// `get_or_create_persistent_task`.
    pub(crate) fn defer(&self, ids: impl IntoIterator<Item = TaskId>) {
        let cycle = *self.cycle.lock();
        let mut queue = self.queue.lock();
        queue.extend(ids.into_iter().map(|id| (id, cycle)));
    }

    /// Ends the current snapshot cycle and returns the ids whose window has now elapsed.
    ///
    /// Returned ids are safe to hand to [`IdFactoryWithReuse::reuse`].
    pub(crate) fn advance_cycle(&self) -> Vec<TaskId> {
        let cycle = {
            let mut cycle = self.cycle.lock();
            *cycle = cycle.saturating_add(1);
            *cycle
        };
        let mut queue = self.queue.lock();
        let mut released = Vec::new();
        // The queue is in cycle order, so the first entry that is too young ends the scan.
        while let Some(&(id, freed_at)) = queue.front() {
            if cycle.saturating_sub(freed_at) < self.delay_cycles {
                break;
            }
            queue.pop_front();
            released.push(id);
            self.released.lock().insert(id);
        }
        released
    }

    /// Number of ids currently waiting out their window. Observability only.
    pub(crate) fn pending(&self) -> usize {
        self.queue.lock().len()
    }

    /// Every id this session has freed and not since seen resurrected, for persistence.
    ///
    /// No retraction path is needed for resurrection: `resurrect_deleted` can only revive a task
    /// while it is still resident, and eviction is what puts an id in this queue, so a resurrected
    /// task never reaches [`Self::defer`] in the first place. Includes ids still
    /// inside their in-memory window: the window exists to protect *this* session's stale
    /// references, and a fresh session starts with no resident state, so nothing can hold one.
    pub(crate) fn persistable(&self) -> Vec<TaskId> {
        let queue = self.queue.lock();
        let released = self.released.lock();
        let mut ids: Vec<TaskId> = queue.iter().map(|&(id, _)| id).collect();
        ids.extend(released.iter().copied());
        ids
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn id(n: u32) -> TaskId {
        TaskId::try_from(n).unwrap()
    }

    #[test]
    fn releases_after_the_delay() {
        let q = DeferredIdReuse::new(2);
        q.defer([id(1), id(2)]);
        assert!(q.advance_cycle().is_empty(), "one cycle is not enough");
        assert_eq!(q.pending(), 2);
        assert_eq!(q.advance_cycle(), vec![id(1), id(2)]);
        assert_eq!(q.pending(), 0);
    }

    #[test]
    fn zero_delay_releases_on_the_next_cycle() {
        // The aliasing-pressure configuration: maximum reuse, minimum window.
        let q = DeferredIdReuse::new(0);
        q.defer([id(7)]);
        assert_eq!(q.advance_cycle(), vec![id(7)]);
    }

    #[test]
    fn ids_freed_in_later_cycles_wait_their_own_window() {
        let q = DeferredIdReuse::new(1);
        q.defer([id(1)]);
        assert_eq!(q.advance_cycle(), vec![id(1)]);
        // Deferred during cycle 1, so it must not come back until cycle 2.
        q.defer([id(2)]);
        assert_eq!(q.advance_cycle(), vec![id(2)]);
    }

    #[test]
    fn persistable_covers_both_waiting_and_released_ids() {
        // The next session has no resident state, so an id that is still inside this session's
        // window is nonetheless free from its point of view — both halves must be offered.
        let q = DeferredIdReuse::new(1);
        q.defer([id(1)]);
        assert_eq!(q.advance_cycle(), vec![id(1)]);
        q.defer([id(2)]);
        let mut persistable = q.persistable();
        persistable.sort();
        assert_eq!(persistable, vec![id(1), id(2)]);
    }

    #[test]
    fn a_quiet_cycle_releases_nothing() {
        let q = DeferredIdReuse::new(1);
        assert!(q.advance_cycle().is_empty());
        assert_eq!(q.pending(), 0);
    }

    #[test]
    fn mixed_ages_release_in_order_without_stranding_the_tail() {
        // Regression guard for the early-break scan: a young entry at the front must not hide
        // older ones behind it, and must not be released with them either.
        let q = DeferredIdReuse::new(2);
        q.defer([id(1)]);
        q.advance_cycle();
        q.defer([id(2)]);
        // cycle 2: id(1) is 2 cycles old, id(2) is only 1.
        assert_eq!(q.advance_cycle(), vec![id(1)]);
        assert_eq!(q.pending(), 1);
        assert_eq!(q.advance_cycle(), vec![id(2)]);
    }
}
