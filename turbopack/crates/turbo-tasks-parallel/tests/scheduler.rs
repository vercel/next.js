//! Integration tests for the standalone scheduler.
//!
//! The headline test is `blocking_dag_*`: a memoized DAG with claim-or-wait, which is the
//! exact shape of the sync turbo-tasks engine (a worker reaching a dependency another
//! worker is producing must block on it). It exercises work-stealing, managed blocking,
//! and compensation together, and asserts both correctness and the absence of deadlock
//! (via a watchdog) across many randomized graphs and pool sizes.

use std::{
    sync::{
        Arc,
        atomic::{AtomicU8, AtomicUsize, Ordering::SeqCst},
    },
    time::Duration,
};

use rand::{RngExt, SeedableRng, rngs::SmallRng};
use tt_parallel::{Config, LatchBlocker, LatchHandle, Pool, WorkerHandle};

// ---- basic fork-join correctness -------------------------------------------------------

#[test]
fn par_map_preserves_order_and_values() {
    let pool = Pool::new(Config::default());
    let out = pool.run(|w| w.par_map((0u64..1000).collect(), |_, x| x * x));
    assert_eq!(out, (0u64..1000).map(|x| x * x).collect::<Vec<_>>());
}

#[test]
fn nested_join_tree_sum() {
    fn tree(w: &WorkerHandle, lo: u64, hi: u64) -> u64 {
        if hi - lo <= 1 {
            return lo;
        }
        let mid = lo + (hi - lo) / 2;
        let (l, r) = w.join(|w| tree(w, lo, mid), move |w| tree(w, mid, hi));
        l + r
    }
    let pool = Pool::new(Config::default());
    let got = pool.run(|w| tree(w, 0, 10_000));
    assert_eq!(got, (0..10_000).sum::<u64>());
}

#[test]
fn run_can_borrow_from_caller_stack() {
    // `run` is scoped (not `'static`), so the closure and its parallel work may borrow
    // local data — essential for the turbo-tasks integration (task bodies borrow locals).
    let pool = Pool::new(Config::default());
    let data: Vec<u64> = (0..1000).collect();
    let total = pool.run(|w| {
        let refs: Vec<&u64> = data.iter().collect();
        w.par_map(refs, |_, x| *x * 2).into_iter().sum::<u64>()
    });
    assert_eq!(total, data.iter().map(|x| x * 2).sum::<u64>());
}

#[test]
fn run_is_reusable_across_calls() {
    let pool = Pool::new(Config::default());
    for i in 0..50u64 {
        let got = pool.run(move |w| w.par_map((0..100).collect(), move |_, x| x + i));
        assert_eq!(got.iter().sum::<u64>(), (0..100u64).map(|x| x + i).sum());
    }
}

#[test]
fn parallel_speedup_over_serial() {
    // Regression guard: on a multicore machine, parallel execution must be meaningfully
    // faster than serial. A conservative 3× floor (real speedup is ~8-12×) catches gross
    // parallelism regressions (e.g. a scheduling change that serializes the tree) without
    // being flaky. Skipped on machines with too few cores to be meaningful.
    let cores = std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(1);
    if cores < 4 {
        return;
    }

    fn spin(mut x: u64, n: u32) -> u64 {
        for _ in 0..n {
            x = x.wrapping_mul(6364136223846793005).wrapping_add(1);
        }
        x
    }
    fn serial(lo: u64, hi: u64) -> u64 {
        if hi - lo <= 1 {
            return spin(lo, 2000);
        }
        let mid = lo + (hi - lo) / 2;
        serial(lo, mid) ^ serial(mid, hi)
    }
    fn par(w: &WorkerHandle, lo: u64, hi: u64) -> u64 {
        if hi - lo <= 1 {
            return spin(lo, 2000);
        }
        let mid = lo + (hi - lo) / 2;
        let (l, r) = w.join(move |w| par(w, lo, mid), move |w| par(w, mid, hi));
        l ^ r
    }

    let leaves = 1u64 << 13;
    // Warm the pool, then time.
    let pool = Pool::new(Config::default());
    let _ = pool.run(move |w| par(w, 0, leaves));

    let t = std::time::Instant::now();
    let expected = serial(0, leaves);
    let serial_time = t.elapsed();

    let t = std::time::Instant::now();
    let got = pool.run(move |w| par(w, 0, leaves));
    let par_time = t.elapsed();

    assert_eq!(got, expected, "parallel result must match serial");
    assert!(
        par_time * 3 < serial_time,
        "expected >=3x speedup on {cores} cores, got serial={serial_time:?} parallel={par_time:?}"
    );
}

