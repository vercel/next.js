//! Cross-worker dependency-wait graph + cycle detection.
//!
//! Wait and ownership edges are recorded synchronously. Edge insertions identify possible
//! cycles; one detector thread confirms only those candidates across stable snapshots and
//! wakes the managed waiter that can resolve the cycle.
//!
//! A "token" is an opaque `u64` the caller chooses to identify the unit being produced
//! (e.g. a task id). The caller declares ownership with [`WaitGraph::begin_compute`] /
//! [`WaitGraph::end_compute`] and clears waits with [`WaitGraph::end_wait`].
//!
//! v1 uses a single mutex; the design calls for sharding by token hash once contention
//! shows up (cycle checks only run on the cold blocking path, so this is rarely hot).

use std::{
    collections::{HashMap, HashSet},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
    time::{Duration, Instant},
};

use parking_lot::{Condvar, Mutex};

const CYCLE_RECHECK_INTERVAL: Duration = Duration::from_millis(2);
const CYCLE_CONFIRM_STREAK: u32 = 3;

/// Returned when a wait would close a dependency cycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cycle;

pub trait WaitWake: Send + Sync {
    fn wake(&self);
}

pub(crate) struct ManagedWait {
    cycle: AtomicBool,
    wake: Arc<dyn WaitWake>,
}

impl ManagedWait {
    pub(crate) fn new(wake: Arc<dyn WaitWake>) -> Arc<Self> {
        Arc::new(Self {
            cycle: AtomicBool::new(false),
            wake,
        })
    }

    pub(crate) fn has_cycle(&self) -> bool {
        self.cycle.load(Ordering::Acquire)
    }

    fn signal_cycle(&self) {
        if !self.cycle.swap(true, Ordering::AcqRel) {
            self.wake.wake();
        }
    }

    fn wake(&self) {
        self.wake.wake();
    }
}

struct WaitEdge {
    token: u64,
    managed: Option<Arc<ManagedWait>>,
}

/// The two maps under one mutex. They must be read together as a **consistent snapshot**:
/// the cycle walk hops `token -> owner -> (blocked_on that owner) -> owner -> ...`, mixing
/// task tokens (`managed_block`) and fork/join **job** tokens (`wait_for_job`). With the
/// earlier sharded-owner design the walk read each hop under a different lock, so it could
/// stitch a *phantom* cycle out of edges that were never simultaneously true. Only a
/// consistent snapshot guarantees a detected cycle is a real, present, circular wait — which
/// is what makes the walk sound now that job tokens break the old "task waits strictly
/// decrease node id, so can't cycle" invariant.
struct Graph {
    /// token -> the worker currently computing/producing it.
    owner: HashMap<u64, usize>,
    /// worker -> the token it is currently blocked waiting for.
    blocked_on: HashMap<usize, WaitEdge>,
    /// Reverse index for ownership edges that appear after a wait was recorded.
    waiters_by_token: HashMap<u64, HashSet<usize>>,
    /// Managed waits in cycles observed while inserting graph edges. Only these need
    /// periodic confirmation; ordinary waits never enter the detector's polling set.
    cycle_candidates: HashSet<usize>,
}

struct State {
    graph: Mutex<Graph>,
    changed: Condvar,
    shutdown: AtomicBool,
}

pub struct WaitGraph {
    state: Arc<State>,
    detector: Option<JoinHandle<()>>,
}

impl Default for WaitGraph {
    fn default() -> Self {
        let state = Arc::new(State {
            graph: Mutex::new(Graph {
                owner: HashMap::new(),
                blocked_on: HashMap::new(),
                waiters_by_token: HashMap::new(),
                cycle_candidates: HashSet::new(),
            }),
            changed: Condvar::new(),
            shutdown: AtomicBool::new(false),
        });
        let detector_state = state.clone();
        let detector = std::thread::Builder::new()
            .name("tt-cycle-detector".into())
            .spawn(move || detect_cycles(detector_state))
            .expect("failed to spawn cycle detector");
        WaitGraph {
            state,
            detector: Some(detector),
        }
    }
}

