//! Garbage collection for the persistent backend.
//!
//! GC identifies and tears down tasks that have no reverse references using the `parent_count` and
//! `transient_ref_count`. Tasks are marked `deleted` and then have their outgoing edges teared down
//! recursively.
//!
//! A collected task also has its cell data released immediately to deliver immediate memory wins.
//!
//! The pass runs under the coordinator's exclusion phase (see
//! [`SnapshotCoordinator::begin_exclusion`](crate::backend::snapshot_coordinator)), which excludes
//! normal operations. That exclusion is what lets a pass edit the graph without racing a mutation
//! that could resurrect a task mid-collect, and hand its decisions straight to persistence: the
//! same guard stays held across the snapshot that writes the tombstones.
//!
//! A pass has two phases: a fully parallel, unbounded job pool that tears down garbage, followed by
//! a single scan that classifies GC roots once the graph is quiescent (see
//! [`TurboTasksBackend::gc_collect`]).

use std::{
    fmt::Display,
    ops::ControlFlow,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use bincode::{Decode, Encode};
use rustc_hash::FxHashMap;
use turbo_tasks::{TaskId, TurboTasks, scope_unbounded::scope_unbounded_with};

use crate::{
    backend::{
        AnyOperation, TurboTasksBackend,
        operation::{
            AggregationUpdateQueue, CleanupOldEdgesOperation, ExecuteContext, ExecuteContextImpl,
            TaskGuard, capture_all_outgoing_edges,
        },
        snapshot_coordinator::SnapshotPhase,
        storage::{SpecificTaskDataCategory, TaskDataCategory},
        storage_schema::TaskStorageAccessors,
    },
    backing_storage::SnapshotItem,
};

/// How long a GC root may go un-anchored before it is collected.
/// Default to 3 days so that a root that is at least occasionally used can survive a weekend.
///
/// Aging out roots solves the problem of missing `gc_unpin` calls.  We can miss them for structural
/// reasons, bugs or just shutdown races (drops from native threads race with turbopack shutdown).
/// So using a TTL to track roots that haven't shown up in new sessions we can solve this leak.
///
/// The TTL counter is serving as a check for both new sessions and time.  To be aged out you get
/// one session to start the clock and then eventually the timer expires.  This is intentionally
/// course.
pub(crate) const DEFAULT_GC_ROOT_TTL: Duration = Duration::from_secs(3 * 24 * 60 * 60);

/// How long a GC root has gone without being observed live, as stored in the persisted roots map.
#[derive(Encode, Decode, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TtlCounter {
    /// Observed live (a durable, anchored root) in the most recent session.
    MostRecent,
    /// System time millis at which a session's **first** GC pass first found this root not live.
    FirstStale(u64),
}

/// One unit of GC work.
enum GcJob {
    /// Scan one shard of the resident map (by index) and enqueue its candidates as
    /// [`GcJob::Collect`].
    ScanShard(usize),
    /// Collect a single task
    Collect(TaskId),
}

/// Decides when a GC pass should stop early because it is delaying real work.
struct GcBudget<'a> {
    phase: &'a SnapshotPhase<'a, AnyOperation>,
    started: Instant,
    /// The minimum quantum of work this pass does before any interrupt is honoured.
    min_progress: Duration,
    /// Latched on the first trip. Re-polling per job would let a waiter that arrives and leaves
    /// produce a ragged pass that stops and starts; once we have decided to wind down, we commit.
    /// Also reports whether the pass was interrupted, for [`GcStats`].
    stopped: AtomicBool,
}

impl GcBudget<'_> {
    fn should_stop(&self) -> bool {
        if self.stopped.load(Ordering::Relaxed) {
            return true;
        }
        if !self.phase.operations_waiting() {
            return false;
        }
        if self.started.elapsed() < self.min_progress {
            return false;
        }
        // If we get here then there is an operation waiting _and_ we have already executed for at
        // least our min_progress duration
        self.stopped.store(true, Ordering::Relaxed);
        true
    }

    fn was_interrupted(&self) -> bool {
        self.stopped.load(Ordering::Relaxed)
    }
}

/// Observability counters for one [`TurboTasksBackend::gc_collect`] pass.
#[derive(Default, Debug)]
pub(crate) struct GcStats {
    /// Number of roots detected by the pass
    pub gc_roots: usize,
    /// Tasks collected (marked soft-deleted).
    pub collected: usize,
    /// Edges torn down across all collected tasks (children + forward-dependency reverse edges).
    pub edges_deleted: usize,
    /// Cross-session roots that aged out past the TTL.
    pub aged_out_roots: usize,
    /// Persisted roots that this pass collected, to be dropped from the roots map.
    pub deleted_roots: Vec<TaskId>,
    /// The gc loop was interrupted by competing work.
    pub interrupted: bool,
}