#[test]
fn deep_join_recursion_does_not_overflow() {
    // A left-leaning chain of ~1M nested joins. Past the share depth these run inline, so
    // the OS stack would grow ~1M frames and overflow a 64 MiB worker stack without the
    // `stacker` depth guard. With it, the chain completes.
    fn chain(w: &WorkerHandle, n: u64) -> u64 {
        if n == 0 {
            return 0;
        }
        let (l, _r) = w.join(move |w| chain(w, n - 1), |_| 0u64);
        l + 1
    }
    let pool = Pool::new(Config::default());
    let got = with_watchdog(Duration::from_secs(30), move || {
        pool.run(move |w| chain(w, 1_000_000))
    });
    assert_eq!(got, 1_000_000);
}

#[test]
fn cancellation_unwinds_without_hang() {
    use std::sync::Arc;

    let pool = Arc::new(Pool::new(Config::default()));
    let canceller = {
        let pool = pool.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(50));
            pool.cancel();
        })
    };

    let pool2 = pool.clone();
    let result = with_watchdog(Duration::from_secs(30), move || {
        pool2.run_cancellable(|w| {
            // Many parallel branches that run until cancelled, checking at each step.
            w.par_map((0..64u64).collect(), |w, _| {
                let mut x = 0u64;
                loop {
                    w.check_cancelled();
                    x = x.wrapping_add(1);
                    std::hint::black_box(x);
                }
            })
        })
    });

    canceller.join().unwrap();
    assert_eq!(result, Err(tt_parallel::Cancelled));

    // The pool is still usable for a normal run afterwards.
    let sum = pool
        .run(|w| w.par_map((0..100u64).collect(), |_, x| x))
        .iter()
        .sum::<u64>();
    assert_eq!(sum, (0..100u64).sum());
}

#[test]
fn shared_waiter_storm_parks_once_per_waiter() {
    struct CountingBlocker {
        inner: LatchBlocker,
        blocks: Arc<AtomicUsize>,
    }

    impl tt_parallel::Blocker for CountingBlocker {
        fn is_releasable(&mut self) -> bool {
            self.inner.is_releasable()
        }

        fn cycle_waker(&self) -> Option<Arc<dyn tt_parallel::WaitWake>> {
            self.inner.cycle_waker()
        }

        fn block(&mut self, timeout: Option<Duration>) {
            self.blocks.fetch_add(1, SeqCst);
            self.inner.block(timeout);
        }
    }

    const WAITERS: usize = 32;
    let gate = LatchHandle::new();
    let blocks = Arc::new(AtomicUsize::new(0));
    let notifier = {
        let gate = gate.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            gate.complete();
        })
    };

    let pool = Pool::new(Config {
        workers: 4,
        max_threads: 64,
        sequential: false,
    });
    pool.run({
        let gate = gate.clone();
        let blocks = blocks.clone();
        move |w| {
            w.par_map((0..WAITERS).collect(), move |w, _| {
                w.managed_block(
                    0x55,
                    CountingBlocker {
                        inner: LatchBlocker::new(gate.clone()),
                        blocks: blocks.clone(),
                    },
                )
                .unwrap();
            });
        }
    });
    notifier.join().unwrap();

    let blocks = blocks.load(SeqCst);
    assert!(blocks > 0, "test did not create any blocked waiters");
    assert!(
        blocks <= WAITERS,
        "event-driven waits should enter the blocker at most once per item; got {blocks}"
    );
}

// ---- memoized DAG with claim-or-wait (the turbo-tasks shape) ---------------------------

const EMPTY: u8 = 0;
const CLAIMED: u8 = 1;
const DONE: u8 = 2;

struct Node {
    deps: Vec<u32>,
    state: AtomicU8,
    value: AtomicUsize, // stores the computed u64 value (fits; values are small mod)
    latch: LatchHandle,
}

struct Dag {
    nodes: Vec<Node>,
    executions: AtomicUsize, // count actual computations (must equal reachable node count)
}

