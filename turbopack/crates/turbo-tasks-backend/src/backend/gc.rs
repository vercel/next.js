//! Garbage collection for the persistent backend.
//!
//! GC removes tasks that have become unreachable from the live task graph (their persistent
//! `parent_count` reached 0) from both memory and the on-disk cache. The pass runs under the
//! coordinator's GC phase (see
//! [`SnapshotCoordinator::begin_gc`](crate::backend::snapshot_coordinator)) — which excludes normal
//! operations — and is driven as a fully parallel, unbounded job pool
//! (see [`TurboTasksBackend::gc_collect`]).
//!
//! This module holds the GC-specific logic (the job types, the pool driver, per-job teardown, and
//! the pin/unpin bookkeeping) as an `impl TurboTasksBackend`; it is a child of the `backend` module
//! so it reaches the backend's private state (`storage`, `snapshot_coord`) and the GC-only
//! `execute_context_gc` directly. Callers (`snapshot_and_persist`, `stop`, the background job loop,
//! the `Backend` trait's `pin_task_for_gc`/`unpin_task_for_gc`) live in `mod.rs`.

use std::{
    ops::ControlFlow,
    sync::atomic::{AtomicBool, AtomicUsize, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use bincode::{Decode, Encode};
use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{TaskId, TurboTasks, scope::scope_unbounded};

use crate::{
    backend::{
        AnyOperation, GC_MIN_PROGRESS, GC_ROOT_TTL, TurboTasksBackend,
        operation::{
            AggregationUpdateQueue, CleanupOldEdgesOperation, ExecuteContext, ExecuteContextImpl,
            TaskGuard, capture_all_outgoing_edges,
        },
        snapshot_coordinator::SnapshotCoordinator,
        storage::{SpecificTaskDataCategory, TaskDataCategory},
        storage_schema::TaskStorageAccessors,
    },
    backing_storage::SnapshotItem,
};

/// How long a GC root has gone without being observed live, as stored in the persisted roots map.
///
/// This replaces a bare "last anchored at" timestamp that every pass had to *rewrite* to assert
/// liveness. Rewriting was both fragile and wasteful:
/// - Restoring a task from disk does not dirty it, so a fully cached session could observe a root
///   live and still persist nothing — the refresh was silently dropped and the root eventually aged
///   out despite being alive in every session.
/// - A fresh timestamp per pass meant the encoded map differed every time, so the write could never
///   be skipped even in perfect steady state.
///
/// [`TtlCounter::MostRecent`] is a *stable* value: a root that stays live re-encodes identically
/// across passes and sessions, so there is nothing to rewrite and the TTL clock simply never
/// starts. The clock starts only when a root stops being live, which is what the TTL is meant to
/// measure.
#[derive(Encode, Decode, Clone, Copy, PartialEq, Eq, Debug)]
pub enum TtlCounter {
    /// Observed live (a durable, anchored root) in the most recent session. Never ages out.
    MostRecent,
    /// The root was not live as of the first GC pass of some session; the value is that pass's
    /// wall-clock millis since the Unix epoch. The TTL runs from here. Re-observing the root
    /// promotes it back to [`Self::MostRecent`].
    ///
    /// If it later proves useful to distinguish "live one session ago" from "live many sessions
    /// ago", `MostRecent` can gain a small generation counter without changing these transitions.
    FirstStale(u64),
}

/// One unit of GC work. Parallelism is *across* jobs (the unbounded pool in
/// [`TurboTasksBackend::gc_collect`] runs many on different workers); each job is internally
/// sequential. Both variants produce more work, which flows straight back into the same pool — so
/// there is no barrier between scanning and collecting, and none between cascade levels.
enum GcJob {
    /// Scan one shard of the resident map (by index) and enqueue its candidates as
    /// [`GcJob::Collect`].
    ///
    /// Seeding the pool with these rather than scanning the whole map up front is what keeps the
    /// scan off the critical path: the first shard's candidates begin tearing down while the last
    /// shard is still being read. The scan is a handful of field reads per resident task, so a
    /// shard job is short relative to a collect.
    ScanShard(usize),
    /// Tear down a single task: scrub its edges, drop its children's `parent_count`, and mark it
    /// soft-deleted. Can discover more work — a child the cleanup drives to `parent_count == 0`
    /// that is itself collectible.
    Collect(TaskId),
}

/// Decides when a GC pass should stop early because it is delaying real work.
///
/// A pass holds total operation exclusion, so every invalidation, cell update, and child connect
/// blocks for its whole duration — in dev, that is an HMR edit waiting behind the cascade. The
/// budget trips once the coordinator reports an operation *newly arrived* and blocked
/// ([`SnapshotCoordinator::operations_waiting`]), but not before `min_progress` has elapsed, so a
/// dev server under sustained edits can't starve GC by interrupting every pass at its first job.
///
/// The "newly arrived" part is load-bearing: operations parked at a `suspend_point` are excluded
/// from that signal, because suspending is how an in-flight operation *lets* the pass begin. Were
/// they counted, a pass would see a waiter the instant it started and interrupt itself at job zero
/// whenever any operation happened to be mid-flight.
///
/// Shared by reference across all pool jobs (`scope_unbounded`'s closure is `Fn + Send + Sync`), so
/// the state is atomic.
struct GcBudget<'a> {
    coord: &'a SnapshotCoordinator<AnyOperation>,
    started: Instant,
    min_progress: Duration,
    /// Latched on the first trip. Re-polling per job would let a waiter that arrives and leaves
    /// produce a ragged pass that stops and starts; once we have decided to wind down, we commit.
    /// Also reports whether the pass was interrupted, for [`GcStats`].
    stopped: AtomicBool,
}

impl GcBudget<'_> {
    /// Whether this pass should stop taking new work. Called at the top of every job, so the
    /// common (non-interrupted) path must stay cheap: after the latch it is one relaxed load, and
    /// before the floor elapses it is a load plus an `Instant::elapsed`.
    fn should_stop(&self) -> bool {
        if self.stopped.load(Ordering::Relaxed) {
            return true;
        }
        if self.started.elapsed() < self.min_progress {
            return false;
        }
        if !self.coord.operations_waiting() {
            return false;
        }
        self.stopped.store(true, Ordering::Relaxed);
        true
    }

    fn was_interrupted(&self) -> bool {
        self.stopped.load(Ordering::Relaxed)
    }
}

