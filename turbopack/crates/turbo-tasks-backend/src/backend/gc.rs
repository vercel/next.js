//! Garbage collection for the persistent backend.
//!
//! GC removes tasks that have become unreachable from the live task graph (their persistent
//! `parent_count` reached 0) from both memory and the on-disk cache. The pass runs under the
//! coordinator's GC phase (see
//! [`SnapshotCoordinator::begin_gc`](crate::backend::snapshot_coordinator)) — which excludes normal
//! operations — and is driven as a fully parallel, unbounded job pool
//! (see [`TurboTasksBackend::gc_collect`]).
//!
//! The GC-specific logic — job types, the pool driver, per-job teardown, and the pin/unpin
//! bookkeeping — as an `impl TurboTasksBackend`. Its entry points are called from `mod.rs`.

use std::{ops::ControlFlow, sync::atomic::Ordering};

use turbo_tasks::{TaskId, TurboTasks, scope_unbounded::scope_unbounded_with};

use crate::backend::{
    TurboTasksBackend,
    operation::{
        AggregationUpdateQueue, CleanupOldEdgesOperation, ExecuteContext, ExecuteContextImpl,
        OutdatedEdge, TaskGuard,
    },
    storage::{SpecificTaskDataCategory, TaskDataCategory},
    storage_schema::TaskStorageAccessors,
};

/// One unit of GC work. Parallelism is *across* jobs (the unbounded pool in
/// [`TurboTasksBackend::gc_collect`] runs many on different workers); each job is internally
/// sequential. Both variants produce more work, which flows straight back into the same pool.
enum GcJob {
    /// Scan one shard of the resident map (by index) and enqueue its candidates as
    /// [`GcJob::Collect`].
    ///
    /// Seeding the pool with these rather than scanning the whole map up front keeps the scan off
    /// the critical path: the first shard's candidates begin tearing down while the last shard is
    /// still being read.
    ScanShard(usize),
    /// Tear down a single task: scrub its edges, drop its children's `parent_count`, and mark it
    /// soft-deleted. Can discover more work — a child the cleanup drives to `parent_count == 0`
    /// that is itself collectible.
    Collect(TaskId),
}

/// Observability counters for one [`TurboTasksBackend::gc_collect`] pass.
///
/// Accumulated per drainer and folded at the join (see [`GcStats::merge`]) rather than through
/// shared atomics: at one increment per collected task across every worker, shared counters were
/// several percent of collect time in profiles.
#[derive(Default)]
pub(crate) struct GcStats {
    /// Tasks collected (marked soft-deleted).
    pub collected: usize,
    /// Edges torn down across all collected tasks (children + forward-dependency reverse edges).
    pub edges_deleted: usize,
}

impl GcStats {
    /// Combines two drainers' counts. Addition, so associative and commutative as
    /// [`scope_unbounded_with`] requires.
    fn merge(mut self, other: Self) -> Self {
        self.collected += other.collected;
        self.edges_deleted += other.edges_deleted;
        self
    }
}