impl Dag {
    /// Build a random acyclic DAG: node `i` may depend only on nodes `< i` (so it's acyclic),
    /// with shared dependencies (multiple parents → same child) to force claim-or-wait.
    fn random(n: u32, max_deps: usize, seed: u64) -> Dag {
        let mut rng = SmallRng::seed_from_u64(seed);
        let mut nodes = Vec::with_capacity(n as usize);
        for i in 0..n {
            let mut deps = Vec::new();
            if i > 0 {
                let k = rng.random_range(0..=max_deps.min(i as usize));
                for _ in 0..k {
                    deps.push(rng.random_range(0..i));
                }
                deps.sort_unstable();
                deps.dedup();
            }
            nodes.push(Node {
                deps,
                state: AtomicU8::new(EMPTY),
                value: AtomicUsize::new(0),
                latch: LatchHandle::new(),
            });
        }
        Dag {
            nodes,
            executions: AtomicUsize::new(0),
        }
    }

    /// Reference (serial) evaluation, for correctness comparison.
    fn eval_serial(&self, id: u32, memo: &mut Vec<Option<u64>>) -> u64 {
        if let Some(v) = memo[id as usize] {
            return v;
        }
        let mut acc = id as u64;
        for &d in &self.nodes[id as usize].deps {
            acc = acc.rotate_left(7) ^ self.eval_serial(d, memo);
        }
        let v = acc.wrapping_mul(2654435761);
        memo[id as usize] = Some(v);
        v
    }

    /// Parallel evaluation on the pool. `compute` recurses; shared/in-progress deps are
    /// waited on with `managed_block`.
    fn compute(self: &Arc<Self>, w: &WorkerHandle, id: u32) -> u64 {
        let node = &self.nodes[id as usize];
        if node.state.load(SeqCst) == DONE {
            return node.value.load(SeqCst) as u64;
        }
        match node.state.compare_exchange(EMPTY, CLAIMED, SeqCst, SeqCst) {
            Ok(_) => {
                // We own `id`: compute its deps (in parallel), combine, publish.
                let this = self.clone();
                let deps = node.deps.clone();
                let dep_vals = w.owning(id as u64, |w| {
                    let this2 = this.clone();
                    w.par_map(deps, move |w, d| this2.compute(w, d))
                });
                let mut acc = id as u64;
                for v in dep_vals {
                    acc = acc.rotate_left(7) ^ v;
                }
                let v = acc.wrapping_mul(2654435761);
                node.value.store(v as usize, SeqCst);
                node.state.store(DONE, SeqCst);
                node.latch.complete();
                self.executions.fetch_add(1, SeqCst);
                v
            }
            Err(_) => {
                // Someone else is producing it (or it's already done): wait, then read.
                let blocker = LatchBlocker::new(node.latch.clone());
                w.managed_block(id as u64, blocker)
                    .expect("acyclic DAG must not report a cycle");
                node.value.load(SeqCst) as u64
            }
        }
    }

    fn reachable(&self, root: u32) -> usize {
        let mut seen = vec![false; self.nodes.len()];
        let mut stack = vec![root];
        while let Some(x) = stack.pop() {
            if std::mem::replace(&mut seen[x as usize], true) {
                continue;
            }
            stack.extend(self.nodes[x as usize].deps.iter().copied());
        }
        seen.iter().filter(|&&s| s).count()
    }
}

/// Run `f` with a watchdog: if it doesn't finish within `timeout`, fail the test loudly
/// (a hang = a scheduler deadlock, which is exactly what we must never have).
fn with_watchdog<R: Send + 'static>(
    timeout: Duration,
    f: impl FnOnce() -> R + Send + 'static,
) -> R {
    let (tx, rx) = std::sync::mpsc::channel();
    let h = std::thread::spawn(move || {
        let r = f();
        let _ = tx.send(());
        r
    });
    match rx.recv_timeout(timeout) {
        Ok(()) => h.join().unwrap(),
        Err(_) => panic!("DEADLOCK: scheduler did not make progress within {timeout:?}"),
    }
}