/// Walk the wait chain from `token` over a locked, consistent snapshot: `token -> owner ->
/// (what that owner is blocked on) -> owner -> ...`. Returns `true` if it reaches `worker`
/// (the wait would close a cycle *through the requester*). A running (not-blocked) owner ends
/// the chain.
///
/// The `seen` set bounds the walk: the snapshot may already contain a cycle among *other*
/// workers (a real deadlock those workers detect via their own re-check). Without the guard
/// the walk would spin forever — and it runs under the graph lock, so that would freeze every
/// worker. On revisiting a worker we stop and return `false`: this wait does not close a cycle
/// through the requester; the foreign cycle is resolved by one of its own members.
fn closes_cycle(g: &Graph, worker: usize, token: u64) -> bool {
    let mut cursor = token;
    let mut seen: std::collections::HashSet<usize> = std::collections::HashSet::new();
    loop {
        let Some(&owner) = g.owner.get(&cursor) else {
            return false; // nobody is computing it (or it just finished) — no cycle
        };
        if owner == worker {
            return true;
        }
        if !seen.insert(owner) {
            return false; // revisited an owner: a cycle among others, not through us
        }
        match g.blocked_on.get(&owner) {
            Some(edge) => cursor = edge.token,
            None => return false, // owner is running, not blocked — no cycle
        }
    }
}

fn mark_cycle_candidates(g: &mut Graph, worker: usize) {
    let Some(start) = g.blocked_on.get(&worker) else {
        return;
    };
    if !closes_cycle(g, worker, start.token) {
        return;
    }

    let mut current = worker;
    loop {
        let Some((token, managed)) = g
            .blocked_on
            .get(&current)
            .map(|edge| (edge.token, edge.managed.is_some()))
        else {
            return;
        };
        if managed {
            g.cycle_candidates.insert(current);
        }
        let Some(&owner) = g.owner.get(&token) else {
            return;
        };
        current = owner;
        if current == worker {
            return;
        }
    }
}

fn insert_wait(g: &mut Graph, worker: usize, edge: WaitEdge) {
    if let Some(previous) = g.blocked_on.insert(worker, edge) {
        if let Some(waiters) = g.waiters_by_token.get_mut(&previous.token) {
            waiters.remove(&worker);
            if waiters.is_empty() {
                g.waiters_by_token.remove(&previous.token);
            }
        }
    }
    let token = g.blocked_on[&worker].token;
    g.waiters_by_token.entry(token).or_default().insert(worker);
}

fn detect_cycles(state: Arc<State>) {
    let mut streaks = HashMap::<usize, u32>::new();
    let mut graph = state.graph.lock();
    loop {
        while !state.shutdown.load(Ordering::Acquire) && graph.cycle_candidates.is_empty() {
            streaks.clear();
            state.changed.wait(&mut graph);
        }
        if state.shutdown.load(Ordering::Acquire) {
            return;
        }

        // Graph notifications may wake us early, but confirmations must remain separated
        // in time so a transition-window phantom cannot be mistaken for a stable cycle.
        let deadline = Instant::now() + CYCLE_RECHECK_INTERVAL;
        while !state.shutdown.load(Ordering::Acquire) {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            state.changed.wait_for(&mut graph, deadline - now);
        }
        if state.shutdown.load(Ordering::Acquire) {
            return;
        }

        let candidates: Vec<usize> = graph.cycle_candidates.iter().copied().collect();
        streaks.retain(|worker, _| graph.cycle_candidates.contains(worker));

        let mut confirmed = Vec::new();
        for worker in candidates {
            let cyclic = graph.blocked_on.get(&worker).is_some_and(|edge| {
                edge.managed.is_some() && closes_cycle(&graph, worker, edge.token)
            });
            if !cyclic {
                graph.cycle_candidates.remove(&worker);
                streaks.remove(&worker);
                continue;
            }
            let streak = streaks.entry(worker).or_default();
            *streak += 1;
            if *streak >= CYCLE_CONFIRM_STREAK {
                if let Some(wait) = graph
                    .blocked_on
                    .get(&worker)
                    .and_then(|edge| edge.managed.clone())
                {
                    confirmed.push(wait);
                }
            }
        }
        drop(graph);
        for wait in confirmed {
            wait.signal_cycle();
        }
        graph = state.graph.lock();
    }
}

