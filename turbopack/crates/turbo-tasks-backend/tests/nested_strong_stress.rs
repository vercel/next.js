#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Reproducer probe for the sync-engine strong-consistency stall.
//!
//! Mirrors the `ModuleGraph::from_graphs` / `async_module_info` shape that the real
//! v0/chat build hits: a recursive tree of `root` `node` tasks, where each internal
//! level fans out (via `parallel!`) `branch` children reached through a **nested**
//! `read_strongly_consistent()` (`strong_child`, an `operation` — like `from_graphs`).
//! So strong-consistency reads are stacked `levels` deep across pool workers, over a
//! wide **shared** leaf subtree that also emits collectibles (issues). This is the
//! shape the existing sync tests (recompute = tiny chain, scope_stress = off-pool
//! strong reads, no nesting) do not exercise.
//!
//! Under the async engine this always succeeds; if the sync engine had the diagnosed
//! strong-consistency stall the `TURBO_SYNC_DEADLOCK_SECS` backstop would fire.
//!
//! RESULT (2026-07-07): this does **not** reproduce the v0/chat stall. Swept
//! `levels` 4-6, `branch` 3-6, shared roots (`NSS_ROOTS`, forcing the "activeness
//! already exists" branch at mod.rs ~551), low worker counts, and
//! `TURBO_SYNC_SEQUENTIAL=1` — every configuration passes. The sync strong-consistency
//! scheduling machinery is robust across breadth/depth/sharing; the real stall must
//! involve an ingredient absent from pure turbo-tasks graphs (leading suspect: a
//! worker parked in the node-eval / external-blocking bridge via `block_in_place`,
//! which carries no wait-graph token — matching the real build's "owns a task but is
//! not in the wait-graph, running" dump). Kept as a regression guard + a record that
//! the investigation's section-4 hypothesis is not the cause.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    ResolvedVc, ValueToString, Vc, emit, parallel, read,
    unmark_top_level_task_may_leak_eventually_consistent_state,
};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

// Tunable via env so we can sweep scale without recompiling.
fn width() -> u32 {
    env_u32("NSS_WIDTH", 12)
}
fn shared() -> u32 {
    env_u32("NSS_SHARED", 16)
}
fn depth() -> u32 {
    env_u32("NSS_DEPTH", 3)
}
/// When > 0, `strong_child(_, id)` strong-reads the *shared* root `node(_, id % roots)`,
/// so multiple parents concurrently strongly-read the same root. This forces the
/// "activeness already exists" branch (mod.rs ~551) that the investigation suspects:
/// the second+ concurrent reader schedules nothing and relies on prior scheduling.
fn roots() -> u32 {
    env_u32("NSS_ROOTS", 0)
}
fn root_for(g: u32) -> u32 {
    let r = roots();
    if r == 0 { g } else { g % r }
}
fn env_u32(key: &str, default: u32) -> u32 {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[turbo_tasks::value(shared)]
struct Thing(u32);

impl Thing {
    fn new(v: u32) -> ResolvedVc<Self> {
        Self::resolved_cell(Thing(v))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Thing {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}

/// A shared dependency chain. Because `id` is `i % shared`, many leaves across
/// many graphs reach the *same* `shared_dep(id, depth)` subtree — a diamond of
/// shared, cold (dirty, no output) tasks aggregated under multiple roots.
#[turbo_tasks::function]
async fn shared_dep(id: u32, depth: u32) -> Result<Vc<u32>> {
    if depth == 0 {
        return Ok(Vc::cell(id));
    }
    let child = *read!(shared_dep(id, depth - 1))?;
    Ok(Vc::cell(child + 1))
}

/// A leaf: emits a collectible (issue-like) and reads into the shared subtree.
#[turbo_tasks::function]
async fn leaf(g: u32, i: u32) -> Result<Vc<u32>> {
    emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(Thing::new(
        g * 1000 + i,
    )));
    let s = *read!(shared_dep(i % shared(), depth()))?;
    Ok(Vc::cell(s + i))
}

fn levels() -> u32 {
    env_u32("NSS_LEVELS", 4)
}
fn branch() -> u32 {
    env_u32("NSS_BRANCH", 4)
}

/// A recursive **root** node. This is the aggregation root whose dirty subtree a
/// nested strong read waits on (`all_clean_event`). Mirrors `from_graphs_inner` at
/// every level of the real build's nested strong-consistency tree.
///
/// - level 0: aggregates `width` leaves over the shared subtree.
/// - level > 0: fans out `branch` children, each reached through a **nested**
///   `read_strongly_consistent()` (`strong_child`) — so strong reads are stacked `levels` deep
///   across pool workers, exactly the v0/chat shape.
#[turbo_tasks::function(operation, root)]
async fn node(level: u32, id: u32) -> Result<Vc<u32>> {
    if level == 0 {
        let vals = parallel!((0..width()).map(|i| leaf(id, i)))?;
        let sum: u32 = vals.iter().map(|v| **v).sum();
        return Ok(Vc::cell(sum));
    }
    let b = branch();
    let vals = parallel!((0..b).map(|c| strong_child(level - 1, id * b + c).connect()))?;
    let sum: u32 = vals.iter().map(|v| **v).sum();
    Ok(Vc::cell(sum))
}

/// Mirrors `ModuleGraph::from_graphs`: an `operation` body whose only job is a
/// **nested** `read_strongly_consistent()` of a child root. Running on a pool
/// worker, it parks on the child root's `all_clean_event`.
#[turbo_tasks::function(operation)]
async fn strong_child(level: u32, id: u32) -> Result<Vc<u32>> {
    let op = node(level, root_for(id));
    let v = read!(op.read_strongly_consistent())?;
    Ok(Vc::cell(*v))
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 4)]
async fn nested_strong_stress() {
    run_once(&REGISTRATION, || async {
        unmark_top_level_task_may_leak_eventually_consistent_state();
        // Outermost strong read must target a `root` task (`node`), matching how the
        // real build's top-level caller strong-reads a root. `node`'s body then fans
        // out the nested `strong_child` → `node` strong reads `levels` deep.
        let out = *node(levels(), 0).connect().strongly_consistent().await?;
        assert!(out > 0, "root should aggregate a positive sum");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
