//! Garbage collection for the persistent backend.
//!
//! GC removes tasks that have become unreachable from the live task graph (their persistent
//! `parent_count` reached 0) from both memory and the on-disk cache. The pass runs under the
//! coordinator's GC phase (see
//! [`SnapshotCoordinator::begin_gc`](crate::backend::snapshot_coordinator)) — which excludes normal
//! operations — and is driven as a fully parallel, self-feeding job pool
//! (see [`TurboTasksBackend::gc_collect`]).
//!
//! This module holds the GC-specific logic (the job types, the pool driver, per-job teardown, and
//! the pin/unpin bookkeeping) as an `impl TurboTasksBackend`; it is a child of the `backend` module
//! so it reaches the backend's private state (`storage`, `snapshot_coord`) and the GC-only
//! `execute_context_gc` directly. Callers (`snapshot_and_persist`, `stop`, the background job loop,
//! the `Backend` trait's `pin_task_for_gc`/`unpin_task_for_gc`) live in `mod.rs`.

use std::sync::{
    LazyLock,
    atomic::{AtomicUsize, Ordering},
};

use turbo_tasks::{
    TaskId, TurboTasks,
    scope::{Spawner, scope_self_feeding},
};

use crate::backend::{
    TurboTasksBackend,
    operation::{
        AggregationUpdateQueue, CleanupOldEdgesOperation, ExecuteContext, ExecuteContextImpl,
        OutdatedEdge, TaskGuard,
    },
    storage::{SpecificTaskDataCategory, TaskDataCategory},
    storage_schema::TaskStorageAccessors,
};

/// When `TURBO_ENGINE_GC` is set to a truthy value, the background job runs a `parent_count`-driven
/// garbage-collection pass (tearing down tasks whose persistent parent count reached 0). Opt-in
/// until it has been proven on trusted apps; the eventual default-on flip gets its own escape
/// hatch.
static GC_ENABLED: LazyLock<bool> = LazyLock::new(|| {
    std::env::var_os("TURBO_ENGINE_GC")
        .is_some_and(|v| matches!(v.to_str(), Some("1" | "true" | "yes")))
});

/// Whether the `parent_count`-driven GC pass is enabled (via `TURBO_ENGINE_GC`). Read by
/// `snapshot_and_persist` to decide whether to run GC before the snapshot.
pub(super) fn gc_enabled() -> bool {
    *GC_ENABLED
}