impl WaitGraph {
    /// Record that `worker` is now producing `token`.
    pub fn begin_compute(&self, token: u64, worker: usize) {
        let mut graph = self.state.graph.lock();
        graph.owner.insert(token, worker);
        let affected: Vec<usize> = graph
            .waiters_by_token
            .get(&token)
            .into_iter()
            .flatten()
            .copied()
            .collect();
        for worker in affected {
            mark_cycle_candidates(&mut graph, worker);
        }
        drop(graph);
        self.state.changed.notify_one();
    }

    /// Record that `token` is finished (no longer being produced).
    pub fn end_compute(&self, token: u64) {
        self.state.graph.lock().owner.remove(&token);
        self.state.changed.notify_one();
    }

    /// Record a non-wakeable wait, primarily a fork/join edge. If this closes a cycle, any
    /// managed edge in that cycle is queued for confirmation by the detector thread.
    pub fn begin_wait_record(&self, worker: usize, token: u64) {
        let mut graph = self.state.graph.lock();
        insert_wait(
            &mut graph,
            worker,
            WaitEdge {
                token,
                managed: None,
            },
        );
        mark_cycle_candidates(&mut graph, worker);
        drop(graph);
        self.state.changed.notify_one();
    }

    /// Record a wakeable managed wait. Returns whether this is the first waiter on `token`;
    /// only that waiter needs to compensate the pool because all waiters share the same
    /// producer and completion event.
    pub fn begin_managed_wait(&self, worker: usize, token: u64, wait: Arc<ManagedWait>) -> bool {
        let mut graph = self.state.graph.lock();
        let first_waiter = !graph.waiters_by_token.contains_key(&token);
        insert_wait(
            &mut graph,
            worker,
            WaitEdge {
                token,
                managed: Some(wait),
            },
        );
        mark_cycle_candidates(&mut graph, worker);
        drop(graph);
        self.state.changed.notify_one();
        first_waiter
    }

    /// Bounded-poll fallback for blockers that cannot provide a targeted wake handle.
    pub fn recheck_wait(&self, worker: usize, token: u64) -> Result<(), Cycle> {
        let g = self.state.graph.lock();
        if closes_cycle(&g, worker, token) {
            return Err(Cycle);
        }
        Ok(())
    }

    /// Clear `worker`'s wait edge (it woke up).
    pub fn end_wait(&self, worker: usize) {
        let mut graph = self.state.graph.lock();
        if let Some(edge) = graph.blocked_on.remove(&worker) {
            if let Some(waiters) = graph.waiters_by_token.get_mut(&edge.token) {
                waiters.remove(&worker);
                if waiters.is_empty() {
                    graph.waiters_by_token.remove(&edge.token);
                }
            }
        }
        graph.cycle_candidates.remove(&worker);
        drop(graph);
        self.state.changed.notify_one();
    }

    pub fn wake_all_managed(&self) {
        let waits: Vec<_> = self
            .state
            .graph
            .lock()
            .blocked_on
            .values()
            .filter_map(|edge| edge.managed.clone())
            .collect();
        for wait in waits {
            wait.wake();
        }
    }