fn run_one_dag(n: u32, max_deps: usize, workers: usize, seed: u64) {
    let dag = Arc::new(Dag::random(n, max_deps, seed));
    let root = n - 1;

    // reference
    let mut memo = vec![None; n as usize];
    let expected = dag.eval_serial(root, &mut memo);
    let reachable = dag.reachable(root);

    let dag2 = dag.clone();
    let got = with_watchdog(Duration::from_secs(30), move || {
        let pool = Pool::new(Config {
            workers,
            max_threads: workers * 4,
            sequential: false,
        });
        pool.run(move |w| dag2.compute(w, root))
    });

    assert_eq!(got, expected, "value mismatch (n={n}, seed={seed})");
    // Every reachable node computed exactly once (claim-or-wait dedup worked).
    assert_eq!(
        dag.executions.load(SeqCst),
        reachable,
        "each reachable node must be computed exactly once (n={n}, seed={seed})"
    );
}

#[test]
fn blocking_dag_small_many_seeds() {
    for seed in 0..40 {
        run_one_dag(64, 4, 4, seed);
    }
}

#[test]
fn blocking_dag_wide_shared_deps() {
    // Many nodes, few deps each but heavy sharing of low indices → lots of claim-or-wait.
    for seed in 0..8 {
        run_one_dag(2000, 6, 8, seed);
    }
}

#[test]
fn blocking_dag_more_workers_than_cores() {
    // Force heavy blocking relative to pool size to exercise compensation.
    for seed in 0..8 {
        run_one_dag(500, 8, 2, seed);
    }
}

#[test]
fn blocking_dag_deep_chain() {
    // A near-linear deep chain (each node depends on the previous) → deep dependency
    // waits; must not deadlock and must compute once each.
    let n = 4000u32;
    let dag = Arc::new({
        let mut nodes = Vec::with_capacity(n as usize);
        for i in 0..n {
            nodes.push(Node {
                deps: if i == 0 { vec![] } else { vec![i - 1] },
                state: AtomicU8::new(EMPTY),
                value: AtomicUsize::new(0),
                latch: LatchHandle::new(),
            });
        }
        Dag {
            nodes,
            executions: AtomicUsize::new(0),
        }
    });
    let dag2 = dag.clone();
    let got = with_watchdog(Duration::from_secs(30), move || {
        let pool = Pool::new(Config {
            workers: 4,
            max_threads: 32,
            sequential: false,
        });
        pool.run(move |w| dag2.compute(w, n - 1))
    });
    let mut memo = vec![None; n as usize];
    assert_eq!(got, dag.eval_serial(n - 1, &mut memo));
    assert_eq!(dag.executions.load(SeqCst), n as usize);
}

// ---- owning task isolation (SYNC_SCHEDULER_DEADLOCK_FIX) -------------------------------

/// A worker that owns an in-progress Turbo Task must not expose nested fork/join work for
/// stealing. If it did, a stolen child could synchronously wait for the owner's task while the
/// owner waits for that child, forming the real-build cross-layer deadlock.
///
/// This test proves prevention rather than detection: all `par_map` items execute on the owning
/// worker, while ordinary non-owning `par_map` still uses multiple workers below.
#[test]
fn owning_par_map_stays_inline() {
    let pool = Pool::new(Config {
        workers: 4,
        max_threads: 16,
        sequential: false,
    });

    let owning_threads = pool.run(|w| {
        w.owning(0x7777_7777, |w| {
            w.par_map((0u32..256).collect(), |_, _| std::thread::current().id())
        })
    });
    let owner = owning_threads[0];
    assert!(
        owning_threads.iter().all(|thread| *thread == owner),
        "nested fork/join escaped an owning task onto another worker"
    );

    let non_owning_threads = pool.run(|w| {
        let root_thread = std::thread::current().id();
        let stolen_child_started = Arc::new(std::sync::atomic::AtomicBool::new(false));
        w.par_map((0u32..256).collect(), move |_, value| {
            let thread = std::thread::current().id();
            if thread != root_thread {
                stolen_child_started.store(true, SeqCst);
            } else if value == 0 {
                // Pin the root in the leftmost item until another worker steals a sibling.
                // This forces observable parallelism without competing with the suite's
                // wall-clock speedup test for a large amount of CPU time.
                while !stolen_child_started.load(SeqCst) {
                    std::hint::spin_loop();
                }
            }
            thread
        })
    });
    let distinct = non_owning_threads
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    assert!(
        distinct.len() > 1,
        "scheduler-wide parallelism was disabled instead of only owning-task fan-out"
    );
}