impl Display for GcStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "gc_roots = {gc_roots}, collected: {collected}, edges_deleted: {edges_deleted}, \
             aged_out_roots = {aged_out_roots}, interrupted = {interrupted}",
            gc_roots = self.gc_roots,
            collected = self.collected,
            edges_deleted = self.edges_deleted,
            aged_out_roots = self.aged_out_roots,
            interrupted = self.interrupted
        )
    }
}

impl GcStats {
    fn merge(mut self, mut other: Self) -> Self {
        self.collected += other.collected;
        self.edges_deleted += other.edges_deleted;
        self.gc_roots += other.gc_roots;
        self.aged_out_roots += other.aged_out_roots;
        // Order doesn't matter, so keep the larger allocation and append the smaller one into it.
        // One or both sides are usually empty.
        if other.deleted_roots.len() > self.deleted_roots.len() {
            other.deleted_roots.append(&mut self.deleted_roots);
            self.deleted_roots = other.deleted_roots;
        } else {
            self.deleted_roots.append(&mut other.deleted_roots);
        }
        self
    }
}

impl TurboTasksBackend {
    /// Collect all garbage from the task-cache
    ///
    /// `phase` is the held exclusion; it is the caller's proof that no operation is running, which
    /// is what makes it safe to mutate the graph here.
    ///
    /// `interruptible` controls whether we should abandon GC if other tasks are waiting to run.
    /// Abandonment is controlled by [`GcBudget`] which ensures we can make a minimum amount of
    /// progress even under load.
    ///
    /// Returns [`GcStats`] for the pass and the new roots to persist if any
    pub(crate) fn gc_collect(
        &self,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
        phase: &SnapshotPhase<'_, AnyOperation>,
        interruptible: bool,
    ) -> (GcStats, Option<Vec<(TaskId, TtlCounter)>>) {
        // Record the time at the beginning of the loop to have a consistent timestamp for the roots
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let mut roots = self
            .backing_storage
            .roots()
            .expect("reading gc roots should not fail")
            .into_iter()
            .collect::<FxHashMap<TaskId, TtlCounter>>();
        let roots_before = roots.clone();

        let aged_out = self.gc_roots_refresh_and_age_out(&mut roots, now);

        let aged_out_count = aged_out.len();
        let budget = if interruptible {
            Some(GcBudget {
                phase,
                started: Instant::now(),
                min_progress: self.gc_min_progress,
                stopped: AtomicBool::new(false),
            })
        } else {
            None
        };

        let mut stats: GcStats = scope_unbounded_with(
            // Start by scanning all shards and collecting the aged out roots from prior sessions
            (0..self.storage.shard_count())
                .map(GcJob::ScanShard)
                .chain(aged_out.into_iter().map(GcJob::Collect)),
            GcStats::default,
            |spawner, job, stats| {
                // Abort the gc loop if we are interrupted
                if let Some(budget) = &budget
                    && budget.should_stop()
                {
                    return ControlFlow::Break(());
                }
                let collector = |task_id| spawner.spawn(GcJob::Collect(task_id));
                let task_id = match job {
                    GcJob::ScanShard(index) => {
                        self.storage.gc_scan_shard(index, collector);
                        return ControlFlow::Continue(());
                    }
                    GcJob::Collect(task_id) => task_id,
                };
                let mut ctx = ExecuteContextImpl::new_for_gc(self, turbo_tasks, phase, &collector);
                // `All` restores Data so the edge capture below can read the Data-category dep
                // sets.
                let mut task = ctx.task(task_id, TaskDataCategory::All);
                // Recheck under the guard, and note that this is the **authoritative** check:
                // the shard scan that produced this candidate only had Meta, so it could not see
                // dependency edges (see `TaskStorage::gc_maybe_collectible`). With `All` open the
                // same predicate is exact. A racing teardown can also add uppers/followers that
                // temporarily remove collectibility; such a task is re-enqueued by a later pass.
                if !task.is_gc_collectible() {
                    return ControlFlow::Continue(());
                }

                let old_edges = capture_all_outgoing_edges(&task);
                // Clear `immutable` defensively so `resurrect_deleted` can mark the task dirty if
                // it needs to
                task.set_immutable(false);
                // Drop the whole cell payload. This recovers most of the RAM while persistence
                // writes the tombstone.
                drop(task.take_cell_data());
                task.set_deleted(true);
                if task.new_task() {
                    task.discard_modifications_for_gc_new_task();
                } else {
                    // Persisted ensure it is marked modified so the next snapshot tombstones it.
                    // It is almost certainly already marked modified, so this is mostly a no-op.
                    let _ = task.track_modification(SpecificTaskDataCategory::Meta, "gc_deleted");
                }
                drop(task); // drop the lock so CleanupOldEdgesOperation can run
                stats.collected += 1;
                stats.edges_deleted += old_edges.len();
                // If we happened to delete a known root at this point record it so we can reconcile
                // later.
                if roots.contains_key(&task_id) {
                    stats.deleted_roots.push(task_id);
                }
                CleanupOldEdgesOperation::run(
                    task_id,
                    old_edges,
                    AggregationUpdateQueue::new(),
                    &mut ctx,
                );
                ControlFlow::Continue(())
            },
            GcStats::merge,
        );

        // Drop the entries for the roots this pass collected, recorded as they were deleted.
        for id in &stats.deleted_roots {
            roots.remove(id);
        }

        // Collect all active roots
        // We don't do this in the GC pass because a task detected as a root 'early' might become a
        // non-root later due to other operations (e.g. it might get promoted to a live aggregation
        // root).
        for id in self.storage.gc_scan_roots() {
            roots.insert(id, TtlCounter::MostRecent);
        }

        stats.gc_roots = roots.len();
        stats.aged_out_roots = aged_out_count;
        stats.interrupted = budget
            .as_ref()
            .is_some_and(|budget| budget.was_interrupted());

        // Only persist the roots map if it actually changed
        let roots_to_persist: Option<Vec<_>> =
            (roots != roots_before).then(|| roots.into_iter().collect());
        (stats, roots_to_persist)
    }