/// Observability counters for one [`TurboTasksBackend::gc_collect`] pass.
pub(crate) struct GcStats {
    /// Total number of gc roots
    pub gc_roots: usize,
    /// Tasks collected (marked soft-deleted).
    pub collected: usize,
    /// Edges torn down across all collected tasks (children + forward-dependency reverse edges).
    pub edges_deleted: usize,
    /// Cross-session roots that aged out past the TTL and seeded collection this pass (a subset of
    /// the seeds — the resident scan supplies the rest). Recorded on the `gc` span so the e2e
    /// dogfood can confirm a deleted route's subtree is reclaimed on a *later* session rather than
    /// in-session.
    pub aged_out_roots: usize,
    /// Whether the pass wound down early because an operation was waiting on the exclusion (see
    /// [`GcBudget`]). An interrupted pass is not an error — the work it skipped is re-derived by
    /// the next pass — but a dev session where this is always true means GC is never finishing and
    /// the floor may need raising.
    pub interrupted: bool,
    /// Jobs dropped by the interrupt: queued work the pass chose not to start. Distinct from jobs
    /// skipped because the task was no longer collectible, which is ordinary concurrent
    /// re-validation rather than lost progress.
    pub abandoned: usize,
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
    /// The pass is fully parallel and unbounded via [`scope_unbounded`]: work is a pool of
    /// [`GcJob`]s — scan a shard, or collect a task — and both kinds spawn more (a shard yields its
    /// candidates; collecting a task yields any child driven to `parent_count == 0` that is itself
    /// collectible). **There are no synchronization barriers anywhere in the pass**: not between
    /// the scan and the cascade, and not between "levels" of the cascade. Discovered work flows
    /// straight back into the pool, so the first shard's garbage is being torn down while the
    /// last shard is still being read.
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
    ///   has since regained an anchor). That re-check is what makes the scan's lock-free pre-filter
    ///   safe to act on late.
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
    /// `scope_unbounded` runs jobs on the runtime worker threads plus the calling thread, which
    /// drains the whole (growing) pool itself if no helper is scheduled — so this does not depend
    /// on free worker threads (robust on thread-limited runtimes). GC runs from a synchronous
    /// backend context (like `connect_children`, which also fans out onto the scope machinery).
    ///
    /// Returns [`GcStats`] for the pass. The on-disk tombstones are not produced here — collected
    /// tasks are left resident with their `deleted` flag set, and the next snapshot derives the
    /// tombstones from that flag (see `snapshot_and_persist`).
    /// Runs a GC pass and returns its stats plus the reconciled GC roots map (task ->
    /// [`TtlCounter`]) to persist in the same snapshot commit, or `None` when the set is unchanged
    /// and the write can be skipped. The roots map is loaded from disk at the start of the pass and
    /// lives only for its duration — it's per-pass state, not backend state, so nothing is held
    /// resident between passes (and a backend that never GCs never reads it).
    pub(crate) fn gc_collect(
        &self,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> (GcStats, Option<Vec<(TaskId, TtlCounter)>>) {
        // A single wall-clock reading for the whole pass: every root touched here (scan-time
        // resident roots, refreshed roots, and cascade-discovered roots) is stamped with the *same*
        // `now`, so within one pass all timestamps are consistent (and it's one syscall, not
        // three).
        let now = Self::now_ms();

        // Load the previous session's roots map (task id -> `TtlCounter`; empty on a fresh or
        // non-persistent database). Maintained locally through this pass and returned for
        // persistence.
        let mut roots = self
            .backing_storage
            .roots()
            .unwrap_or_else(|err| {
                // A corrupt/unreadable roots key shouldn't abort GC — treat it as empty and let the
                // scan below re-discover the resident roots. Cross-session orphans of a genuinely
                // unreadable set are collected once their (re-discovered) roots age out.
                tracing::warn!("failed to read GC roots, treating as empty: {err:?}");
                Vec::new()
            })
            .into_iter()
            .collect::<FxHashMap<TaskId, TtlCounter>>();
        // Snapshot of what is on disk, so the pass can skip rewriting an unchanged set. Cheap
        // because `TtlCounter::MostRecent` is stable: a steady-state session produces an identical
        // map, unlike the old "stamp `now` on every live root" scheme, which differed every pass.
        //
        // Safe under the degraded read above: an unreadable key leaves this empty, so anything the
        // pass rediscovers compares as *changed* and gets written, repairing the key rather than
        // skipping past it.
        let roots_before = roots.clone();

        // Seed the pool with the resident-map scan, split one job per shard. Each shard job applies
        // the cheap `gc_maybe_collectible` pre-filter (a handful of field reads per task under a
        // shard read lock — the same shape as the eviction scan, which proved this is fast) and
        // feeds its hits back as `Collect` jobs, so the cascade starts before the scan finishes.
        //
        // We scan rather than maintain an incremental candidate set: correctness derives entirely
        // from each task's durable `parent_count`, so there's nothing to persist across sessions
        // and nothing to keep in sync (a scan can't miss a task the way a hand-maintained side-set
        // could). `Collect` re-validates each candidate authoritatively under a guard. The scan
        // only sees resident tasks; disk-only garbage is collected after it is next
        // restored.
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
        let seeds: Vec<GcJob> = (0..self.storage.shard_count())
            .map(GcJob::ScanShard)
            .collect();

        // Reconcile the carried-forward roots map and decide which roots have aged out (un-anchored
        // past the TTL) and should be collected. This runs *before* the pool, but it does not need
        // the shard scan's `resident_roots`: the retain classifies each carried-forward entry with
        // the same `gc_is_root` predicate the scan uses, so a resident still-root is refreshed here
        // regardless. Roots the scan newly discovers are folded into the map after the pool drains,
        // which is what keeps the scan off the critical path.
        // Only the first pass of a session may demote a live root to `FirstStale`; see that
        // function's doc. `swap` so exactly one pass observes `true`, whichever runs first.
        let first_pass_of_session = self.first_gc_pass_of_session.swap(false, Ordering::Relaxed);
        let aged_out = self.gc_roots_refresh_and_age_out(&mut roots, now, first_pass_of_session);

        // Aged-out roots are candidates for collection, but — unlike the pre-filtered resident
        // candidates the scan produces — they are not guaranteed collectible: one may have been
        // re-anchored, may still hold aggregation edges, or (once restored) may prove to have a
        // live child. Re-validate each under a guard (restoring a non-resident root's Meta)
        // and only seed the genuinely collectible ones; a non-collectible aged-out root is
        // simply left un-collected this pass. Its entry **stays in the roots map** (the
        // refresh above keeps every entry, and only an actual collect removes one below),
        // so it is re-seeded next pass rather than being silently forgotten.
        //
        // The set also drives observability: the collect-site trace below tags seeds that came from
        // an aged-out cross-session root (as opposed to the resident scan), so the e2e dogfood can
        // confirm a deleted route's subtree is reclaimed on a *later* session rather than
        // in-session.
        let mut aged_out_seeds = FxHashSet::default();
        {
            let mut ctx = self.execute_context_gc(turbo_tasks);
            // Bulk-fetch the aged-out roots' Meta in one batched restore rather than a `task` call
            // (and per-task disk restore) each. `is_gc_collectible` only reads Meta fields.
            ctx.for_each_task_meta(aged_out, "gc aged-out root revalidation", |task, _ctx| {
                if task.is_gc_collectible() {
                    aged_out_seeds.insert(task.id());
                }
            });
        }

        // Newly-orphaned tasks discovered as the cascade decrements children to `parent_count == 0`
        // but that are NOT collected this pass (e.g. still anchored by a pin) — they are new
        // durable roots and must enter the map with a fresh timestamp, or they'd never be
        // tracked/aged.
        let discovered_roots = Mutex::new(Vec::<TaskId>::new());

        // Tasks this pass actually marked deleted. `gc_roots_refresh_and_age_out` deliberately
        // leaves every entry in `roots` (it only *seeds* aged-out roots), so this is what tells us
        // which entries may now be dropped from the persisted map. Recorded at the `set_deleted`
        // site below, i.e. only for tasks that really were collected — a seed that was re-validated
        // non-collectible, or never reached, stays in the map and ages again next pass.
        //
        // Only collected *roots* can matter here (a non-root collect was never in the map), but
        // recording every collect and intersecting at the end is cheaper than checking map
        // membership under the pass's shared lock on the hot path.
        let collected_ids = Mutex::new(Vec::<TaskId>::new());

        // Roots discovered by the shard scans, folded into the map after the pool drains.
        let scanned_roots = Mutex::new(Vec::<TaskId>::new());

        // Written once per collected task (not per child/dep), so the atomics are not a hot path.
        let collected = AtomicUsize::new(0);
        let edges_deleted = AtomicUsize::new(0);
        // Jobs the interrupt dropped rather than started.
        let abandoned = AtomicUsize::new(0);

        let budget = GcBudget {
            coord: &self.snapshot_coord,
            started: Instant::now(),
            min_progress: self.gc_min_progress(),
            stopped: AtomicBool::new(false),
        };

        // Each job builds its own GC `ExecuteContext`; see the doc above for the concurrency
        // argument. A job may spawn follow-up jobs (a shard's candidates, or children driven to
        // `parent_count == 0`) that flow straight back into the same pool. The aged-out seeds ride
        // in as `Collect` jobs alongside the per-shard scans.
        let seeds = seeds
            .into_iter()
            .chain(aged_out_seeds.iter().copied().map(GcJob::Collect));
        scope_unbounded(seeds, |spawner, job| {
            // The **only** interrupt point: at job entry, before any mutation. Everything past
            // here runs to completion, which is what makes a partial pass safe to hand to
            // `into_snapshot` — every task we marked deleted also had its edges torn down and its
            // children's `parent_count` decremented, so the graph the snapshot sees is consistent.
            // Never check the budget between `set_deleted` and `CleanupOldEdges`.
            //
            // `Break` clears the remaining queue in one shot rather than dispatching each abandoned
            // job just to return, and stops in-flight jobs from re-growing it as they finish.
            if budget.should_stop() {
                abandoned.fetch_add(1, Ordering::Relaxed);
                return ControlFlow::Break(());
            }
            let task_id = match job {
                GcJob::ScanShard(index) => {
                    // Enqueue under the shard read lock — `spawn` is just an accounting bump plus a
                    // queue push, which is what `gc_scan_shard` requires of its callback.
                    let roots = self
                        .storage
                        .gc_scan_shard(index, |task_id| spawner.spawn(GcJob::Collect(task_id)));
                    if !roots.is_empty() {
                        scanned_roots.lock().extend(roots);
                    }
                    return ControlFlow::Continue(());
                }
                GcJob::Collect(task_id) => task_id,
            };
            let mut ctx = self.execute_context_gc(turbo_tasks);
            // `All` restores Data so the edge capture below can read the Data-category dep sets.
            // The target is resident either way: a scan candidate was read out of the resident map,
            // and a cascade child was just decremented through its resident entry.
            let mut task = ctx.task(task_id, TaskDataCategory::All);
            // Collectibility was checked when this job was seeded (the shard scan's
            // `gc_maybe_collectible` pre-filter, the aged-out revalidation, or the cascade's
            // per-child `is_gc_collectible` at spawn), but jobs run **concurrently** under
            // `scope_unbounded`: in between, a sibling job's cascade can have collected this very
            // task (it is then `deleted`) or flipped it non-collectible (regain
            // `activeness`/`in_progress`, gain an aggregation edge, or — critically — pick up a new
            // anchor). Re-check under the guard we now hold and skip rather than delete; a task
            // that is still genuinely garbage is re-selected by a later pass, so
            // bailing here is safe and self-healing. (Deleting unconditionally would
            // wrongly collect a task that just regained an anchor, or double-run the
            // edge teardown on one already collected.)
            if !task.is_gc_collectible() {
                return ControlFlow::Continue(());
            }

            // Mark the task soft-deleted on the guard we already hold (order relative to the
            // `CleanupOldEdges` run below doesn't matter — `deleted` only affects
            // snapshot/eviction/collectibility, none of which the cleanup consults for `task_id`
            // itself). Rather than remove the task now (a later `ctx.task` on it would resurrect it
            // from disk as a zombie), keep it resident: a later step hard-deletes it.
            task.set_deleted(true);
            if task.new_task() {
                // Never persisted: there is nothing on disk to tombstone, so drop it out of the
                // next snapshot's scan entirely (clearing its modified bits + shard count).
                // Eviction still removes the resident, soft-`deleted` task.
                task.discard_modifications_for_gc_new_task();
            } else {
                // Persisted: force the task into the next snapshot's scan so `process` tombstones
                // its on-disk copy. `deleted` is transient (never persisted), so setting it tracks
                // nothing — explicitly track a meta modification. This matters even in the
                // collectible states that otherwise leave meta clean (e.g. a pinned parentless task
                // then unpinned, or one restored parentless from a prior session).
                let _ = task.track_modification(SpecificTaskDataCategory::Meta, "gc_deleted");
            }
            collected.fetch_add(1, Ordering::Relaxed);
            // Record the collect so the roots map can drop this entry (if it had one) after the
            // pass. Touched once per collected task, not per child/dep, so the lock is not a
            // contention hot spot — same argument as `discovered_roots`.
            collected_ids.lock().push(task_id);
            // A span (not a free-standing event) so the collect shows up as a node in the trace
            // tree under the `gc` span — the trace server / `next internal trace` MCP surface
            // spans, and free events attached to no span are not queryable there.
            // `cross_session_root` tags collects seeded from an aged-out root (the
            // deleted-route path) vs the resident scan.
            let _collect_span = tracing::info_span!(
                "gc collect task",
                task = %task_id,
                cross_session_root = aged_out_seeds.contains(&task_id),
            )
            .entered();

            // Capture all of this task's edges and hand them to the same `CleanupOldEdges`
            // operation a re-executing task uses. Besides dropping each child's `parent_count` and
            // scrubbing forward-dep reverse edges, this propagates the aggregation rebalance
            // (removing this task from its children's `upper` sets) — without it, collected
            // children would keep a dangling upper edge and never become collectible. The op opens
            // `ctx.task(task_id)`, so it must run while `task_id` is still resident.
            let old_edges = capture_all_outgoing_edges(&task);
            drop(task);

            edges_deleted.fetch_add(old_edges.len(), Ordering::Relaxed);
            CleanupOldEdgesOperation::run(
                task_id,
                old_edges,
                AggregationUpdateQueue::new(),
                &mut ctx,
            );

            // `CleanupOldEdges` recorded every child whose persistent `parent_count` reached 0.
            // Re-check collectibility under each child's guard (count 0 alone isn't enough — it
            // could be pinned, a root, or still hold aggregation edges) and spawn a job for the
            // collectible ones. Each child reaches 0 exactly once, so there is no double-queueing.
            // `Meta` suffices — `is_gc_collectible` reads only Meta fields — and a child that turns
            // out collectible re-opens with `All` in its own `Collect` job (restore is cached), so
            // fetching `All` here would only waste a Data restore on the non-collectible children.
            for child in ctx.take_gc_parent_count_zeroed() {
                debug_assert!(
                    !child.is_transient(),
                    "gc: a transient task should never have a persistent parent_count to zero"
                );
                // The child had its `parent_count` decremented during this task's cleanup, so it is
                // resident.
                if ctx.task(child, TaskDataCategory::Meta).is_gc_collectible() {
                    spawner.spawn(GcJob::Collect(child));
                } else {
                    // Dropped to `parent_count == 0` but not collectible — it's still anchored (a
                    // pin / transient parent) or holds aggregation edges.
                    // Either way it just became a durable root; record it so it
                    // enters the roots map with a fresh timestamp and
                    // starts aging. (The shard scan may not have caught this newly-orphaned child:
                    // its shard may already have been scanned before this cascade ran.)
                    discovered_roots.lock().push(child);
                }
            }
            ControlFlow::Continue(())
        });

        // Fold in the roots the shard scans found, plus those the cascade discovered
        // (orphaned-but-not-collected children — anchored, so they just became durable roots).
        // Deferred to here rather than passed into `gc_roots_refresh_and_age_out` so the scan never
        // blocks the cascade.
        //
        // Both sets were observed **live during this pass**, so both `insert` `MostRecent`
        // unconditionally rather than `or_insert`.
        //
        // Today the two are equivalent: the `retain` above ran first over the carried-forward map
        // using the *same* `gc_is_root` predicate on the same storage under the same exclusion, so
        // any id the scan reports as anchored was already promoted there, and ids not in the map
        // have no entry for `or_insert` to preserve. `insert` is still what we want — it states
        // "this root was observed live" directly instead of silently depending on that coincidence,
        // so it stays correct if the retain is ever narrowed or the scan learns to report roots the
        // retain skipped.
        {
            let map: &mut FxHashMap<TaskId, TtlCounter> = &mut roots;
            for id in scanned_roots.into_inner() {
                map.insert(id, TtlCounter::MostRecent);
            }
            for id in discovered_roots.into_inner() {
                map.insert(id, TtlCounter::MostRecent);
            }
        };

        // Now drop the entries for tasks this pass actually collected.
        // `gc_roots_refresh_and_age_out` kept every entry (it only seeds aged-out roots),
        // so this is the *only* place a root leaves the map — which is what keeps the
        // persisted set from losing a root that was seeded but not collected. A collected
        // task is gone from the graph, so its entry would otherwise be a permanent stale
        // key in the roots set.
        //
        // Runs after the fold-ins so the two can't fight over an id. They are in fact disjoint (a
        // cascade child is recorded as *either* spawned-and-collected *or* a discovered root, and a
        // collected task fails `gc_is_root` so the scan won't report it), but ordering it this way
        // means a collect always wins, which is the safe direction: the task no longer exists.
        {
            let map: &mut FxHashMap<TaskId, TtlCounter> = &mut roots;
            for id in collected_ids.into_inner() {
                map.remove(&id);
            }
        };

        let stats = GcStats {
            gc_roots: roots.len(),
            collected: collected.into_inner(),
            edges_deleted: edges_deleted.into_inner(),
            aged_out_roots: aged_out_seeds.len(),
            interrupted: budget.was_interrupted(),
            abandoned: abandoned.into_inner(),
        };

        // Skip the write when nothing about the root set changed. This is only worth doing because
        // `MostRecent` is stable: under the old scheme every live root was stamped with a fresh
        // `now` each pass, so the map always differed and the write was unskippable. Now the steady
        // state — same roots, all still live — compares equal and leaves the `GcRoots` key
        // untouched. Comparing two small in-memory maps is far cheaper than the encode + write it
        // avoids.
        let roots_to_persist = (roots != roots_before).then(|| roots.into_iter().collect());
        (stats, roots_to_persist)
    }

    /// The GC root TTL for this pass. Precedence: the per-backend test override
    /// (`set_gc_root_ttl_for_testing`, race-free across parallel tests) → the
    /// `TURBO_ENGINE_GC_ROOT_TTL_MS` env (for the e2e dogfood, where a process-global is fine) →
    /// [`GC_ROOT_TTL`]. Read each call — GC runs rarely, so this is negligible.
    fn gc_root_ttl(&self) -> Duration {
        let override_ms = self.gc_root_ttl_override_ms.load(Ordering::Relaxed);
        if override_ms != u64::MAX {
            return Duration::from_millis(override_ms);
        }
        match std::env::var("TURBO_ENGINE_GC_ROOT_TTL_MS") {
            Ok(v) => match v.parse::<u64>() {
                Ok(ms) => Duration::from_millis(ms),
                Err(_) => GC_ROOT_TTL,
            },
            Err(_) => GC_ROOT_TTL,
        }
    }

    /// The min-progress floor for this pass — how long GC runs before it will honour an interrupt.
    /// Same precedence chain as [`Self::gc_root_ttl`]: the per-backend test override
    /// (`set_gc_min_progress_for_testing`, race-free across parallel tests) → the
    /// `TURBO_ENGINE_GC_MIN_PROGRESS_MS` env → [`GC_MIN_PROGRESS`].
    fn gc_min_progress(&self) -> Duration {
        let override_ms = self.gc_min_progress_override_ms.load(Ordering::Relaxed);
        if override_ms != u64::MAX {
            return Duration::from_millis(override_ms);
        }
        match std::env::var("TURBO_ENGINE_GC_MIN_PROGRESS_MS") {
            Ok(v) => match v.parse::<u64>() {
                Ok(ms) => Duration::from_millis(ms),
                Err(_) => GC_MIN_PROGRESS,
            },
            Err(_) => GC_MIN_PROGRESS,
        }
    }

    /// Wall-clock now as millis since the Unix epoch (saturating to 0 before the epoch, which can't
    /// happen in practice). This is the backend layer, not a task-execution context, so
    /// `SystemTime` is fine here (same as `snapshot_and_persist`).
    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    /// Reconcile the carried-forward GC roots map, and return the ids of roots that have aged out
    /// (gone un-anchored past the TTL) to seed collection.
    ///
    /// This only reclassifies entries already in the map; it deliberately does **not** take the
    /// shard scan's freshly-discovered roots. It runs before the job pool, and making it wait for a
    /// complete scan would put the scan back on the critical path — the thing interleaving exists
    /// to avoid. It doesn't need them: the retain classifies each entry with the *same*
    /// `gc_is_root` predicate the scan uses, so a resident still-root is refreshed here regardless
    /// of whether the scan has reached its shard yet. `gc_collect` folds the scan's roots in with
    /// `or_insert` after the pool drains, which only *adds* roots new to the map this session and
    /// leaves the timestamps this retain refreshed alone.
    ///
    /// Each carried-forward entry is classified **without restoring** it (a non-inserting
    /// `with_task`), which is both correct and the point — the roots we most want to age out are
    /// the non-resident ones, and we must not pull them back into memory just to look:
    /// - **resident and still a root** ([`TaskStorage::gc_is_root`]: `parent_count == 0 &&
    ///   transient_ref_count > 0`) → [`TtlCounter::MostRecent`]. Using the *full* `gc_is_root`
    ///   predicate — not just `transient_ref_count > 0` — is what stops a resident task that
    ///   regained a persistent parent from being kept live forever as a stale "root" (it fails
    ///   `gc_is_root`, so it goes stale and eventually ages out).
    /// - **resident but no longer a root**, or **not resident** → not live: a non-resident task
    ///   holds no `transient_ref_count` (transient state is in-memory only) and was not re-anchored
    ///   this session (re-anchoring restores it), so it is correctly treated as orphaned. A
    ///   `MostRecent` entry becomes [`TtlCounter::FirstStale`]`(now)` — but **only when
    ///   `first_pass_of_session`**, since a single pass missing a root does not mean the session
    ///   did. An already-stale entry keeps its timestamp, and once `now - since > TTL` it is
    ///   returned as a collection seed (the aged-out path in `gc_collect` restores + re-validates
    ///   it before collecting).
    ///
    /// **The map is monotone: this function never removes an entry.** An aged-out root is only
    /// *seeded*; `gc_collect` removes it from the map after the collect job actually marked it
    /// deleted. Removing it here instead would leak: the returned map is persisted as a whole-key
    /// rewrite of the roots set, and a seed that is not collected (re-validated non-collectible, or
    /// — once GC is interruptible — never reached) would be gone from the map while still existing
    /// on disk. Nothing would ever re-add it: the resident scan only admits `gc_is_root` tasks
    /// (`transient_ref_count > 0`), which an aged-out root by definition fails, and a **disk-only**
    /// task isn't scanned at all. It would become unreachable from every GC enumeration path —
    /// permanently untracked garbage.
    ///
    /// Using `gc_is_root` here — the same predicate the scan admits roots with — keeps membership
    /// and refresh from drifting. Runs under the GC phase (exclusion), so the counts don't race
    /// pins.
    fn gc_roots_refresh_and_age_out(
        &self,
        map: &mut FxHashMap<TaskId, TtlCounter>,
        now: u64,
        first_pass_of_session: bool,
    ) -> Vec<TaskId> {
        let ttl_ms = self.gc_root_ttl().as_millis() as u64;

        // Reconcile the carried-forward map (prior-session entries) first. Every entry is
        // re-classified by the *same* `gc_is_root` predicate the scan uses, so a resident root that
        // is still a root is promoted here — we don't need `resident_roots` to touch it.
        let mut aged_out = Vec::new();
        map.retain(|&id, counter| {
            // Non-inserting: a non-resident root reads as `None` → not live (which is what we want;
            // we don't restore disk-only orphans just to check them). A resident task is a
            // still-live root only if it passes the full `gc_is_root` (parent_count 0 AND
            // anchored), so a re-parented resident task fails here.
            match self
                .storage
                .with_task(id, |t| (t.gc_is_root(), t.gc_is_deleted()))
            {
                // Already collected (soft-deleted, resident until the tombstone commit + hard
                // delete). It is not a root any more and there is nothing left to collect, so drop
                // the entry outright rather than letting it fall through to the stale branch —
                // which would re-seed it every pass forever (the revalidation always rejects a
                // deleted task) and keep a dead id in the persisted set. This is the one case where
                // an entry leaves the map *here* rather than via the collected-ids removal in
                // `gc_collect`: that removal only sees tasks **this** pass collected, and a task
                // collected by an earlier pass in the same session is still resident when the next
                // pass reads the map.
                Some((_, true)) => return false,
                // Live: (re)assert `MostRecent`. Unconditional, so this both keeps a live root live
                // and *promotes* one that had started aging — a root re-requested after a stale
                // session gets its clock cleared, not merely paused. Writing the same value for an
                // already-`MostRecent` root is what makes a steady-state map byte-identical.
                Some((true, false)) => {
                    *counter = TtlCounter::MostRecent;
                    return true;
                }
                // Resident but no longer a root, or not resident at all: fall through.
                Some((false, false)) | None => {}
            }
            match *counter {
                // Not live, and the previous session had it live. Start the clock — but only on the
                // **first pass of this session**. GC runs on the snapshot cadence (many passes per
                // session), and a live root can easily be missed by any single pass: it may be
                // evicted, or simply not yet re-requested. Demoting on every pass would make the
                // TTL measure idleness within a session rather than "was not live in a session",
                // which is the property we actually want.
                TtlCounter::MostRecent => {
                    if first_pass_of_session {
                        *counter = TtlCounter::FirstStale(now);
                    }
                }
                // Already stale: leave the timestamp alone so the clock keeps running from when it
                // first went stale, and seed it for collection once it is past the TTL.
                // `now < since` (clock skew across sessions) is treated as not-yet-aged
                // (saturating), never negative.
                TtlCounter::FirstStale(since) => {
                    if now.saturating_sub(since) > ttl_ms {
                        aged_out.push(id);
                    }
                }
            }
            // Keep the entry either way — see the "monotone map" note in the doc comment. An
            // aged-out root is only *seeded* for collection here; the entry is removed by
            // `gc_collect` after the task is actually marked deleted.
            true
        });

        aged_out
    }

    /// Body of [`Backend::pin_task_for_gc`](turbo_tasks::backend::Backend::pin_task_for_gc); the
    /// trait method in `mod.rs` delegates here. See the inline comments for the exclusion and
    /// non-resurrection reasoning.
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
        // parent's edge: bump `transient_ref_count`, which keeps the task uncollectible and
        // unevictable while > 0. Counting (not a bool) balances each pin against its own unpin.
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
    /// soft-deleted). The tombstones are derived by a subsequent snapshot from the `deleted` flag,
    /// so — unlike before — nothing needs to be threaded to `snapshot_and_evict_for_testing`
    /// (production runs GC inline in `snapshot_and_persist`). Test-only hook; callers must be idle
    /// (no task executing).
    ///
    /// **The pass is uninterruptible**, matching this hook's contract of a *full* pass: tests
    /// assert exact collected counts (that a whole subtree is reclaimed together — see
    /// `gc_shared_forward_dep_no_resurrection`), which a pass that could wind down early would make
    /// flaky. Tests that specifically want to observe an interrupt drive it through
    /// `snapshot_and_evict_for_testing` with `set_gc_min_progress_for_testing(0)`.
    #[doc(hidden)]
    pub fn gc_for_testing(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> usize {
        let _serialize = self.snapshot_in_progress.lock();
        let _gc_phase = self.snapshot_coord.begin_gc();
        // Save/restore rather than set-and-leave: the caller may run further passes and expect its
        // own override (e.g. a TTL test) to still apply.
        let prev = self.gc_min_progress_override_ms.load(Ordering::Relaxed);
        // Far beyond any real pass, so `should_stop`'s floor check never elapses.
        self.gc_min_progress_override_ms
            .store(u64::MAX / 2, Ordering::Relaxed);
        let (stats, roots) = self.gc_collect(turbo_tasks);
        self.gc_min_progress_override_ms
            .store(prev, Ordering::Relaxed);

        // Persist the roots map this pass produced. Production does it via the `into_snapshot`
        // handoff; this hook has no snapshot, so without an explicit write the pass's roots work
        // would be computed and thrown away. That matters because the pass also *consumed* the
        // session's one demotion opportunity (`first_gc_pass_of_session`): dropping the result
        // would leave a root that went stale this session still marked `MostRecent`, and no later
        // pass in this session would demote it again.
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
