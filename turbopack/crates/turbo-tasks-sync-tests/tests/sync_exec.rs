//! End-to-end proof that the synchronous engine runs real turbo-tasks tasks with no
//! tokio runtime: tasks are computed inline on the calling thread via `read!`.
#![cfg(feature = "sync")]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::{
    collections::HashSet,
    mem::take,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use turbo_tasks::{Invalidator, TurboTasks, TurboTasksApi, Vc, get_invalidator, with_turbo_tasks};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

#[turbo_tasks::value]
struct Num {
    v: u32,
}

// A leaf task (synchronous in both modes).
#[turbo_tasks::function]
fn leaf() -> Vc<Num> {
    Num { v: 10 }.cell()
}

// A derived task that reads a dependency. Written with `read!` so it compiles in
// both async and sync mode; under `sync` the macro strips `async`.
#[turbo_tasks::function]
async fn plus_one() -> anyhow::Result<Vc<Num>> {
    let n = turbo_tasks::read!(leaf())?;
    Ok(Num { v: n.v + 1 }.cell())
}

// A second level of derivation, to exercise multi-hop inline recursion.
#[turbo_tasks::function]
async fn plus_two() -> anyhow::Result<Vc<Num>> {
    let n = turbo_tasks::read!(plus_one())?;
    Ok(Num { v: n.v + 1 }.cell())
}

fn make_tt() -> Arc<dyn TurboTasksApi> {
    make_tt_concrete() as Arc<dyn TurboTasksApi>
}

fn make_tt_concrete() -> Arc<TurboTasks<TurboTasksBackend>> {
    let backend = TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    );
    TurboTasks::new(backend)
}

fn make_tt_without_tracking() -> Arc<TurboTasks<TurboTasksBackend>> {
    let backend = TurboTasksBackend::new(
        BackendOptions {
            dependency_tracking: false,
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    );
    TurboTasks::new(backend)
}

#[test]
fn computes_inline_synchronously() {
    let tt = make_tt();
    turbo_tasks::turbo_tasks_scope(tt, || {
        // Each read drives inline computation of the task and its transitive deps,
        // all on this thread — no scheduler, no tokio.
        let one = turbo_tasks::read!(leaf()).unwrap();
        assert_eq!(one.v, 10);

        let two = turbo_tasks::read!(plus_one()).unwrap();
        assert_eq!(two.v, 11);

        let three = turbo_tasks::read!(plus_two()).unwrap();
        assert_eq!(three.v, 12);
    });
}

#[turbo_tasks::function(operation, root)]
async fn no_tracking_operation() -> anyhow::Result<Vc<Num>> {
    let value = turbo_tasks::read!(plus_two())?;
    Ok(Num { v: value.v }.cell())
}

#[test]
fn strong_read_without_tracking_is_demand_driven() {
    let tt = make_tt_without_tracking();
    let value = tt
        .run_sync(|| {
            let value = turbo_tasks::read!(no_tracking_operation().read_strongly_consistent())?;
            Ok(value.v)
        })
        .unwrap();
    assert_eq!(value, 12);
}

static RELEASE_DEFERRED_OBLIGATION: AtomicBool = AtomicBool::new(false);
static DEFERRED_OBLIGATION_FINISHED: AtomicBool = AtomicBool::new(false);

#[turbo_tasks::function(operation)]
fn deferred_obligation_operation() -> Vc<Num> {
    while !RELEASE_DEFERRED_OBLIGATION.load(Ordering::Acquire) {
        std::thread::sleep(Duration::from_millis(1));
    }
    DEFERRED_OBLIGATION_FINISHED.store(true, Ordering::Release);
    Num { v: 1 }.cell()
}

#[turbo_tasks::function(operation, root)]
fn nested_strong_operation() -> Vc<Num> {
    // Connecting without reading models an internal output task whose result is not part of the
    // operation's returned value, such as an emitted manifest.
    let _ = deferred_obligation_operation().connect();
    Num { v: 12 }.cell()
}

#[turbo_tasks::function(operation, root)]
async fn operation_with_deferred_obligation() -> anyhow::Result<Vc<Num>> {
    let value = turbo_tasks::read!(nested_strong_operation().read_strongly_consistent())?;
    Ok(Num { v: value.v }.cell())
}

#[test]
fn top_level_strong_read_drains_nested_obligations() {
    RELEASE_DEFERRED_OBLIGATION.store(false, Ordering::Release);
    DEFERRED_OBLIGATION_FINISHED.store(false, Ordering::Release);

    let releaser = std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(100));
        RELEASE_DEFERRED_OBLIGATION.store(true, Ordering::Release);
    });

    let tt = make_tt_without_tracking();
    let value = tt
        .run_sync(|| {
            let value = turbo_tasks::read!(
                operation_with_deferred_obligation().read_strongly_consistent()
            )?;
            Ok(value.v)
        })
        .unwrap();

    releaser.join().unwrap();
    assert_eq!(value, 12);
    assert!(DEFERRED_OBLIGATION_FINISHED.load(Ordering::Acquire));
}