    /// Compute which persisted roots have expired their TTL
    /// Also
    /// - start the staleness clock for roots that are no longer resident
    /// - drop roots that are resident (the GC pass will pass judgement)
    fn gc_roots_refresh_and_age_out(
        &self,
        map: &mut FxHashMap<TaskId, TtlCounter>,
        now: u64,
    ) -> Vec<TaskId> {
        let ttl_ms = self.gc_root_ttl.as_millis() as u64;

        let mut aged_out = Vec::new();
        map.retain(|id, counter| {
            if self.storage.with_task(*id, |_| ()).is_some() {
                // Resident: `gc_scan_roots` decides. Drop it either way.
                return false;
            }
            match *counter {
                TtlCounter::MostRecent => {
                    // It was recent in the last pass but not this one. Start the clock
                    *counter = TtlCounter::FirstStale(now);
                    true
                }
                TtlCounter::FirstStale(since) => {
                    if now.saturating_sub(since) > ttl_ms {
                        // Enqueue for collection, which restores it from disk and attempts the
                        // delete. Dropped from the map: see the note above.
                        aged_out.push(*id);
                        false
                    } else {
                        true
                    }
                }
            }
        });

        aged_out
    }

    pub(super) fn pin_task_for_gc(
        &self,
        task: TaskId,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        self.gc_update_pin(task, 1, "pin_task_for_gc", turbo_tasks);
    }

    pub(super) fn unpin_task_for_gc(
        &self,
        task: TaskId,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        self.gc_update_pin(task, -1, "unpin_task_for_gc", turbo_tasks);
    }

    /// Applies `delta` to a task's `transient_ref_count`
    fn gc_update_pin(
        &self,
        task: TaskId,
        delta: i32,
        op: &'static str,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) {
        // We expect this call to come from outside a turbo-task context, at least sometimes
        // So be defensive about conostructing a context.  If we get none then we are shutting down
        // and it is too late for ref-counting.
        let Some(mut ctx) = self.try_execute_context(turbo_tasks) else {
            return;
        };
        // Technically we only need to manipulate transient data so meta is overkill. But the task
        // must be resident if we are adding a pin so this isn't wasteful
        let mut task = ctx.task(task, TaskDataCategory::Meta);
        task.assert_not_deleted(op);
        task.update_and_get_transient_ref_count(delta);
    }

    /// Runs a full GC pass under the GC phase and returns the number of tasks collected.
    #[doc(hidden)]
    pub fn gc_for_testing(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> usize {
        // A pass sets `deleted` flags, and the persist path only knows how to tombstone those when
        // GC is enabled. Running a pass on a GC-disabled backend would leave soft-deleted tasks
        // that persistence refuses to handle, so require the backend to be configured for GC
        // (`BackendOptions::gc` or `TURBO_ENGINE_GC`) rather than silently diverging from
        // production.
        assert!(
            self.gc_enabled,
            "gc_for_testing requires a GC-enabled backend: set `BackendOptions::gc = Some(true)`"
        );
        let _serialize = self.snapshot_in_progress.lock();
        let phase = self.snapshot_coord.begin_snapshot();
        let (stats, roots) = self.gc_collect(turbo_tasks, &phase, /* interruptible= */ false);

        // Persist the roots map this pass produced. Some tests query the roots set and GC itself
        // does as well, this ensures it is available to the next cycle.
        if let Some(roots) = roots
            && let Err(err) = self.backing_storage.save_snapshot(
                Vec::new(),
                Some(roots),
                Vec::<Vec<SnapshotItem>>::new(),
            )
        {
            panic!("gc_for_testing: failed to persist GC roots: {err:?}");
        }
        stats.collected
    }
}