#[test]
fn owning_state_is_scoped_and_nesting_safe() {
    let pool = Pool::new(Config {
        workers: 2,
        max_threads: 4,
        sequential: false,
    });
    pool.run(|w| {
        assert!(!tt_parallel::current_is_owning());
        w.owning(0xA, |_| {
            assert!(tt_parallel::current_is_owning());
            w.owning(0xB, |_| assert!(tt_parallel::current_is_owning()));
            assert!(tt_parallel::current_is_owning());
        });
        assert!(
            !tt_parallel::current_is_owning(),
            "owning state leaked after leaving the scoped region"
        );
    });
}

#[test]
fn owning_state_is_restored_after_panic() {
    let pool = Pool::new(Config {
        workers: 2,
        max_threads: 4,
        sequential: false,
    });
    pool.run(|w| {
        let panic = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            w.owning(0xC, |_| panic!("intentional owning-region panic"));
        }));
        assert!(panic.is_err());
        assert!(
            !tt_parallel::current_is_owning(),
            "owning state leaked while unwinding"
        );

        // A leaked owner entry can make later managed waits appear cyclic. Exercise the same
        // worker after unwinding to prove it can still own work and run parallel jobs normally.
        let sum = w.owning(0xD, |w| {
            w.par_map((0u64..128).collect(), |_, value| value)
                .into_iter()
                .sum::<u64>()
        });
        assert_eq!(sum, (0u64..128).sum());
    });
}

/// Layer 0 correctness: with `sequential: true`, `join` never forks (no `push`, no latch,
/// no stealing), so a single worker computes the whole tree inline. Verifies the serial
/// branch produces correct results and needs no parallelism/compensation to make progress —
/// the property that makes it the guaranteed-deadlock-free fallback.
#[test]
fn sequential_mode_runs_join_inline_on_one_worker() {
    fn tree(w: &WorkerHandle, lo: u64, hi: u64) -> u64 {
        if hi - lo <= 1 {
            return lo;
        }
        let mid = lo + (hi - lo) / 2;
        let (l, r) = w.join(|w| tree(w, lo, mid), move |w| tree(w, mid, hi));
        l + r
    }
    let got = with_watchdog(Duration::from_secs(20), || {
        let pool = Pool::new(Config {
            workers: 1,
            max_threads: 1,
            sequential: true,
        });
        pool.run(|w| tree(w, 0, 10_000))
    });
    assert_eq!(got, (0..10_000).sum::<u64>());
}

// ---- instrumentation (P5a): the deadlock-state dump ------------------------------------

/// Prove `Pool::dump_state` renders a real state: a worker declares it is computing token
/// `0xAA` (`owning`) and parks waiting on an as-yet-unproduced token `0xBB`
/// (`managed_block`). The dump must show both edges — exactly the per-worker /
/// wait-graph picture the spec's P5a watchdog relies on to diagnose a stall.
#[cfg(feature = "instrument")]
#[test]
fn dump_state_shows_owner_and_blocked() {
    use std::sync::atomic::AtomicBool;

    let pool = Arc::new(Pool::new(Config::default()));
    let gate = LatchHandle::new(); // the worker parks until we release this
    let started = Arc::new(AtomicBool::new(false));

    let p = pool.clone();
    let gate_worker = gate.clone();
    let started_worker = started.clone();
    let worker = std::thread::spawn(move || {
        p.run(move |w| {
            w.owning(0xAA, |w| {
                started_worker.store(true, SeqCst);
                // Block on token 0xBB (nobody is producing it yet) until the main thread
                // releases the gate after inspecting the dump.
                let _ = w.managed_block(0xBB, LatchBlocker::new(gate_worker.clone()));
            });
        });
    });

    // Spin (bounded) until the worker is both owning 0xAA and blocked on 0xBB.
    let deadline = std::time::Instant::now() + Duration::from_secs(10);
    let dump = loop {
        let d = pool.dump_state();
        if d.contains("00000000000000aa") && d.contains("00000000000000bb") {
            break d;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "worker never reached the owning+blocked state; dump was:\n{d}"
        );
        std::thread::yield_now();
    };

    assert!(dump.contains("owners (token => computed by worker):"));
    assert!(dump.contains("blocked (worker => waiting on token):"));
    assert!(
        dump.contains("00000000000000aa => worker"),
        "dump missing owner edge:\n{dump}"
    );

    gate.complete(); // release the worker so `run` returns
    worker.join().unwrap();
    assert!(started.load(SeqCst));
}
