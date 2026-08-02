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
    sync::atomic::{AtomicUsize, Ordering},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use parking_lot::Mutex;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_tasks::{TaskId, TurboTasks, scope::scope_unbounded};

use crate::backend::{
    GC_ROOT_TTL, TurboTasksBackend,
    operation::{
        AggregationUpdateQueue, CleanupOldEdgesOperation, ExecuteContext, ExecuteContextImpl,
        TaskGuard, capture_all_outgoing_edges,
    },
    storage::{SpecificTaskDataCategory, TaskDataCategory},
    storage_schema::TaskStorageAccessors,
};

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
    /// last-anchored-ms) to persist in the same snapshot commit. The roots map is loaded from disk
    /// at the start of the pass and lives only for its duration — it's per-pass state, not backend
    /// state, so nothing is held resident between passes (and a backend that never GCs never reads
    /// it).
    pub(crate) fn gc_collect(
        &self,
        turbo_tasks: &TurboTasks<TurboTasksBackend>,
    ) -> (GcStats, Vec<(TaskId, u64)>) {
        // A single wall-clock reading for the whole pass: every root touched here (scan-time
        // resident roots, refreshed roots, and cascade-discovered roots) is stamped with the *same*
        // `now`, so within one pass all timestamps are consistent (and it's one syscall, not
        // three).
        let now = Self::now_ms();

        // Load the previous session's roots map (task id -> last-anchored millis; empty on a fresh
        // or non-persistent database). Maintained locally through this pass and returned
        // for persistence.
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
            .collect::<FxHashMap<TaskId, u64>>();

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
        let aged_out = self.gc_roots_refresh_and_age_out(&mut roots, Vec::new(), now);

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
        let collected_ids = Mutex::new(Vec::<TaskId>::new());

        // Roots discovered by the shard scans, folded into the map after the pool drains.
        let scanned_roots = Mutex::new(Vec::<TaskId>::new());

        // Written once per collected task (not per child/dep), so the atomics are not a hot path.
        let collected = AtomicUsize::new(0);
        let edges_deleted = AtomicUsize::new(0);

        // Each job builds its own GC `ExecuteContext`; see the doc above for the concurrency
        // argument. A job may spawn follow-up jobs (a shard's candidates, or children driven to
        // `parent_count == 0`) that flow straight back into the same pool. The aged-out seeds ride
        // in as `Collect` jobs alongside the per-shard scans.
        let seeds = seeds
            .into_iter()
            .chain(aged_out_seeds.iter().copied().map(GcJob::Collect));
        scope_unbounded(seeds, |spawner, job| {
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

        // Fold in the roots the shard scans found. Deferred to here (rather than passed into
        // `gc_roots_refresh_and_age_out`) so the scan never blocks the cascade: `or_insert` leaves
        // an already-tracked root's refreshed timestamp alone and only adds roots new to the map
        // this session.
        //
        // Then fold in roots discovered during the cascade (orphaned-but-not-collected children),
        // same rule: new to the map → `now`; already tracked → keep the existing timestamp, since a
        // cascade re-orphaning doesn't reset an already-running clock.
        {
            let map: &mut FxHashMap<TaskId, u64> = &mut roots;
            for id in scanned_roots.into_inner() {
                map.entry(id).or_insert(now);
            }
            for id in discovered_roots.into_inner() {
                map.entry(id).or_insert(now);
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
            let map: &mut FxHashMap<TaskId, u64> = &mut roots;
            for id in collected_ids.into_inner() {
                map.remove(&id);
            }
        };

        let stats = GcStats {
            gc_roots: roots.len(),
            collected: collected.into_inner(),
            edges_deleted: edges_deleted.into_inner(),
            aged_out_roots: aged_out_seeds.len(),
        };
        (stats, roots.into_iter().collect())
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

    /// Wall-clock now as millis since the Unix epoch (saturating to 0 before the epoch, which can't
    /// happen in practice). This is the backend layer, not a task-execution context, so
    /// `SystemTime` is fine here (same as `snapshot_and_persist`).
    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    /// Reconcile the GC roots map against this pass's freshly-scanned resident roots, and return
    /// the ids of roots that have aged out (gone un-anchored past the TTL) to seed collection.
    ///
    /// Order matters: the carried-forward map is reconciled by the `retain` **first**, then the
    /// freshly-scanned `resident_roots` are `or_insert`ed. So a resident root already tracked is
    /// refreshed once by the retain (the scan and retain share the `gc_is_root` predicate), and the
    /// insert only *adds* roots new to the map this session — no entry is stamped twice.
    ///
    /// Each carried-forward entry is classified **without restoring** it (a non-inserting
    /// `with_task`), which is both correct and the point — the roots we most want to age out are
    /// the non-resident ones, and we must not pull them back into memory just to look:
    /// - **resident and still a root** ([`TaskStorage::gc_is_root`]: `parent_count == 0 &&
    ///   transient_ref_count > 0`) → refresh `last_anchored_ms = now`. Using the *full*
    ///   `gc_is_root` predicate — not just `transient_ref_count > 0` — is what stops a resident
    ///   task that regained a persistent parent from being refreshed forever as a stale "root" (it
    ///   fails `gc_is_root`, so it ages out and is dropped).
    /// - **resident but no longer a root**, or **not resident** → un-anchored: a non-resident task
    ///   holds no `transient_ref_count` (transient state is in-memory only) and was not re-anchored
    ///   this session (re-anchoring restores it), so it is correctly treated as orphaned. Keep its
    ///   timestamp; if `now - last_anchored_ms > TTL`, drop from the map and return it as a
    ///   collection seed (the aged-out path in `gc_collect` restores + re-validates it before
    ///   collecting).
    ///
    /// Using `gc_is_root` here — the same predicate the scan admits roots with — keeps membership
    /// and refresh from drifting. Runs under the GC phase (exclusion), so the counts don't race
    /// pins.
    fn gc_roots_refresh_and_age_out(
        &self,
        map: &mut FxHashMap<TaskId, u64>,
        resident_roots: Vec<TaskId>,
        now: u64,
    ) -> Vec<TaskId> {
        let ttl_ms = self.gc_root_ttl().as_millis() as u64;

        // Reconcile the carried-forward map (prior-session entries) first. Every entry is
        // re-classified by the *same* `gc_is_root` predicate the scan uses, so a resident root that
        // is still a root is refreshed here — we don't need `resident_roots` to touch it.
        let mut aged_out = Vec::new();
        map.retain(|&id, last_anchored| {
            // Non-inserting: a non-resident root reads as `None` → un-anchored → ages (which is
            // what we want; we don't restore disk-only orphans just to check them). A
            // resident task is a still-live root only if it passes the full
            // `gc_is_root` (parent_count 0 AND anchored), so a re-parented resident
            // task fails here and ages out of the map.
            let still_root = self
                .storage
                .with_task(id, |t| t.gc_is_root())
                .unwrap_or(false);
            if still_root {
                *last_anchored = now;
                return true;
            }
            // Un-anchored: has it aged past the TTL? `now < last_anchored` (clock skew across
            // sessions) is treated as not-yet-aged (saturating), never negative.
            if now.saturating_sub(*last_anchored) > ttl_ms {
                aged_out.push(id);
                false
            } else {
                true
            }
        });

        // Now fold in this pass's resident roots. `or_insert` (not `insert`) so that a root already
        // carried forward keeps the timestamp the retain just refreshed — this only *adds* roots
        // new to the map this session, stamped `now`. (A resident root already in the map was
        // handled by the retain above, since the scan and the retain share the `gc_is_root`
        // predicate; doing this after the retain avoids touching those entries twice.)
        for id in resident_roots {
            map.entry(id).or_insert(now);
        }

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
    #[doc(hidden)]
    pub fn gc_for_testing(&self, turbo_tasks: &TurboTasks<TurboTasksBackend>) -> usize {
        let _serialize = self.snapshot_in_progress.lock();
        let _gc_phase = self.snapshot_coord.begin_gc();
        self.gc_collect(turbo_tasks).0.collected
    }
}