    /// Snapshot the graph for a diagnostic dump: `(owner: token -> worker, blocked_on:
    /// worker -> token)`. Used by the [`crate::Pool`] watchdog (`instrument` feature) to
    /// show, at a stall, which worker is producing each in-flight token and which worker
    /// is parked waiting on which token — the data that turns "it hung" into a diagnosis.
    #[cfg(feature = "instrument")]
    pub fn snapshot(&self) -> (Vec<(u64, usize)>, Vec<(usize, u64)>) {
        let g = self.state.graph.lock();
        let mut owners: Vec<(u64, usize)> = g.owner.iter().map(|(&t, &w)| (t, w)).collect();
        let mut blocked: Vec<(usize, u64)> = g
            .blocked_on
            .iter()
            .map(|(&worker, edge)| (worker, edge.token))
            .collect();
        owners.sort_unstable();
        blocked.sort_unstable();
        (owners, blocked)
    }
}

impl Drop for WaitGraph {
    fn drop(&mut self) {
        self.state.shutdown.store(true, Ordering::Release);
        self.state.changed.notify_one();
        if let Some(detector) = self.detector.take() {
            let _ = detector.join();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct TestWake {
        wakes: std::sync::atomic::AtomicUsize,
    }

    impl WaitWake for TestWake {
        fn wake(&self) {
            self.wakes.fetch_add(1, Ordering::Release);
        }
    }

    /// Mirror the production "record then confirm" split ([`WaitGraph::begin_wait_record`] +
    /// [`WaitGraph::recheck_wait`]) as a single call for these deterministic scenarios, where
    /// one walk suffices (no concurrent transition windows).
    fn wait(g: &WaitGraph, worker: usize, token: u64) -> Result<(), Cycle> {
        g.begin_wait_record(worker, token);
        g.recheck_wait(worker, token)
    }

    #[test]
    fn no_cycle_when_producer_is_running() {
        let g = WaitGraph::default();
        // worker 1 produces token 100 (running, not blocked).
        g.begin_compute(100, 1);
        // worker 0 waits on token 100 — fine, 1 is running.
        assert_eq!(wait(&g, 0, 100), Ok(()));
    }

    #[test]
    fn detects_direct_two_worker_cycle() {
        let g = WaitGraph::default();
        // worker 0 produces token A; worker 1 produces token B.
        g.begin_compute(0xA, 0);
        g.begin_compute(0xB, 1);
        // worker 0 waits on B (owned by worker 1) — 1 is running, ok.
        assert_eq!(wait(&g, 0, 0xB), Ok(()));
        // worker 1 now waits on A (owned by worker 0, which is blocked on B owned by 1).
        // A -> owner 0 -> blocked_on B -> owner 1 == requester => cycle.
        assert_eq!(wait(&g, 1, 0xA), Err(Cycle));
    }

    #[test]
    fn detects_three_worker_cycle() {
        let g = WaitGraph::default();
        g.begin_compute(1, 0);
        g.begin_compute(2, 1);
        g.begin_compute(3, 2);
        assert_eq!(wait(&g, 0, 2), Ok(())); // 0 waits on 1's token
        assert_eq!(wait(&g, 1, 3), Ok(())); // 1 waits on 2's token
        assert_eq!(wait(&g, 2, 1), Err(Cycle)); // 2 waits on 0's token => 0->1->2->0
    }

    #[test]
    fn no_cycle_after_producer_finishes() {
        let g = WaitGraph::default();
        g.begin_compute(7, 3);
        g.end_compute(7); // finished; nobody owns it now
        assert_eq!(wait(&g, 0, 7), Ok(()));
    }

    #[test]
    fn detector_wakes_managed_wait_when_join_closes_cycle() {
        let g = WaitGraph::default();
        g.begin_compute(0xA, 0);
        g.begin_compute(0xB, 1);

        let wake = Arc::new(TestWake::default());
        let managed = ManagedWait::new(wake.clone());
        g.begin_managed_wait(0, 0xB, managed.clone());
        g.begin_wait_record(1, 0xA);

        let deadline = Instant::now() + Duration::from_secs(1);
        while (!managed.has_cycle() || wake.wakes.load(Ordering::Acquire) == 0)
            && Instant::now() < deadline
        {
            std::thread::yield_now();
        }
        assert!(managed.has_cycle(), "detector did not confirm the cycle");
        assert_eq!(wake.wakes.load(Ordering::Acquire), 1);
    }
}