/// A unit of garbage-collection work fed through the self-feeding parallel pool in
/// [`TurboTasksBackend::gc_collect`]: collecting one task. Parallelism is *across* tasks — the pool
/// runs many `Collect` jobs on different workers — while each task's own teardown (its
/// `CleanupOldEdges` run) is sequential. A `Collect` discovers more `Collect` jobs (each child the
/// cleanup drives to `parent_count == 0` and that is itself collectible), which flow straight back
/// into the pool until it drains.
///
/// (A single-variant enum today; kept as an enum so the self-feeding pool's job type has room to
/// grow — e.g. if the per-task teardown is later split to fan a huge task's edges across workers.)
enum GcJob {
    /// Re-validate `task_id`'s collectibility and, if still collectible, tear it down: run
    /// [`CleanupOldEdgesOperation`] over all its edges (dropping children's `parent_count`,
    /// scrubbing forward-dep reverse edges, and rebalancing the aggregation graph), remove it from
    /// the in-memory map + task_cache, record its tombstone, then spawn a [`GcJob::Collect`] for
    /// each child the cleanup drove to `parent_count == 0` that is now itself collectible.
    Collect(TaskId),
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
    /// child that reaches 0), removing them from the in-memory map + task_cache, and buffering an
    /// on-disk tombstone for the next persistence commit.
    ///
    /// The pass is fully parallel and self-feeding via [`scope_self_feeding`]: work is a pool of
    /// [`GcJob`]s (collect a task; decrement a chunk of children; scrub a chunk of reverse-dep
    /// edges) and any job may spawn more (a collect fans out into decrements + scrubs; a decrement
    /// that drives a child to 0 spawns a collect). There are no synchronization barriers between
    /// "levels" of the cascade — discovered work flows straight back into the pool — and no single
    /// job carries unbounded work: a task with 20K children or 20K forward deps fans out into many
    /// chunked jobs (see [`spawn_chunked`]), so one huge task can't pin a single worker while
    /// others idle.
    ///
    /// Why this is safe to run concurrently under the GC phase (which excludes normal operations
    /// but not the GC jobs from each other):
    /// - Each job builds its own [`ExecuteContext`] (`execute_context_gc`); the concurrent-lock
    ///   detector is per-context, so jobs on different threads holding different task guards do not
    ///   false-positive.
    /// - The storage map is a sharded dashmap: different tasks hit different shards; same-task
    ///   access is serialized by the shard lock.
    /// - The cascade decrement (`update_and_get_parent_count(-1)`) is a read-modify-write under the
    ///   child's entry write lock, so if two collected parents decrement the same child
    ///   concurrently, exactly one observes the count hit 0 and spawns its collect — no
    ///   double-collect, no lost decrement.
    /// - A collectible task has `parent_count == 0`, so no *surviving* task lists it as a child: a
    ///   task becomes a collect target only after its last persistent parent was itself collected
    ///   (which removed the edge). So a `Collect` never races a decrement of the same task and
    ///   never `ctx.task`-resurrects a task another job just removed.
    /// - Per-job results merge into shared accumulators guarded by a mutex/atomic, touched only on
    ///   the rare collect/retain outcome (not per decrement or per scrub), so they are not a
    ///   contention hot spot.
    ///
    /// `scope_self_feeding` runs jobs on the runtime worker threads plus the calling thread, which
    /// drains the whole (growing) pool itself if no helper is scheduled — so this does not depend
    /// on free worker threads (robust on thread-limited runtimes). GC runs from a synchronous
    /// backend context (like `connect_children`, which also fans out onto the scope machinery).
    ///
    /// Returns the number of tasks collected (marked soft-deleted). The on-disk tombstones are not
    /// produced here — collected tasks are left resident with their `deleted` flag set, and the
    /// next snapshot derives the tombstones from that flag (see `snapshot_and_persist`).
    pub(crate) fn gc_collect(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> usize {
        // Seed the pool by scanning the resident map for tasks that pass the cheap
        // `gc_maybe_collectible` pre-filter (a handful of field reads per task under a shard read
        // lock — the same shape as the eviction scan, which proved this is fast). We scan rather
        // than maintain an incremental candidate set: correctness derives entirely from each task's
        // durable `parent_count`, so there's nothing to persist across sessions and nothing to keep
        // in sync (a scan can't miss a task the way a hand-maintained side-set could). `Collect`
        // re-validates each candidate authoritatively under a guard. The scan only sees resident
        // tasks; disk-only garbage is collected after it is next restored.
        //
        // TODO(perf): recycle the task ids of collected tasks. `persisted_task_id_factory`
        // (`IdFactoryWithReuse`) can hand out freed ids, and the persisted `next_free_task_id`
        // high-water mark only grows today, so the id space grows unboundedly across churn even
        // though the task set stays flat. Reuse must happen only AFTER the `save_snapshot` that
        // tombstoned the id has committed (a crash before commit leaves the task on disk — reusing
        // its id would alias it), and must be guarded against resurrection: between removal and
        // commit a `get_or_create_task` for the same type could re-mint the id, and the id must not
        // be handed out while any live `OperationVc`/`DetachedVc` still references it. Feed the
        // recycled ids into `persisted_task_id_factory` so the high-water mark can stop growing.
        let seeds: Vec<GcJob> = self
            .storage
            .gc_collectible_candidates()
            .into_iter()
            .map(GcJob::Collect)
            .collect();
        if seeds.is_empty() {
            return 0;
        }

        // Written once per collected task (not per child/dep), so the atomic is not a hot path.
        let collected = AtomicUsize::new(0);

        scope_self_feeding(seeds, |spawner, job| {
            self.gc_run_job(job, spawner, turbo_tasks, &collected);
        });

        collected.into_inner()
    }

    /// Runs one [`GcJob`], possibly spawning follow-up jobs into the same pool. See
    /// [`Self::gc_collect`] for the concurrency argument. Each job builds its own GC
    /// [`ExecuteContext`].
    fn gc_run_job(
        &self,
        job: GcJob,
        spawner: &Spawner<'_, '_, GcJob>,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
        collected: &AtomicUsize,
    ) {
        match job {
            GcJob::Collect(task_id) => {
                let mut ctx = self.execute_context_gc(turbo_tasks);
                // `All` restores Data so the edge capture below can read the Data-category dep
                // sets.
                let task = ctx.task(task_id, TaskDataCategory::All);
                debug_assert!(
                    task.is_gc_collectible(),
                    "gc: Collect({task_id}) for a non-collectible task — the seed scan's \
                     Meta-resident `gc_maybe_collectible` filter and the cascade's collectibility \
                     check should guarantee collectibility under the GC phase"
                );

                // Capture ALL of this task's edges as `OutdatedEdge`s, then hand them to the same
                // `CleanupOldEdges` operation a re-executing task uses. This is what makes GC
                // teardown correct: alongside dropping each child's `parent_count` and scrubbing
                // the forward-dep reverse edges, it PROPAGATES THE AGGREGATION
                // REBALANCE (removes this task from its children's `upper` sets via
                // `InnerOfUppersLostFollowers`). Without that, collected children
                // would be left with a dangling upper edge and never
                // become collectible themselves. The op opens `ctx.task(task_id)` to remove the
                // child edges, so it must run while `task_id` is still resident.
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

                CleanupOldEdgesOperation::run(
                    task_id,
                    old_edges,
                    AggregationUpdateQueue::new(),
                    &mut ctx,
                );

                // The edges are gone and the children are rebalanced. Instead of removing the task
                // from the map now (which would let a later `ctx.task` on it — e.g. a sibling's
                // `CleanupOldEdges` forward-dep scrub — resurrect it from disk as a zombie), mark
                // it soft-deleted and keep it resident. The next snapshot tombstones its on-disk
                // copy; a later step hard-deletes it from memory once the tombstone has committed.
                self.gc_mark_deleted(task_id, &mut ctx);
                collected.fetch_add(1, Ordering::Relaxed);

                // `CleanupOldEdges` recorded (on this GC context) every child whose persistent
                // `parent_count` reached 0. Those are the cascade candidates: re-check
                // collectibility under each child's guard (count 0 alone isn't enough — it could be
                // pinned, a root, or still hold aggregation edges) and spawn a `Collect` for the
                // ones that are collectible. Each child reaches 0 exactly once, so there is no
                // double-queueing.
                let newly_parentless = ctx.take_gc_parent_count_zeroed();
                for child in newly_parentless {
                    debug_assert!(
                        !child.is_transient(),
                        "gc: a transient task should never have a persistent parent_count to zero"
                    );
                    if ctx.task(child, TaskDataCategory::Meta).is_gc_collectible() {
                        spawner.spawn(GcJob::Collect(child));
                    }
                }
            }
        }
    }

    /// Marks a collected task **soft-deleted**: it stays resident (in the map and `task_cache`) but
    /// is flagged for deletion and forced into the next snapshot's modified scan. The task's edges
    /// and the aggregation rebalance were already handled by the `CleanupOldEdges` run in
    /// [`Self::gc_run_job`] before this is called.
    ///
    /// Keeping the task resident is the whole point: during the pass another job's `ctx.task` on it
    /// (e.g. a sibling's forward-dep scrub inside `CleanupOldEdges`) finds a real entry rather than
    /// restoring a zombie from disk. The next snapshot's `process` closure sees the `deleted` flag,
    /// tombstones the on-disk copy (task meta/data + `TaskCache` bucket) instead of persisting, and
    /// clears the modified flags; a later step (`evict_after_snapshot`, or the drain snapshot at
    /// shutdown) hard-deletes it from memory once the tombstone has committed. If the task is
    /// resurrected by a connect before then, the marker is cleared and it is made dirty. Must be
    /// called while holding the GC phase.
    fn gc_mark_deleted(&self, task_id: TaskId, ctx: &mut impl ExecuteContext<'_>) {
        let mut task = ctx.task(task_id, TaskDataCategory::Meta);
        task.gc_set_deleted();
        // Force the task into the next snapshot's per-shard modified scan so `process` can
        // tombstone it. A cleanly-disconnected collectible task typically has no modified
        // flags set. The returned `TrackOutcome` is only for undo; GC's mark is permanent,
        // so discard it.
        let _ = task.track_modification(SpecificTaskDataCategory::Meta, "gc_deleted");
    }

    /// Body of [`Backend::pin_task_for_gc`](turbo_tasks::backend::Backend::pin_task_for_gc); the
    /// trait method in `mod.rs` delegates here. See the inline comments for the exclusion and
    /// non-resurrection reasoning.
    pub(super) fn gc_pin(&self, task: TaskId) {
        // Once the backend is stopping, GC bookkeeping is irrelevant (the whole task map is torn
        // down in `stop()`), so pin/unpin become no-ops. This also makes them safe against handles
        // finalized during shutdown — e.g. a `DetachedVc` handed to JS across NAPI is dropped
        // (which unpins) during Node worker teardown, *after* `stop()` has dropped the map.
        if self.stopping.load(Ordering::Acquire) {
            return;
        }
        // Take an operation guard so pin cannot interleave with a GC pass: it runs strictly before
        // or strictly after a collection, never concurrently with `is_gc_collectible` / task
        // removal. This is deadlock-free because neither pin caller holds a guard already —
        // `prevent_gc` runs in the unguarded user-future region, and `DetachedVc` pins from a NAPI
        // thread — and the GC pass itself never calls pin/unpin.
        let _guard = self.start_operation();
        // A pin is an in-session reference from outside the tracked graph (an explicit
        // `prevent_gc`, or a detached handle like `DetachedVc` holding the task's `OperationVc`
        // across NAPI). It is counted the same way a transient parent's edge is: bump
        // `transient_ref_count`. While that count is > 0 the task is uncollectible (see
        // `is_gc_collectible`) and unevictable (see `evictability`, so the transient count can't be
        // lost). Counting (rather than a bool flag) makes nested/cloned pins correct — each pin is
        // balanced by its own unpin.
        //
        // Use the non-inserting `with_task_mut`: a pin always targets a live reference, so the task
        // must be resident. A missing entry means the caller pinned an already-collected task (a
        // "zombie `OperationVc`") — a bug we surface via debug_assert rather than paper over by
        // resurrecting a blank entry (which would leave an orphaned zombie in the map).
        let existed = self
            .storage
            .with_task_mut(task, |t| t.gc_increment_transient_ref_count());
        debug_assert!(
            existed.is_some(),
            "pin_task_for_gc: task {task} has no resident entry (pinned an already-collected \
             task?)"
        );
    }

    /// Body of [`Backend::unpin_task_for_gc`](turbo_tasks::backend::Backend::unpin_task_for_gc);
    /// the trait method in `mod.rs` delegates here.
    pub(super) fn gc_unpin(&self, task: TaskId) {
        // See `gc_pin`: no-op once stopping, so handles finalized during shutdown (after the map is
        // dropped) don't underflow the count.
        if self.stopping.load(Ordering::Acquire) {
            return;
        }
        let _guard = self.start_operation();
        let existed = self
            .storage
            .with_task_mut(task, |t| t.gc_decrement_transient_ref_count());
        debug_assert!(
            existed.is_some(),
            "unpin_task_for_gc: task {task} has no resident entry (unpinned an already-collected \
             task?)"
        );
    }

    /// Runs a full GC pass under the GC phase and returns the number of tasks collected (marked
    /// soft-deleted). The tombstones are derived by a subsequent snapshot from the `deleted` flag,
    /// so — unlike before — nothing needs to be threaded to `snapshot_and_evict_for_testing`
    /// (production runs GC inline in `snapshot_and_persist`). Test-only hook; callers must be idle
    /// (no task executing).
    #[doc(hidden)]
    pub fn gc_for_testing(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> usize {
        let _serialize = self.snapshot_in_progress.lock();
        let _gc_phase = self.snapshot_coord.begin_gc();
        self.gc_collect(turbo_tasks)
    }
}
