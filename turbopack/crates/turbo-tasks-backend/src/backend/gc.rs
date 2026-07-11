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
//! so it reaches the backend's private state (`gc_candidates`, `storage`, `snapshot_coord`) and the
//! GC-only `execute_context_gc` directly. Callers (`snapshot_and_persist`, `stop`, the background
//! job loop, the `Backend` trait's `pin_task_for_gc`/`unpin_task_for_gc`) live in `mod.rs`.

use std::sync::{
    LazyLock,
    atomic::{AtomicUsize, Ordering},
};

use parking_lot::Mutex;
use turbo_tasks::{
    TaskId, TurboTasks,
    scope::{Spawner, scope_self_feeding},
    util::{good_chunk_size, into_chunks},
};

use crate::{
    backend::{
        CachedTaskTypeArc, TurboTasksBackend,
        operation::{ExecuteContext, ExecuteContextImpl, TaskGuard},
        storage::TaskDataCategory,
        storage_schema::TaskStorageAccessors,
    },
    backing_storage::{TaskDeletion, compute_task_type_hash},
    data::{CellRef, CollectiblesRef},
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
/// [`TurboTasksBackend::gc_collect`]. Every variant is bounded (a single task, or a bounded chunk),
/// so no single job pins a worker with unbounded work: a task with a huge number of children or
/// forward dependencies fans out into many chunked jobs that spread across worker threads. Jobs
/// discover more jobs (a collected task spawns decrements + scrubs; a decrement that hits 0 spawns
/// a collect), which the pool drains until quiescent.
enum GcJob {
    /// Re-validate `task_id`'s collectibility and, if still collectible, tear it down: remove it
    /// from the in-memory map + task_cache, record its tombstone, then spawn [`GcJob::Decrement`]
    /// jobs for its children and `Scrub*` jobs for its forward dependencies.
    Collect(TaskId),
    /// Decrement the persistent `parent_count` of each task in the chunk (each lost a persistent
    /// parent that was just collected). Any that reach 0 are newly unreachable and spawn a
    /// [`GcJob::Collect`].
    Decrement(Vec<TaskId>),
    /// Remove `source` from the `output_dependent` reverse-set of each target task in the chunk.
    ScrubOutput {
        source: TaskId,
        targets: Vec<TaskId>,
    },
    /// Remove `source`'s cell dependency from the `cell_dependents` reverse-set of each referenced
    /// cell's task.
    ScrubCell { source: TaskId, refs: Vec<CellRef> },
    /// Like [`GcJob::ScrubCell`] for hashed cell dependencies.
    ScrubCellHashed {
        source: TaskId,
        refs: Vec<(CellRef, u64)>,
    },
    /// Remove `source` from the `collectibles_dependents` reverse-set of each referenced task.
    ScrubCollectibles {
        source: TaskId,
        refs: Vec<CollectiblesRef>,
    },
}

/// The edges captured from a collectible task under its single [`ExecuteContext`] guard, so the
/// guard can be dropped before the teardown opens the *target* tasks' guards (holding two task
/// locks at once trips the concurrent-lock detector). `children` drive the cascade; the `*_deps`
/// are the forward dependencies whose reverse side must be scrubbed; `persistent_task_type` yields
/// the on-disk `TaskCache` key.
struct GcDeletePlan {
    children: Vec<TaskId>,
    output_deps: Vec<TaskId>,
    cell_deps: Vec<CellRef>,
    cell_deps_hashed: Vec<(CellRef, u64)>,
    collectibles_deps: Vec<CollectiblesRef>,
    persistent_task_type: Option<CachedTaskTypeArc>,
}

/// Splits `items` into `good_chunk_size` chunks and spawns one [`GcJob`] per chunk (built by
/// `make_job`) into the self-feeding GC pool. A small collection becomes a single chunk job (≈
/// inline); a huge one (e.g. 20K children/deps) fans out into `~4 * parallelism` jobs that spread
/// across workers, so no single job pins a worker with unbounded work. Empty input spawns nothing.
fn spawn_chunked<I>(
    spawner: &Spawner<'_, '_, GcJob>,
    items: Vec<I>,
    make_job: impl Fn(Vec<I>) -> GcJob,
) {
    if items.is_empty() {
        return;
    }
    let chunk_size = good_chunk_size(items.len());
    for chunk in into_chunks(items, chunk_size) {
        spawner.spawn(make_job(chunk.collect()));
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

    /// Records `task_id` as a garbage-collection candidate (its persistent `parent_count` reached
    /// 0). Only non-transient tasks are tracked — transient tasks are never collected. Candidacy is
    /// re-validated under exclusion before the task is actually collected, so a false positive here
    /// (e.g. the count is bumped back up by a concurrent re-connect) is harmless.
    pub(crate) fn add_gc_candidate(&self, task_id: TaskId) {
        if task_id.is_transient() {
            return;
        }
        self.gc_candidates.lock().insert(task_id);
    }

    /// Runs a garbage-collection pass under the coordinator's GC phase. Drains the candidate set
    /// (tasks observed reaching `parent_count == 0`), re-validates each under the exclusion, and
    /// tears down the ones that are still collectible: scrubbing their reverse-dependency edges,
    /// decrementing their children's `parent_count` (cascading to any child that reaches 0),
    /// removing them from the in-memory map + task_cache, and buffering an on-disk tombstone for
    /// the next persistence commit.
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
    /// Returns `(number of tasks collected, on-disk tombstones)`.
    pub(crate) fn gc_collect(
        &self,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> (usize, Vec<TaskDeletion>) {
        // Seed the pool from the candidates observed since the last pass. Re-validation happens per
        // task in `Collect` (a candidate may have been revived by a concurrent re-connect before
        // the GC phase was acquired).
        let seeds: Vec<GcJob> = self
            .gc_candidates
            .lock()
            .drain()
            .map(GcJob::Collect)
            .collect();
        if seeds.is_empty() {
            return (0, Vec::new());
        }

        // Shared accumulators. Touched only on the (comparatively rare) collect/retain outcomes,
        // not on every decrement or scrub, so the mutexes are not a hot path.
        let deletions = Mutex::new(Vec::new());
        let collected = AtomicUsize::new(0);
        // Candidates that are still parentless but not *yet* collectible (e.g. residual transient
        // activeness) are re-retained for a later pass.
        let retain = Mutex::new(Vec::new());

        scope_self_feeding(seeds, |spawner, job| {
            self.gc_run_job(job, spawner, turbo_tasks, &deletions, &collected, &retain);
        });

        // Re-queue candidates that were still parentless but not collectible this pass, so a later
        // pass retries once their transient activeness clears.
        let retain = retain.into_inner();
        if !retain.is_empty() {
            self.gc_candidates.lock().extend(retain);
        }
        (collected.into_inner(), deletions.into_inner())
    }

    /// Runs one [`GcJob`], possibly spawning follow-up jobs into the same pool. See
    /// [`Self::gc_collect`] for the concurrency argument. Each job builds its own GC
    /// [`ExecuteContext`].
    fn gc_run_job(
        &self,
        job: GcJob,
        spawner: &Spawner<'_, '_, GcJob>,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
        deletions: &Mutex<Vec<TaskDeletion>>,
        collected: &AtomicUsize,
        retain: &Mutex<Vec<TaskId>>,
    ) {
        match job {
            GcJob::Collect(task_id) => {
                // Transient-ness is a property of the id, not the storage — check it before
                // touching the map (transient tasks are never collected).
                if task_id.is_transient() {
                    return;
                }
                let mut ctx = self.execute_context_gc(turbo_tasks);

                // Single access: decide collectibility and, if collectible, capture the edges
                // needed to tear the task down. Reading through the guard
                // (`ctx.task(.., All)`, which restores the task if it was evicted)
                // means `is_gc_collectible`'s Meta reads go through `check_access`,
                // so the "Meta restored" precondition is enforced by the
                // standard guard machinery rather than a hand-rolled `is_restored` check.
                let plan = {
                    let task = ctx.task(task_id, TaskDataCategory::All);
                    if !task.is_gc_collectible() {
                        // Not collectible: keep retrying only while it is still parentless;
                        // otherwise a concurrent re-connect revived it and it is no longer garbage.
                        if task.get_parent_count().copied().unwrap_or(0) == 0 {
                            retain.lock().push(task_id);
                        }
                        return;
                    }
                    GcDeletePlan {
                        children: task.iter_children().collect(),
                        output_deps: task.iter_output_dependencies().collect(),
                        cell_deps: task.iter_cell_dependencies().collect(),
                        cell_deps_hashed: task.iter_cell_dependencies_hashed().collect(),
                        collectibles_deps: task.iter_collectibles_dependencies().collect(),
                        persistent_task_type: task.get_persistent_task_type().cloned(),
                    }
                };

                let deletion = self.gc_remove_task(task_id, &plan, &mut ctx);
                deletions.lock().push(deletion);
                collected.fetch_add(1, Ordering::Relaxed);

                // Fan the (potentially huge) teardown out into bounded chunk jobs so no single
                // worker is pinned by one task's children/deps. `gc_remove_task` already dropped
                // `task_id`'s own guard; the scrub jobs only open the *target* guards, and the plan
                // carries owned edge lists so they don't need `task_id` resident.
                let GcDeletePlan {
                    children,
                    output_deps,
                    cell_deps,
                    cell_deps_hashed,
                    collectibles_deps,
                    persistent_task_type: _,
                } = plan;
                spawn_chunked(spawner, children, GcJob::Decrement);
                spawn_chunked(spawner, output_deps, |targets| GcJob::ScrubOutput {
                    source: task_id,
                    targets,
                });
                spawn_chunked(spawner, cell_deps, |refs| GcJob::ScrubCell {
                    source: task_id,
                    refs,
                });
                spawn_chunked(spawner, cell_deps_hashed, |refs| GcJob::ScrubCellHashed {
                    source: task_id,
                    refs,
                });
                spawn_chunked(spawner, collectibles_deps, |refs| {
                    GcJob::ScrubCollectibles {
                        source: task_id,
                        refs,
                    }
                });
            }
            GcJob::Decrement(children) => {
                let mut ctx = self.execute_context_gc(turbo_tasks);
                for child in children {
                    // Transient children are never collected and carry no persistent parent_count.
                    if child.is_transient() {
                        continue;
                    }
                    let mut child_task = ctx.task(child, TaskDataCategory::Meta);
                    let new_count = child_task.update_and_get_parent_count(-1);
                    drop(child_task);
                    // Exactly one decrementer sees 0 (RMW under the entry lock), so `child` is
                    // spawned as a collect target exactly once.
                    if new_count == 0 {
                        spawner.spawn(GcJob::Collect(child));
                    }
                }
            }
            GcJob::ScrubOutput { source, targets } => {
                let mut ctx = self.execute_context_gc(turbo_tasks);
                for output_task_id in targets {
                    let mut target = ctx.task(output_task_id, TaskDataCategory::Data);
                    target.remove_output_dependent(&source);
                }
            }
            GcJob::ScrubCell { source, refs } => {
                let mut ctx = self.execute_context_gc(turbo_tasks);
                for CellRef {
                    task: cell_task,
                    cell,
                } in refs
                {
                    let mut target = ctx.task(cell_task, TaskDataCategory::Data);
                    target.remove_cell_dependents(&CellRef { task: source, cell });
                }
            }
            GcJob::ScrubCellHashed { source, refs } => {
                let mut ctx = self.execute_context_gc(turbo_tasks);
                for (
                    CellRef {
                        task: cell_task,
                        cell,
                    },
                    key,
                ) in refs
                {
                    let mut target = ctx.task(cell_task, TaskDataCategory::Data);
                    target.remove_cell_dependents_hashed(&(CellRef { task: source, cell }, key));
                }
            }
            GcJob::ScrubCollectibles { source, refs } => {
                let mut ctx = self.execute_context_gc(turbo_tasks);
                for CollectiblesRef {
                    task: dep_task,
                    collectible_type,
                } in refs
                {
                    let mut target = ctx.task(dep_task, TaskDataCategory::Data);
                    target.remove_collectibles_dependents(&(collectible_type, source));
                }
            }
        }
    }

    /// Removes a collectible task from the in-memory task_cache and map and returns its
    /// [`TaskDeletion`] tombstone. The reverse-dep edge scrubbing is done separately by the
    /// `Scrub*` jobs (see [`Self::gc_run_job`]); this only touches `task_id`'s own entries, which
    /// are independent of the target entries the scrubs mutate, so ordering between them is free.
    /// Must be called while holding the GC phase.
    fn gc_remove_task(
        &self,
        task_id: TaskId,
        plan: &GcDeletePlan,
        _ctx: &mut impl ExecuteContext<'_>,
    ) -> TaskDeletion {
        // Remove the in-memory task_cache entry (hash -> id) so lookups don't return a dead id, and
        // compute the persisted TaskCache key so the snapshot can tombstone the on-disk mapping.
        // Only persistent tasks are collected, so a persistent task type is always present.
        let task_type = plan
            .persistent_task_type
            .as_ref()
            .expect("a collected (non-transient) task must have a task type");
        self.storage.task_cache.remove(task_type.as_ref());
        let task_type_hash = compute_task_type_hash(task_type);

        // Remove the task from the map. Its own children set is dropped with it; the child ids were
        // captured into `plan` so the `Decrement` jobs can drop their parent_count.
        self.storage.remove_task(task_id);

        // Tombstoning the on-disk `TaskCache` erases the *whole* hash bucket, so any live task
        // whose type xxh3-collides with this one must be re-inserted. Those survivors are resolved
        // at apply time in `save_snapshot` (which reads the authoritative on-disk bucket) rather
        // than computed here — the in-memory `task_cache` is lazily populated and keyed by the full
        // task type, not the hash, so it can't reliably enumerate hash-siblings. Collisions between
        // two live tasks are astronomically rare, so this survivor path almost never fires.
        TaskDeletion {
            task_id,
            task_type_hash,
        }
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

    /// Runs a full GC pass under the GC phase and returns the number of tasks collected together
    /// with their on-disk tombstones. Pass the tombstones to a subsequent
    /// `snapshot_and_evict_for_testing` to commit them (production runs GC inline in
    /// `snapshot_and_persist` instead). Test-only hook; callers must be idle (no task
    /// executing).
    #[doc(hidden)]
    pub fn gc_for_testing(
        &self,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> (usize, Vec<TaskDeletion>) {
        let _serialize = self.snapshot_in_progress.lock();
        let _gc_phase = self.snapshot_coord.begin_gc();
        self.gc_collect(turbo_tasks)
    }
}