// A task that takes a `Vc` argument; calling it with an unresolved `Vc` (a task
// output) exercises inline argument resolution in the sync `dynamic_call`.
#[turbo_tasks::function]
async fn double(n: Vc<Num>) -> anyhow::Result<Vc<Num>> {
    let v = turbo_tasks::read!(n)?;
    Ok(Num { v: v.v * 2 }.cell())
}

#[test]
fn resolves_vc_arguments_inline() {
    let tt = make_tt();
    turbo_tasks::turbo_tasks_scope(tt, || {
        // `leaf()` returns an unresolved `Vc<Num>` (a TaskOutput); passing it as an
        // argument forces inline resolution of the argument before the call.
        let r = turbo_tasks::read!(double(leaf())).unwrap();
        assert_eq!(r.v, 20);
    });
}

// --- Parallel fan-out (rayon work-stealing) -------------------------------

// A shared dependency read concurrently by every worker — exercises claim-or-wait
// (one worker computes it; the others block on its done event, then reuse the cached
// result rather than racing or bailing).
#[turbo_tasks::function]
fn shared() -> Vc<Num> {
    Num { v: 100 }.cell()
}

#[turbo_tasks::function]
async fn worker(i: u32) -> anyhow::Result<Vc<Num>> {
    // A small delay so the workers overlap and actually contend on `shared()`.
    std::thread::sleep(std::time::Duration::from_millis(5));
    let s = turbo_tasks::read!(shared())?;
    Ok(Num { v: s.v + i }.cell())
}

#[turbo_tasks::function]
async fn fan_out() -> anyhow::Result<Vc<Num>> {
    // Read all workers in parallel across rayon's pool.
    let parts = turbo_tasks::parallel!((0..8u32).map(worker))?;
    let sum: u32 = parts.iter().map(|p| p.v).sum();
    Ok(Num { v: sum }.cell())
}

#[test]
fn parallel_fan_out_with_shared_dep() {
    let tt = make_tt();
    turbo_tasks::turbo_tasks_scope(tt, || {
        // 8 workers, each = shared(100) + i; sum = 8*100 + (0+..+7) = 828.
        let total = turbo_tasks::read!(fan_out()).unwrap();
        assert_eq!(total.v, 828);
    });
}

// --- Incremental invalidation ---------------------------------------------

#[turbo_tasks::value(cell = "new", eq = "manual")]
struct Counter {
    #[turbo_tasks(debug_ignore, trace_ignore)]
    value: Mutex<(u32, HashSet<Invalidator>)>,
}

// Counter wraps external mutable state; it is never equal to itself (each cell is a
// fresh instance), so equality is manual rather than derived (a `Mutex` isn't `Eq`).
impl PartialEq for Counter {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}
impl Eq for Counter {}

impl Counter {
    fn incr(&self) {
        with_turbo_tasks(|tt| {
            let mut lock = self.value.lock().unwrap();
            lock.0 += 1;
            for i in take(&mut lock.1) {
                i.invalidate(&**tt);
            }
        });
    }
}

#[turbo_tasks::value_impl]
impl Counter {
    // `root` is required for strongly-consistent reads, which force recomputation of
    // the dirty task after invalidation.
    #[turbo_tasks::function(root)]
    fn get_value(&self) -> Vc<Num> {
        let mut lock = self.value.lock().unwrap();
        lock.1.insert(get_invalidator().unwrap());
        Num { v: lock.0 }.cell()
    }
}

// Construct the counter inside a task so the cell has a task context.
#[turbo_tasks::function]
fn make_counter() -> Vc<Counter> {
    Counter {
        value: Mutex::new((0, Default::default())),
    }
    .cell()
}

#[test]
fn run_sync_allows_top_level_cells() {
    let tt = make_tt_concrete();
    // Inside `run_sync`, the closure runs as a root Once task, so creating a cell at
    // the "top level" of the closure works (it has a task context).
    let v = tt
        .run_sync(|| {
            let counter = Counter::cell(Counter {
                value: Mutex::new((0, Default::default())),
            });
            let n = turbo_tasks::read!(counter.get_value().strongly_consistent())?;
            anyhow::Ok(n.v)
        })
        .unwrap();
    assert_eq!(v, 0);
}

#[test]
fn recomputes_after_invalidation() {
    let tt = make_tt();
    turbo_tasks::turbo_tasks_scope(tt, || {
        let counter = make_counter();

        assert_eq!(
            turbo_tasks::read!(counter.get_value().strongly_consistent())
                .unwrap()
                .v,
            0
        );

        // Mutate external state and fire the registered invalidator.
        turbo_tasks::read!(counter).unwrap().incr();

        // A strongly-consistent read must recompute the now-dirty task inline.
        assert_eq!(
            turbo_tasks::read!(counter.get_value().strongly_consistent())
                .unwrap()
                .v,
            1
        );
    });
}