impl TurboTasksBackend {
    /// An execute context for the garbage collector that does not take an operation guard. Only
    /// valid while the caller holds the coordinator's GC phase (which provides exclusion); see
    /// [`ExecuteContextImpl::new_for_gc`].
    fn execute_context_gc<'a>(
        &'a self,
        turbo_tasks: &'a TurboTasks<TurboTasksBackend>,
    ) -> impl ExecuteContext<'a> {
        ExecuteContextImpl::new_for_gc(self, turbo_tasks)
    }

    /// Runs a garbage-collection pass under the coordinator's GC phase. Scans the resident map for
    /// collectible tasks (no persistent parent, quiescent, no aggregation edges), re-validates each
    /// under the exclusion, and tears down the ones that are still collectible: scrubbing their
    /// reverse-dependency edges, decrementing their children's `parent_count` (cascading to any
    /// child that reaches 0), marking them deleted, and buffering an on-disk tombstone for the next
    /// persistence commit.
    ///
    /// The pass is fully parallel and unbounded via [`scope_unbounded_with`]: work is a pool of
    /// [`GcJob`]s — scan a shard, or collect a task — and both kinds spawn more, so there are no
    /// synchronization barriers anywhere in the pass.
    ///
    /// Why this is safe to run concurrently under the GC phase (which excludes normal operations
    /// but not the GC jobs from each other):
    /// - Each job builds its own [`ExecuteContext`] (`execute_context_gc`); the concurrent-lock
    ///   detector is per-context, so jobs on different threads holding different task guards do not
    ///   false-positive.
    /// - The storage map is a sharded dashmap: different tasks hit different shards; same-task
    ///   access is serialized by the shard lock. A `ScanShard` holds only a **read** lock on its
    ///   own shard, and a collect elsewhere in the map does not contend with it; a collect landing
    ///   on the shard being scanned simply waits for that shard's (short) read lock.
    /// - Interleaving the scan with the cascade cannot miss or double-collect. Nothing is missed:
    ///   every collectible task is reached either by the scan of the shard it lives in or by the
    ///   cascade that orphans it. Nothing is collected twice: a queued candidate can be collected
    ///   by a sibling job before its own `Collect` runs, so `Collect` re-validates
    ///   `is_gc_collectible` under its write guard and skips if the task is already `deleted` (or
    ///   has since regained an anchor).
    /// - The cascade decrement (`update_and_get_parent_count(-1)`) is a read-modify-write under the
    ///   child's entry write lock, so if two collected parents decrement the same child
    ///   concurrently, exactly one observes the count hit 0 and spawns its collect — no
    ///   double-collect, no lost decrement.
    /// - A collectible task has `parent_count == 0`, so no *surviving* task lists it as a child: a
    ///   task becomes a collect target only after its last persistent parent was itself collected
    ///   (which removed the edge). So a `Collect` never races a decrement of the same task and
    ///   never `ctx.task`-resurrects a task another job just removed.
    ///
    /// Returns [`GcStats`] for the pass. The on-disk tombstones are not produced here — collected
    /// tasks are left resident with their `deleted` flag set, and the next snapshot derives the
    /// tombstones from that flag (see `snapshot_and_persist`).
    pub(crate) fn gc_collect(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> GcStats {
        // TODO(perf): recycle the task ids of collected tasks. `persisted_task_id_factory`
        // (`IdFactoryWithReuse`) can hand out freed ids, and the persisted `next_free_task_id`
        // high-water mark only grows today, so the id space grows unboundedly across churn even
        // though the task set stays flat. Reuse must happen only AFTER the `save_snapshot` that
        // tombstoned the id has committed (a crash before commit leaves the task on disk — reusing
        // its id would alias it), and must be guarded against resurrection: between removal and
        // commit a `get_or_create_task` for the same type could re-mint the id, and the id must not
        // be handed out while any live `OperationVc`/`DetachedVc` still references it. Feed the
        // recycled ids into `persisted_task_id_factory` so the high-water mark can stop growing.

        // The scan only sees resident tasks; disk-only garbage is collected after it is next
        // restored.
        let seeds: Vec<GcJob> = (0..self.storage.shard_count())
            .map(GcJob::ScanShard)
            .collect();

        scope_unbounded_with(
            seeds,
            GcStats::default,
            |spawner, job, stats| {
                let task_id = match job {
                    GcJob::ScanShard(index) => {
                        // Enqueue under the shard read lock — `spawn` is just an accounting bump
                        // plus a queue push, which is what `gc_scan_shard` requires of its
                        // callback.
                        self.storage
                            .gc_scan_shard(index, |task_id| spawner.spawn(GcJob::Collect(task_id)));
                        return ControlFlow::Continue(());
                    }
                    GcJob::Collect(task_id) => task_id,
                };
                let mut ctx = self.execute_context_gc(turbo_tasks);
                // `All` restores Data so the edge capture below can read the Data-category dep
                // sets. The target is resident either way: a scan candidate was
                // read out of the resident map, and a cascade child was just
                // decremented through its resident entry.
                let mut task = ctx.task(task_id, TaskDataCategory::All);
                // Collectibility was checked when this job was queued, but jobs run concurrently: a
                // sibling job's cascade can since have collected this task (it is then `deleted`)
                // or flipped it non-collectible (regained `activeness`/`in_progress`, or gained an
                // aggregation edge). Re-check under the guard we now hold and skip rather than
                // delete — collecting twice would double-run the edge teardown. A task that is
                // still genuinely garbage is re-selected by a later pass.
                if !task.is_gc_collectible() {
                    return ControlFlow::Continue(());
                }

                // Soft-delete rather than remove: a later `ctx.task` on a removed task would
                // resurrect it from disk as a zombie, so it stays resident until a later step
                // hard-deletes it.
                task.set_deleted(true);
                if task.new_task() {
                    // Never persisted: there is nothing on disk to tombstone, so drop it out of the
                    // next snapshot's scan entirely (clearing its modified bits + shard count).
                    // Eviction still removes the resident, soft-`deleted` task.
                    task.discard_modifications_for_gc_new_task();
                } else {
                    // Persisted: force the task into the next snapshot's scan so `process`
                    // tombstones its on-disk copy. `deleted` is transient, so setting it tracks
                    // nothing — explicitly track a meta modification. This matters even in the
                    // collectible states that otherwise leave meta clean (e.g. a pinned parentless
                    // task then unpinned, or one restored parentless from a prior session).
                    let _ = task.track_modification(SpecificTaskDataCategory::Meta, "gc_deleted");
                }
                stats.collected += 1;

                // Capture all of this task's edges and hand them to the same `CleanupOldEdges`
                // operation a re-executing task uses. Besides dropping each child's `parent_count`
                // and scrubbing forward-dep reverse edges, this propagates the aggregation
                // rebalance (removing this task from its children's `upper` sets) — without it,
                // collected children would keep a dangling upper edge and never become collectible.
                // The op opens `ctx.task(task_id)`, so it must run while `task_id` is still
                // resident.
                let mut old_edges: Vec<OutdatedEdge> = Vec::new();
                old_edges.extend(task.iter_children().map(OutdatedEdge::Child));
                old_edges.extend(
                    task.iter_output_dependencies()
                        .map(OutdatedEdge::OutputDependency),
                );
                old_edges.extend(
                    task.iter_cell_dependencies()
                        .map(OutdatedEdge::CellDependency),
                );
                old_edges.extend(
                    task.iter_cell_dependencies_hashed()
                        .map(|(r, k)| OutdatedEdge::HashedCellDependency(r, k)),
                );
                old_edges.extend(
                    task.iter_collectibles_dependencies()
                        .map(OutdatedEdge::CollectiblesDependency),
                );
                drop(task);

                stats.edges_deleted += old_edges.len();
                CleanupOldEdgesOperation::run(
                    task_id,
                    old_edges,
                    AggregationUpdateQueue::new(),
                    &mut ctx,
                );

                // `CleanupOldEdges` recorded every child whose persistent `parent_count` reached 0.
                // Re-check collectibility under each child's guard (count 0 alone isn't enough — it
                // could be pinned, a root, or still hold aggregation edges) and spawn a job for the
                // collectible ones. Each child reaches 0 exactly once, so there is no
                // double-queueing. `Meta` suffices — `is_gc_collectible` reads only Meta fields —
                // and a child that turns out collectible re-opens with `All` in its own `Collect`
                // job (restore is cached), so fetching `All` here would only waste a Data restore
                // on the non-collectible children.
                for child in ctx.take_gc_parent_count_zeroed() {
                    debug_assert!(
                        !child.is_transient(),
                        "gc: a transient task should never have a persistent parent_count to zero"
                    );
                    // The child had its `parent_count` decremented during this task's cleanup, so
                    // it is resident.
                    if ctx.task(child, TaskDataCategory::Meta).is_gc_collectible() {
                        spawner.spawn(GcJob::Collect(child));
                    }
                }

                // `CleanupOldEdges` also recorded every task whose last aggregation edge (`upper` /
                // `followers`) was removed by this cleanup. These did not lose a persistent parent;
                // they matter because a task already at `parent_count == 0` but held back by the
                // aggregation-emptiness clauses of `is_gc_collectible` may have just now satisfied
                // them. Dedup is inherent: a task `Collect`ed here (or by the count-zeroed loop)
                // soft-deletes itself and fails `is_gc_collectible` on any later look.
                for candidate in ctx.take_gc_edge_loss_candidates() {
                    // The candidate's guard was mutated in this cascade, so it is resident.
                    if ctx
                        .task(candidate, TaskDataCategory::Meta)
                        .is_gc_collectible()
                    {
                        spawner.spawn(GcJob::Collect(candidate));
                    }
                }
                ControlFlow::Continue(())
            },
            GcStats::merge,
        )
    }

    /// Body of [`Backend::pin_task_for_gc`](turbo_tasks::backend::Backend::pin_task_for_gc); the
    /// trait method in `mod.rs` delegates here.
    pub(super) fn gc_pin(&self, task: TaskId, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
        // Once stopping, GC bookkeeping is irrelevant (the map is torn down in `stop()`), so
        // pin/unpin become no-ops — also safe against handles finalized during shutdown (a
        // `DetachedVc` dropped during Node teardown unpins *after* `stop()` dropped the map).
        if self.stopping.load(Ordering::Acquire) {
            return;
        }
        // An operation-guarded context so pin runs strictly before or after a collection, never
        // concurrently with it. Deadlock-free: no pin caller already holds a guard, and the GC pass
        // never pins.
        let mut ctx = self.execute_context(turbo_tasks);
        // A pin is an in-session reference from outside the tracked graph (`prevent_gc`, or a
        // `DetachedVc` holding the task's `OperationVc` across NAPI), counted like a transient
        // parent's edge: `transient_ref_count` keeps the task uncollectible and unevictable while
        // > 0. Counting (not a bool) balances each pin against its own unpin.
        //
        // `resident_task` is non-inserting: a pin targets a live reference, so the task must be
        // resident. A missing entry means a pin of an already-collected task (a "zombie
        // `OperationVc`") — surfaced via debug_assert rather than papered over with a blank entry.
        let existed = ctx.resident_task(task);
        debug_assert!(
            existed.is_some(),
            "pin_task_for_gc: task {task} has no resident entry (pinned an already-collected \
             task?)"
        );
        if let Some(mut guard) = existed {
            guard.update_and_get_transient_ref_count(1);
        }
    }

    /// Body of [`Backend::unpin_task_for_gc`](turbo_tasks::backend::Backend::unpin_task_for_gc);
    /// the trait method in `mod.rs` delegates here.
    pub(super) fn gc_unpin(&self, task: TaskId, turbo_tasks: &TurboTasks<TurboTasksBackend>) {
        // See `gc_pin`: no-op once stopping, so handles finalized during shutdown (after the map is
        // dropped) don't underflow the count.
        if self.stopping.load(Ordering::Acquire) {
            return;
        }
        let mut ctx = self.execute_context(turbo_tasks);
        let existed = ctx.resident_task(task);
        debug_assert!(
            existed.is_some(),
            "unpin_task_for_gc: task {task} has no resident entry (unpinned an already-collected \
             task?)"
        );
        if let Some(mut guard) = existed {
            guard.update_and_get_transient_ref_count(-1);
        }
    }

    /// Runs a full GC pass under the GC phase and returns the number of tasks collected (marked
    /// soft-deleted). The tombstones are derived by a subsequent snapshot from the `deleted` flag
    /// (production runs GC inline in `snapshot_and_persist`). Test-only hook; callers must be idle
    /// (no task executing).
    #[doc(hidden)]
    pub fn gc_for_testing(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> usize {
        let _serialize = self.snapshot_in_progress.lock();
        let _gc_phase = self.snapshot_coord.begin_gc();
        self.gc_collect(turbo_tasks).collected
    }
}
