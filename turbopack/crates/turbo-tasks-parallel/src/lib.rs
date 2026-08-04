//! `tt_parallel` — a standalone synchronous (no-async, no-tokio) full-DAG work-stealing
//! scheduler with **managed blocking**, for the sync turbo-tasks engine.
//!
//! Unlike rayon/chili (which forbid a task blocking on another task), this scheduler is
//! built for a demand-driven computation graph where a worker reads a dependency another
//! worker is producing and must wait for it. It stays deadlock-free via *compensation*
//! (à la `ForkJoinPool.ManagedBlocker` / Go's M-handoff): when a worker is about to park
//! on a peer, the pool keeps live parallelism up (wake an idle worker, or spawn a capped
//! helper) so queued work never starves — and the blocked worker never steals unrelated
//! work (which would risk the self-wait deadlock).
//!
//! Implements the work-stealing core, managed blocking with compensation and cycle
//! detection, and an allocation-free fork path
//! (`job::StackJob`/`JobRef`). Depth-guard (P2) and cancellation (P3) layer on later.

#![allow(clippy::type_complexity)]

mod job;
mod wait_graph;

#[cfg(feature = "instrument")]
use std::time::Instant;
use std::{
    cell::Cell,
    collections::VecDeque,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering::*},
    },
    thread::JoinHandle,
    time::Duration,
};

use crossbeam_deque::{Injector, Steal, Stealer, Worker as Deque};
use crossbeam_utils::Backoff;
use parking_lot::{Condvar, Mutex};

pub use crate::wait_graph::{Cycle, WaitWake};
use crate::{
    job::{HeapJob, JobRef, StackJob},
    wait_graph::{ManagedWait, WaitGraph},
};

/// Panic payload used to unwind a cancelled computation (see [`WorkerHandle::check_cancelled`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cancelled;

/// How long an idle worker parks before re-checking the queues. New work wakes a parked
/// worker immediately via [`Sleep::wake_any`] on every `push`; this timeout is only a
/// self-heal backstop for a lost wake-up (the tiny race between a worker finding no job
/// and committing to park). It was previously 100µs, which made every idle worker wake
/// ~10k times/second to re-scan — on a serial-dominant build (few parallel sites, many
/// idle workers) that busy-loop dominated runtime and made the pool scale *negatively*.
/// A longer park lets idle workers actually sleep; a lost wake-up costs at most this long
/// and is rare.
const IDLE_PARK: Duration = Duration::from_millis(2);

/// Number of spin/yield rounds a worker tries to find work before parking. Keeps workers
/// hot during active computation (where new work appears within microseconds) so they
/// don't park through a short burst — only truly-idle workers reach the park. Kept small:
/// each round is a `sched_yield` syscall, so many idle workers spinning many rounds is a
/// syscall storm that shows up as system time.
const SPIN_ROUNDS: u32 = 6;

/// Deep `join` recursion grows the OS stack (inline compute = the call stack IS the
/// dependency chain). Every `STACK_CHECK_INTERVAL` inline levels we check via `stacker`
/// whether we're near the end of the stack and, if so, allocate a fresh heap segment to
/// continue on — so arbitrarily deep chains can't overflow. Checking periodically (not per
/// join) keeps the fast path free. `STACK_RED_ZONE` must comfortably exceed
/// `STACK_CHECK_INTERVAL` join frames so we never overflow between checks.
const STACK_CHECK_INTERVAL: u32 = 64;
const STACK_RED_ZONE: usize = 512 * 1024;
const STACK_SEGMENT: usize = 16 * 1024 * 1024;

/// How often a parked `managed_block` waiter re-walks the wait-graph for a cycle that closed
/// after it parked (see [`WorkerHandle::managed_block`]). The producer's completion still
/// wakes it immediately (the blocker's own signal); this only bounds the latency to *detect*
/// a cross-layer cycle whose closing edge (a fork/join wait) was recorded after the park.
const CYCLE_RECHECK_INTERVAL: Duration = Duration::from_millis(2);

/// Number of consecutive re-checks (each `CYCLE_RECHECK_INTERVAL` apart) that must all observe
/// the cycle before [`WorkerHandle::managed_block`] treats it as real. A genuine deadlock is
/// permanent and clears this trivially; a transition-window phantom (a stale wait/ownership
/// edge that is about to be cleared) does not survive even one interval. This is what keeps
/// detection from ever aborting a live, progressing computation.
const CYCLE_CONFIRM_STREAK: u32 = 3;

/// High bit reserved to keep fork/join **job** tokens disjoint from **task** tokens (the
/// integration's `sync_token` = task id, always `< 2^63`). A forked job is assigned
/// `JOB_TOKEN_BIT | counter`, so the two token spaces never collide in the shared `WaitGraph`.
const JOB_TOKEN_BIT: u64 = 0x8000_0000_0000_0000;

/// Process-global monotonic source of fork/join job ids. Wraps within the low 63 bits;
/// `JOB_TOKEN_BIT` is always
/// set so every returned token is in the job-token space.
static NEXT_JOB_ID: AtomicU64 = AtomicU64::new(0);

#[inline]
fn next_job_token() -> u64 {
    JOB_TOKEN_BIT | (NEXT_JOB_ID.fetch_add(1, Relaxed) & !JOB_TOKEN_BIT)
}

// ---------------------------------------------------------------------------------------
// SharedLatch — multi-waiter, cross-thread completion signal (for `run` + `managed_block`).
// The per-`join` fast path uses the cheaper single-waiter `job::Latch` instead.
// ---------------------------------------------------------------------------------------

struct SharedLatch {
    set: Mutex<bool>,
    cv: Condvar,
    interrupted: AtomicBool,
}

impl SharedLatch {
    fn new() -> Arc<SharedLatch> {
        Arc::new(SharedLatch {
            set: Mutex::new(false),
            cv: Condvar::new(),
            interrupted: AtomicBool::new(false),
        })
    }
    fn is_set(&self) -> bool {
        *self.set.lock()
    }
    fn set(&self) {
        *self.set.lock() = true;
        self.cv.notify_all();
    }
    fn wait(&self) {
        let mut g = self.set.lock();
        while !*g {
            self.cv.wait(&mut g);
        }
    }
    fn wait_interruptible(&self, timeout: Option<Duration>) {
        let mut g = self.set.lock();
        if !*g && !self.interrupted.swap(false, AcqRel) {
            if let Some(timeout) = timeout {
                self.cv.wait_for(&mut g, timeout);
            } else {
                self.cv.wait(&mut g);
            }
        }
    }
}

impl WaitWake for SharedLatch {
    fn wake(&self) {
        self.interrupted.store(true, Release);
        let _guard = self.set.lock();
        self.cv.notify_all();
    }
}

// ---------------------------------------------------------------------------------------
// Blocker — the managed-blocking interface a task uses to wait on a peer's production.
// ---------------------------------------------------------------------------------------

/// A condition a worker waits on via [`WorkerHandle::managed_block`]. Modeled on
/// `java.util.concurrent.ForkJoinPool.ManagedBlocker`.
pub trait Blocker {
    /// Cheap check: is the awaited value ready (so no parking is needed)?
    fn is_releasable(&mut self) -> bool;
    /// A handle the cycle detector can use to interrupt this blocker without marking its
    /// awaited value complete. Blockers that provide one may park without periodic polling.
    fn cycle_waker(&self) -> Option<Arc<dyn WaitWake>> {
        None
    }
    /// Park until released, externally woken, or the optional fallback timeout elapses.
    fn block(&mut self, timeout: Option<Duration>);
}

/// A cloneable completion handle integration code can model "this task is done" with, and
/// hand to [`LatchBlocker`].
#[derive(Clone)]
pub struct LatchHandle(Arc<SharedLatch>);
impl LatchHandle {
    pub fn new() -> Self {
        LatchHandle(SharedLatch::new())
    }
    pub fn complete(&self) {
        self.0.set();
    }
    pub fn is_complete(&self) -> bool {
        self.0.is_set()
    }
}
impl Default for LatchHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// A [`Blocker`] backed by a [`LatchHandle`] — the common case (wait for a peer's task).
pub struct LatchBlocker(Arc<SharedLatch>);
impl LatchBlocker {
    pub fn new(latch: LatchHandle) -> Self {
        LatchBlocker(latch.0)
    }
}
impl Blocker for LatchBlocker {
    fn is_releasable(&mut self) -> bool {
        self.0.is_set()
    }
    fn cycle_waker(&self) -> Option<Arc<dyn WaitWake>> {
        Some(self.0.clone())
    }
    fn block(&mut self, timeout: Option<Duration>) {
        self.0.wait_interruptible(timeout);
    }
}

// ---------------------------------------------------------------------------------------
// JobSource — a driver-owned queue of stealable jobs the driver can also drain itself.
// ---------------------------------------------------------------------------------------

/// A job queued in a [`JobSource`]: the closure plus the `WaitGraph` job token whichever
/// worker runs it will own for the duration (via `run_chunk`), so a wait on the token is
/// walkable for cycle detection.
struct SourceJob {
    token: u64,
    f: Box<dyn FnOnce(&WorkerHandle) + Send>,
}

struct JobSourceInner {
    queue: Mutex<VecDeque<SourceJob>>,
}

/// A driver-owned queue of fire-and-forget jobs with two consumers: free pool workers
/// (which prefer it over the injector backlog — see [`WorkerThread::find_job`]) and the
/// owning driver itself (via [`JobSource::take`]).
///
/// This exists for the streaming graph-traversal driver, whose deadlock-safety invariant
/// is that **its traversal must never depend on pool capacity to complete**: when every
/// other worker is blocked (e.g. piled up on a task token the driver itself owns, with the
/// thread cap reached), the driver can still pop and run its own jobs to completion — the
/// self-draining property that the serial and level-BFS drivers have by construction, and
/// that `spawn_external` into the shared injector does not provide (`pending≈146k`,
/// `free_slots=0`, driver's jobs starving behind a
/// backlog of tasks that all block on the driver's own token).
///
/// Jobs taken by other workers run `owning` (they are part of computing the driver's
/// traversal task, so their fork/join waits park instead of stealing unrelated blocking
/// work — the owning-inheritance rule) and own their job `token` in the `WaitGraph` while
/// running, so the driver's tail wait (`managed_block` on an outstanding token) is fully
/// walkable by the cycle detector.
///
/// Dropping the `JobSource` unregisters it and discards any still-queued jobs.
pub struct JobSource {
    inner: Arc<JobSourceInner>,
    pool: Arc<Inner>,
}

impl JobSource {
    /// Queue a job. Free workers may steal it; the owner may [`take`][Self::take] it back.
    /// `token` should come from [`new_job_token`]; whichever worker runs the job owns the
    /// token in the `WaitGraph` for the duration.
    pub fn push(&self, token: u64, f: impl FnOnce(&WorkerHandle) + Send + 'static) {
        self.inner.queue.lock().push_back(SourceJob {
            token,
            f: Box::new(f),
        });
        self.pool.source_jobs.fetch_add(1, Relaxed);
        self.pool.pending.fetch_add(1, Relaxed);
        self.pool.sleep.wake_any();
    }

    /// Take one queued job back for the owner to run inline. Returns `None` when the queue
    /// is empty (every pushed job is either already taken by a worker or was never pushed).
    #[allow(clippy::type_complexity)]
    pub fn take(&self) -> Option<(u64, Box<dyn FnOnce(&WorkerHandle) + Send>)> {
        let job = self.inner.queue.lock().pop_front()?;
        self.pool.source_jobs.fetch_sub(1, Relaxed);
        self.pool.pending.fetch_sub(1, Relaxed);
        Some((job.token, job.f))
    }

    /// Discard every still-queued job, returning their tokens (they will never run and
    /// never signal completion — the owner must forget them). Used on the driver's unwind
    /// path so its completion drain only waits for jobs that were actually taken.
    pub fn drain_tokens(&self) -> Vec<u64> {
        let drained: Vec<SourceJob> = self.inner.queue.lock().drain(..).collect();
        if !drained.is_empty() {
            self.pool.source_jobs.fetch_sub(drained.len(), Relaxed);
            self.pool.pending.fetch_sub(drained.len(), Relaxed);
        }
        drained.into_iter().map(|j| j.token).collect()
    }

    /// Bump the pool's global progress counter for a job the owner ran inline (stolen jobs
    /// are counted by `run_chunk`). Keeps progress-aware stall backstops from mistaking a
    /// long driver-drained traversal for a stall.
    pub fn note_inline_progress(&self) {
        self.pool.completed.fetch_add(1, Relaxed);
    }
}

impl Drop for JobSource {
    fn drop(&mut self) {
        // Discard leftovers first so counters stay balanced even if the owner didn't drain.
        let _ = self.drain_tokens();
        let mut sources = self.pool.sources.lock();
        if let Some(idx) = sources.iter().position(|s| Arc::ptr_eq(s, &self.inner)) {
            sources.swap_remove(idx);
        }
    }
}

/// Allocate a `WaitGraph` job token (high-bit-set, disjoint from task tokens) for a
/// [`JobSource`] job, so the owner can `managed_block` on it while the job runs elsewhere.
pub fn new_job_token() -> u64 {
    next_job_token()
}

// ---------------------------------------------------------------------------------------
// Sleep — idle-worker parking (timeout-backed; correctness does not depend on notify).
// ---------------------------------------------------------------------------------------

struct Sleep {
    mutex: Mutex<()>,
    cv: Condvar,
    sleepers: AtomicUsize,
}

impl Sleep {
    fn new() -> Sleep {
        Sleep {
            mutex: Mutex::new(()),
            cv: Condvar::new(),
            sleepers: AtomicUsize::new(0),
        }
    }
    fn park(&self) {
        self.sleepers.fetch_add(1, SeqCst);
        let mut g = self.mutex.lock();
        self.cv.wait_for(&mut g, IDLE_PARK);
        drop(g);
        self.sleepers.fetch_sub(1, SeqCst);
    }
    /// Wake one idle worker if any is parked. Returns whether there was a sleeper to wake.
    ///
    /// Deliberately unconditional. Most injected jobs are futile (the reader claims the task
    /// inline before a worker can pop the job), and skipping their wake-ups looks like free
    /// savings — but it was measured three separate ways (gate on "someone is already
    /// searching", gate on queue depth, gate on both) and every variant made the build slower
    /// and far noisier. Wake latency is on the critical path; the churn is not.
    fn wake_any(&self) -> bool {
        if self.sleepers.load(SeqCst) == 0 {
            return false;
        }
        let _g = self.mutex.lock();
        self.cv.notify_one();
        true
    }
    fn wake_all(&self) {
        let _g = self.mutex.lock();
        self.cv.notify_all();
    }
}

// ---------------------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------------------

/// Configuration for a [`Pool`].
pub struct Config {
    /// Target number of worker threads (≈ CPU cores).
    pub workers: usize,
    /// Hard ceiling on live threads, including compensation helpers.
    pub max_threads: usize,
    /// Genuinely-serial mode: when `true`,
    /// [`WorkerHandle::join`] always runs both halves inline — no `push`, no `StackJob`, no
    /// latch, no stealing. With no fork/join there is no cross-layer wait cycle, so the pool
    /// is deadlock-free by construction (single-core-slow). Used as the correctness fallback
    /// and A/B oracle. Set by the integration from `TURBO_SYNC_SEQUENTIAL=1`.
    pub sequential: bool,
}
impl Default for Config {
    fn default() -> Self {
        let workers = std::thread::available_parallelism()
            .map(|p| p.get())
            .unwrap_or(1);
        // The compensation ceiling. A sync worker that blocks on a peer-produced value
        // burns an OS thread for the whole wait (no suspension), and compensation must
        // keep spawning replacements for the pool to drain the work those waits depend
        // on. On a large real app hundreds of demand chains block concurrently (route
        // workers piling onto one hot task like `get_evaluate_pool`), so a small
        // multiple of the core count wedges: every thread ends up parked in a wait,
        // `free_slots=0`, and runnable work starves — a capacity deadlock with no cycle.
        // Blocked threads are cheap (parked in a condvar;
        // stacks are lazily mapped), so the ceiling is generous by default and
        // overridable via `TT_PARALLEL_MAX_THREADS`.
        let max_threads = std::env::var("TT_PARALLEL_MAX_THREADS")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|&n| n > 0)
            .unwrap_or_else(|| (workers * 14).max(192));
        Config {
            workers,
            max_threads,
            sequential: false,
        }
    }
}

struct Inner {
    injector: Injector<JobRef>,
    stealers: Box<[Stealer<JobRef>]>,
    slots: Mutex<Vec<(usize, Deque<JobRef>)>>,
    /// `join` shares (exposes for stealing) only while recursion depth `< share_depth`;
    /// deeper joins run inline (serial, ~free). This exposes ~`2^share_depth` coarse
    /// chunks near the top of the tree — plenty for load balance — while the vast
    /// majority of (deep, small) joins pay no scheduling overhead. A stolen subtree
    /// re-shares its own shallow levels (the thief starts at depth 0), so distribution is
    /// recursive. Set to ≈ log2(workers) + slack.
    share_depth: u32,
    sleep: Sleep,
    /// Jobs pushed but not yet started running (drives compensation decisions).
    pending: AtomicUsize,
    /// Workers currently parked inside `managed_block`/`join` waits (not running work).
    blocked: AtomicUsize,
    live: AtomicUsize,
    target: usize,
    max_threads: usize,
    /// Genuinely-serial mode (Layer 0). When set, `join` runs both halves inline (see
    /// [`Config::sequential`]).
    sequential: bool,
    shutdown: AtomicBool,
    /// Cooperative cancellation flag for the current computation. Set via [`Pool::cancel`];
    /// task bodies observe it through [`WorkerHandle::check_cancelled`] and unwind, and
    /// `managed_block` bails out so a cancel can't hang on an unsatisfiable wait.
    cancelled: AtomicBool,
    waits: WaitGraph,
    threads: Mutex<Vec<JoinHandle<()>>>,
    /// Monotonic count of executed deque chunks — the watchdog's "global progress" signal
    /// (no advance + all workers blocked ⇒ a stall to dump). Always present (cheap
    /// Relaxed op) so the deadlock backstop can be progress-aware even without the full
    /// `instrument` feature.
    completed: AtomicU64,
    /// Registered [`JobSource`]s — driver-owned queues of latency-critical jobs (streaming
    /// graph traversals) that free workers prefer over the injector backlog. See
    /// [`Pool::job_source`].
    sources: Mutex<Vec<Arc<JobSourceInner>>>,
    /// Total queued jobs across all registered sources (fast-path gate so `find_job`
    /// doesn't take the `sources` lock when there is nothing to take).
    source_jobs: AtomicUsize,
    /// Workers currently parked inside [`block_in_place`] (an EXTERNAL wait, invisible to the
    /// `WaitGraph`): `(worker index, callsite label, entered-at)`. This is exactly the class
    /// of worker the real-build deadlock funnels into — "owns a task but is not in the
    /// wait-graph, running." `instrument`-only; the dump cross-references it against `owners`
    /// to name the terminal stuck task + what external resource it is blocked on.
    #[cfg(feature = "instrument")]
    ext_blocked: Mutex<Vec<(usize, &'static str, Instant)>>,
}

/// A synchronous full-DAG work-stealing pool.
pub struct Pool {
    inner: Arc<Inner>,
}

/// The per-thread worker context handed to every job. Valid only inside a job / `run`.
pub struct WorkerHandle {
    _priv: (),
}

thread_local! {
    static CURRENT: Cell<*const WorkerThread> = const { Cell::new(std::ptr::null()) };
}

struct WorkerThread {
    inner: Arc<Inner>,
    index: usize,
    deque: Deque<JobRef>,
    /// Current `join` recursion depth on this worker (drives the share/inline decision).
    depth: Cell<u32>,
    /// Whether this worker is currently inside a [`WorkerHandle::owning`] region (computing a
    /// task). Scoped and per-worker (set/restored around the `owning` body, nesting-safe). A
    /// `join` waiting for a stolen child on an owning worker PARKS (with compensation) rather
    /// than stealing arbitrary work — stealing could run a task that `managed_block`s on a
    /// peer-produced token while this owning frame is frozen on the stack, a self-wait the
    /// cycle detector can't see. Non-owning waits steal freely for full utilization.
    owning: Cell<bool>,
    /// Set inside [`WorkerHandle::scoped_fork`]: this owning worker MAY expose `join`'s right
    /// half for stealing.
    ///
    /// The two behaviours `owning` controls are separable, and only one of them is actually
    /// unsafe:
    ///
    /// * **stealing while waiting** is unsafe and stays disabled. Worker A owns task W; if A
    ///   steals an unrelated job Z and Z reads W, then Z waits for W while W's only producer (A)
    ///   is busy running Z. That is a real self-deadlock and needs no cycle in the task graph, so
    ///   a blocked owning worker must park-and-compensate, never steal.
    /// * **forking** is safe. Exposing the right half only adds the wait edge `worker -> job ->
    ///   owner`, and the owner is by construction running. Livelock aside, the only way that
    ///   closes a loop is if some worker blocks on a task this worker owns, i.e. a cycle in the
    ///   task graph — which cannot exist.
    ///
    /// Keeping this opt-in (rather than forking from every owning `join`) means the fan-out
    /// sites that want breadth ask for it, and everything else keeps the cheap inline path.
    fork_while_owning: Cell<bool>,
}

impl Pool {
    pub fn new(cfg: Config) -> Pool {
        let max = cfg.max_threads.max(cfg.workers).max(1);
        let mut stealers = Vec::with_capacity(max);
        let mut slots = Vec::with_capacity(max);
        for i in 0..max {
            let d: Deque<JobRef> = Deque::new_lifo();
            stealers.push(d.stealer());
            slots.push((i, d));
        }
        let target = cfg.workers.max(1);
        // ≈ log2(workers) + 4 → ~16× more chunks than workers, for load balance.
        let share_depth = (usize::BITS - target.leading_zeros()) + 4;
        let inner = Arc::new(Inner {
            injector: Injector::new(),
            stealers: stealers.into_boxed_slice(),
            slots: Mutex::new(slots),
            share_depth,
            sleep: Sleep::new(),
            pending: AtomicUsize::new(0),
            blocked: AtomicUsize::new(0),
            live: AtomicUsize::new(0),
            target,
            max_threads: max,
            sequential: cfg.sequential,
            shutdown: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
            waits: WaitGraph::default(),
            threads: Mutex::new(Vec::new()),
            completed: AtomicU64::new(0),
            sources: Mutex::new(Vec::new()),
            source_jobs: AtomicUsize::new(0),
            #[cfg(feature = "instrument")]
            ext_blocked: Mutex::new(Vec::new()),
        });
        for _ in 0..inner.target {
            inner.clone().spawn_worker(false);
        }
        #[cfg(feature = "instrument")]
        inner.clone().spawn_watchdog();
        Pool { inner }
    }

    /// Run `root` on the pool, blocking the calling thread until it completes. A panic in
    /// `root` (or any joined work) is re-raised on the calling thread.
    ///
    /// `root` may borrow from the caller's stack (it is not `'static`): this is sound
    /// because `run` does not return until the job has finished executing, so the borrowed
    /// data outlives the job (the `rayon::scope` / `std::thread::scope` pattern).
    pub fn run<'env, R: Send + 'env>(
        &self,
        root: impl FnOnce(&WorkerHandle) -> R + Send + 'env,
    ) -> R {
        self.inner.cancelled.store(false, Relaxed);
        let latch = SharedLatch::new();
        let slot: Arc<Mutex<Option<std::thread::Result<R>>>> = Arc::new(Mutex::new(None));
        {
            let latch = latch.clone();
            let slot = slot.clone();
            let job = move |w: &WorkerHandle| {
                // Catch panics so a panicking root can't leave the latch unset (which would
                // hang the caller); re-raise on the calling thread below.
                let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| root(w)));
                *slot.lock() = Some(r);
                latch.set();
            };
            // Erase the `'env` lifetime to enqueue the job. SAFETY: we block on `latch`
            // below until the job has run, and the job is executed exactly once, so the
            // borrowed `'env` data is alive for the whole execution.
            let job: Box<dyn FnOnce(&WorkerHandle) + Send + 'env> = Box::new(job);
            let job: Box<dyn FnOnce(&WorkerHandle) + Send + 'static> =
                unsafe { std::mem::transmute(job) };
            self.inner.inject(HeapJob::boxed(job).into_job_ref(0));
        }
        latch.wait();
        let r = slot.lock().take().unwrap();
        match r {
            Ok(v) => v,
            Err(panic) => std::panic::resume_unwind(panic),
        }
    }

    /// Like [`run`][Self::run], but a cancellation (via [`Pool::cancel`]) unwinds to
    /// `Err(Cancelled)` instead of propagating as a panic. Other panics still propagate.
    pub fn run_cancellable<'env, R: Send + 'env>(
        &self,
        root: impl FnOnce(&WorkerHandle) -> R + Send + 'env,
    ) -> Result<R, Cancelled> {
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| self.run(root))) {
            Ok(v) => Ok(v),
            Err(panic) if panic.is::<Cancelled>() => Err(Cancelled),
            Err(panic) => std::panic::resume_unwind(panic),
        }
    }

    /// Submit fire-and-forget work to the pool from anywhere — on a worker or off it. The
    /// job runs on some worker; the caller does not wait for it. The integration uses this
    /// to schedule a task's computation as a pool job (the task body claim-dedups, so a
    /// duplicate submission for an already-running task is a cheap no-op). Unlike
    /// [`WorkerHandle::spawn`], this needs no current worker, so the off-pool driver and
    /// the backend's `schedule` hook can both enqueue work.
    pub fn spawn_external(&self, f: impl FnOnce(&WorkerHandle) + Send + 'static) {
        self.inner.inject(HeapJob::boxed(f).into_job_ref(0));
    }

    /// Register a new [`JobSource`] on this pool. Free workers check registered sources
    /// for work after their own deque but *before* the injector, so source jobs (which
    /// gate a driver that may itself be gating many blocked workers) don't queue behind
    /// the injector backlog. The source unregisters itself on drop.
    pub fn job_source(&self) -> JobSource {
        let inner = Arc::new(JobSourceInner {
            queue: Mutex::new(VecDeque::new()),
        });
        self.inner.sources.lock().push(inner.clone());
        JobSource {
            inner,
            pool: self.inner.clone(),
        }
    }

    /// Request cancellation of the current computation. In-flight task bodies that call
    /// [`WorkerHandle::check_cancelled`] will unwind; `managed_block` waits bail out.
    pub fn cancel(&self) {
        self.inner.cancelled.store(true, Relaxed);
        // Wake anything parked so it observes the cancellation promptly.
        self.inner.sleep.wake_all();
        self.inner.waits.wake_all_managed();
    }

    /// Monotonic count of executed deque chunks — a coarse "global progress" signal a
    /// caller-side watchdog can poll to tell a slow-but-advancing build from a stall.
    pub fn progress(&self) -> u64 {
        self.inner.completed.load(Relaxed)
    }

    /// `(workers actually running, jobs waiting in the queues)` — the two numbers a stats
    /// sampler needs to answer "is the pool idle because nothing is exposed, or because
    /// everyone is blocked?". Racy by nature; only meaningful in aggregate.
    pub fn snapshot(&self) -> (usize, usize) {
        let live = self.inner.live.load(SeqCst);
        let blocked = self.inner.blocked.load(SeqCst);
        let sleeping = self.inner.sleep.sleepers.load(SeqCst);
        let running = live.saturating_sub(blocked).saturating_sub(sleeping);
        (running, self.inner.pending.load(Relaxed))
    }

    /// A one-shot diagnostic snapshot of the pool (counts + wait-graph). See
    /// [`Inner::dump_state`]. Use it from a caller-side watchdog or a test to print why a
    /// computation is stuck instead of guessing.
    #[cfg(feature = "instrument")]
    pub fn dump_state(&self) -> String {
        self.inner.dump_state(|_| None)
    }

    /// Like [`Pool::dump_state`], but resolves each **task** token (the low, non-`JOB_TOKEN_BIT`
    /// tokens = `sync_token(task_id)`) to a human description via `describe`, so the integration
    /// can print the backend task type/id for every owner and every externally-blocked worker.
    #[cfg(feature = "instrument")]
    pub fn dump_state_described(&self, describe: impl Fn(u64) -> Option<String>) -> String {
        #[cfg(feature = "instrument")]
        {
            return self.inner.dump_state(describe);
        }
        #[cfg(not(feature = "instrument"))]
        {
            // Without instrument we still have `completed` but no wait-graph; return a minimal
            // snapshot so callers don't need cfg.
            let _ = describe;
            format!(
                "progress={} (instrument off, no wait-graph)",
                self.inner.completed.load(Relaxed)
            )
        }
    }

    /// Like `dump_state_described` but available without `instrument` cfg for the deadlock
    /// backstop's diagnostic dump.
    pub fn dump_state_simple(&self) -> String {
        format!(
            "live={} target={} max={} | pending={} blocked={} completed={}",
            self.inner.live.load(std::sync::atomic::Ordering::SeqCst),
            self.inner.target,
            self.inner.max_threads,
            self.inner
                .pending
                .load(std::sync::atomic::Ordering::Relaxed),
            self.inner.blocked.load(std::sync::atomic::Ordering::SeqCst),
            self.inner
                .completed
                .load(std::sync::atomic::Ordering::Relaxed),
        )
    }
}

impl Inner {
    fn inject(self: &Arc<Self>, job: JobRef) {
        self.pending.fetch_add(1, Relaxed);
        self.injector.push(job);
        self.sleep.wake_any();
    }

    fn spawn_worker(self: Arc<Self>, helper: bool) {
        let slot = self.slots.lock().pop();
        let Some((index, deque)) = slot else {
            return; // all slots in use (live == max_threads)
        };
        self.live.fetch_add(1, SeqCst);
        let inner = self.clone();
        let handle = std::thread::Builder::new()
            .name(if helper {
                "tt-par-helper".into()
            } else {
                "tt-par-worker".into()
            })
            .stack_size(64 * 1024 * 1024)
            .spawn(move || worker_main(inner, index, deque, helper))
            .expect("spawn worker");
        self.threads.lock().push(handle);
    }

    fn has_pending_work(&self) -> bool {
        self.pending.load(Relaxed) > 0
    }

    /// Maintain `target` non-blocked workers while a worker parks on an EXTERNAL resource
    /// (see [`block_in_place`]). Unlike [`compensate`], this does NOT gate on pending work:
    /// the parked worker will not be around to pick up work that arrives while it is blocked,
    /// so we proactively ensure a live replacement exists. Self-correcting: a surplus helper
    /// retires once `non_blocked > target` (see `worker_main`).
    fn ensure_replacement(self: &Arc<Self>) {
        if self.sleep.wake_any() {
            return;
        }
        let non_blocked = self
            .live
            .load(SeqCst)
            .saturating_sub(self.blocked.load(SeqCst));
        if non_blocked < self.target && self.live.load(SeqCst) < self.max_threads {
            self.clone().spawn_worker(true);
        }
    }

    /// Keep live parallelism up while a worker is parked: prefer waking an idle worker;
    /// only spawn a helper when there is pending work, none idle to take it, and we are
    /// below both the live target and the hard cap.
    ///
    /// Strong-consistency note (sync engine): `schedule` enqueues dirty tasks via the
    /// injector. A strong read waits on `all_clean_event`, which only fires after those
    /// dirty tasks run. If all workers are busy computing long tasks (e.g.
    /// `chunk_group_info` DFS) they are counted as non-blocked, so the old
    /// `non_blocked < target` gate would not spawn a helper, and with no sleeper to wake
    /// the injector starves and the strong read deadlocks. For correctness we must ensure
    /// pending work is always drained: if there is pending work and no sleeper, spawn a
    /// helper when under `max_threads`, regardless of `non_blocked`. The `target` gate
    /// remains for the non-pending, throughput-maintaining case.
    fn compensate(self: &Arc<Self>) {
        if !self.has_pending_work() {
            return;
        }
        if self.sleep.wake_any() {
            return;
        }
        // Always ensure progress on pending work if we can grow: a blocked worker may be
        // waiting on work that is sitting in the injector, but the non-blocked workers are
        // busy on long CPU tasks and not yet back in the pool loop. Without a helper the
        // injector starves and a strong read hangs on `all_clean_event`.
        if self.live.load(SeqCst) < self.max_threads {
            let non_blocked = self
                .live
                .load(SeqCst)
                .saturating_sub(self.blocked.load(SeqCst));
            // If we are below target, we definitely need a helper for throughput. If we are
            // at or above target but still have pending work and no sleeper, we still need a
            // helper for correctness (the pending work may be a dirty task needed to fire the
            // event the blocker is waiting on). Always spawn in that case, up to max_threads.
            if non_blocked < self.target {
                self.clone().spawn_worker(true);
            } else {
                // Correctness path: pending work exists, no idle worker, and the blocked worker
                // is waiting on that pending work (directly or transitively). Spawn a helper
                // to drain the injector even though we already have `target` non-blocked workers.
                self.clone().spawn_worker(true);
            }
        }
    }

    /// Format a one-shot diagnostic snapshot of the pool: live/blocked/queued counts plus
    /// the wait-graph (which worker is producing each in-flight token, and which worker is
    /// parked on which token). This is the data that distinguishes the three failure modes
    /// — exhaustion (queued work, all workers blocked), a cross-worker cycle (a loop in the
    /// wait edges), and a self-wait (a worker blocked on a token it itself owns).
    #[cfg(feature = "instrument")]
    fn dump_state(&self, describe: impl Fn(u64) -> Option<String>) -> String {
        use std::fmt::Write;
        let (owners, blocked_on) = self.waits.snapshot();
        let free_slots = self.slots.lock().len();
        let ext_blocked = self.ext_blocked.lock().clone();
        // A worker is externally blocked (in `block_in_place`, e.g. the node-eval bridge) if it
        // appears here. Such a worker is invisible to the `WaitGraph`, so a task it *owns*
        // shows up in `owners` with no `blocked_on` edge — the real-build stall signature.
        let ext_label = |worker: &usize| {
            ext_blocked
                .iter()
                .find(|(i, _, _)| i == worker)
                .map(|(_, l, since)| format!("{l} for {:?}", since.elapsed()))
        };
        // Describe a token: task tokens (< JOB_TOKEN_BIT) resolve via `describe`; job tokens
        // (fork/join, high bit set) are labeled as such.
        let describe_token = |token: u64| -> String {
            if token & JOB_TOKEN_BIT != 0 {
                "<fork/join job>".to_string()
            } else {
                describe(token).unwrap_or_else(|| "<unknown task>".to_string())
            }
        };
        let mut s = String::new();
        let _ = writeln!(
            s,
            "  live={} target={} max={} | pending={} blocked={} ext_blocked={} completed={} | \
             injector~{} free_slots={}",
            self.live.load(SeqCst),
            self.target,
            self.max_threads,
            self.pending.load(Relaxed),
            self.blocked.load(SeqCst),
            ext_blocked.len(),
            self.completed.load(Relaxed),
            self.injector.len(),
            free_slots,
        );
        let _ = writeln!(s, "  owners (token => computed by worker):");
        if owners.is_empty() {
            let _ = writeln!(s, "    <none>");
        }
        for (token, worker) in &owners {
            // Flag a self-wait: this worker is also parked waiting on a token (any token).
            let self_wait = blocked_on.iter().any(|(w, t)| w == worker && t == token);
            // Flag the TERMINAL stall root: owns a task but is neither in the wait-graph nor
            // (unless externally blocked) doing anything else — everyone else funnels here.
            let waiting = blocked_on.iter().any(|(w, _)| w == worker);
            let tag = if self_wait {
                "  <-- SELF-WAIT".to_string()
            } else if let Some(label) = ext_label(worker) {
                format!("  <-- EXTERNALLY BLOCKED ({label})")
            } else if !waiting {
                "  <-- OWNS-BUT-IDLE (terminal? not in wait-graph, not ext-blocked)".to_string()
            } else {
                String::new()
            };
            let _ = writeln!(
                s,
                "    {token:#018x} => worker {worker} [{}]{tag}",
                describe_token(*token)
            );
        }
        let _ = writeln!(s, "  blocked (worker => waiting on token):");
        if blocked_on.is_empty() {
            let _ = writeln!(s, "    <none>");
        }
        for (worker, token) in &blocked_on {
            let _ = writeln!(
                s,
                "    worker {worker} => {token:#018x} [{}]",
                describe_token(*token)
            );
        }
        let _ = writeln!(
            s,
            "  externally blocked (block_in_place — INVISIBLE to wait-graph):"
        );
        if ext_blocked.is_empty() {
            let _ = writeln!(s, "    <none>");
        }
        for (worker, label, since) in &ext_blocked {
            // Cross-reference: which task token(s) does this externally-blocked worker own?
            let owned: Vec<String> = owners
                .iter()
                .filter(|(_, w)| w == worker)
                .map(|(t, _)| format!("{t:#018x} [{}]", describe_token(*t)))
                .collect();
            let _ = writeln!(
                s,
                "    worker {worker}: {label} for {:?}; owns: {}",
                since.elapsed(),
                if owned.is_empty() {
                    "<nothing>".to_string()
                } else {
                    owned.join(", ")
                }
            );
        }
        s
    }

    /// Spawn the watchdog: a low-priority thread that, after `TT_PARALLEL_WATCHDOG_SECS`
    /// (default 5) of no global progress, dumps [`Inner::dump_state`] to stderr once per
    /// stall episode. Non-fatal — it only observes and reports; the integration's own
    /// deadlock backstop decides whether to abort. Retires on pool shutdown.
    #[cfg(feature = "instrument")]
    fn spawn_watchdog(self: Arc<Self>) {
        let secs: u64 = std::env::var("TT_PARALLEL_WATCHDOG_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(5);
        if secs == 0 {
            return;
        }
        std::thread::Builder::new()
            .name("tt-par-watchdog".into())
            .spawn(move || {
                let mut last = self.completed.load(Relaxed);
                let mut stalled_secs = 0u64;
                let mut dumped = false;
                loop {
                    std::thread::sleep(Duration::from_secs(1));
                    if self.shutdown.load(SeqCst) {
                        break;
                    }
                    let now = self.completed.load(Relaxed);
                    let live = self.live.load(SeqCst);
                    let blocked = self.blocked.load(SeqCst);
                    let pending = self.pending.load(Relaxed);
                    // A stall: no chunk completed since the last check, and either every
                    // live worker is parked (classic deadlock) or work is queued with
                    // nothing draining it (exhaustion). A single long-running task body
                    // (progress is real, just coarse) does NOT match — blocked < live and
                    // pending may be 0 — so we don't cry wolf on slow compute.
                    let stalled = now == last
                        && live > 0
                        && (blocked >= live || (pending > 0 && blocked > 0));
                    if stalled {
                        stalled_secs += 1;
                        if stalled_secs >= secs && !dumped {
                            eprintln!(
                                "\n=== tt_parallel WATCHDOG: no progress for {stalled_secs}s \
                                 ===\n{}",
                                self.dump_state(|_| None)
                            );
                            dumped = true;
                        }
                    } else {
                        stalled_secs = 0;
                        dumped = false;
                    }
                    last = now;
                }
            })
            .expect("spawn watchdog");
    }
}

/// Whether the calling thread is a pool worker (i.e. running inside `run`/a job). Lets
/// integration code that is reached both on and off the pool pick the right wait path.
pub fn in_worker() -> bool {
    CURRENT.with(|c| !c.get().is_null())
}

/// A handle to the current pool worker, if the caller is on the pool. Use it to reach
/// `join`/`par_map`/`scope`/`managed_block` from code that doesn't already hold a handle.
pub fn current_worker() -> Option<WorkerHandle> {
    if in_worker() {
        Some(WorkerHandle { _priv: () })
    } else {
        None
    }
}

/// Whether the pool currently has a worker parked idle (so freshly-exposed work would be
/// picked up promptly). Integration code uses this for **granularity control**: fork a
/// fan-out into pool jobs only when there is spare capacity to run them in parallel;
/// otherwise run the items inline (serially), avoiding fork/scheduling overhead that would
/// dwarf the work. Returns `false` off the pool. This is a hint (racy by nature) — a stale
/// `false` only costs some parallelism, never correctness.
pub fn current_has_idle_capacity() -> bool {
    CURRENT.with(|c| {
        let ptr = c.get();
        if ptr.is_null() {
            return false;
        }
        // SAFETY: non-null `CURRENT` points at this thread's live `WorkerThread`.
        let wt = unsafe { &*ptr };
        wt.inner.sleep.sleepers.load(SeqCst) > 0
    })
}

/// Whether the current worker is inside an `owning` region (computing a task). While
/// owning, the worker's fork/join waits park with compensation instead of stealing
/// unrelated work, and other workers may `managed_block` on the token this worker owns.
/// Fanning out a `parallel!` (which uses `par_map`/`join` that creates job wait edges)
/// from inside an owning task can form a cross-layer cycle with those `managed_block`
/// waits: `parent task --owns--> worker --job-wait--> child job --task-wait--> ancestor task`.
/// The cycle is deadlock-prone and the detection is best-effort. To avoid it entirely,
/// owning workers run `sync_parallel_read` inline (serial) — see `manager.rs`.
pub fn current_is_owning() -> bool {
    CURRENT.with(|c| {
        let ptr = c.get();
        if ptr.is_null() {
            return false;
        }
        // SAFETY: as above.
        let wt = unsafe { &*ptr };
        wt.owning.get()
    })
}

/// Free-function form of [`WorkerHandle::managed_block`], for callers deep in a call stack
/// that don't thread a `&WorkerHandle`. Must be called from a pool worker (see
/// [`in_worker`]).
pub fn managed_block_current(token: u64, blocker: impl Blocker) -> Result<(), Cycle> {
    WorkerHandle { _priv: () }.managed_block(token, blocker)
}

/// Free-function form of [`WorkerHandle::owning`]. Must be called from a pool worker.
pub fn owning_current<R>(token: u64, f: impl FnOnce() -> R) -> R {
    WorkerHandle { _priv: () }.owning(token, |_| f())
}

/// Run `f` — a blocking call on an EXTERNAL resource (e.g. `Runtime::block_on` into the
/// node-eval edge runtime, a socket read, a subprocess wait) — while keeping the pool's
/// parallelism up.
///
/// A pool worker that blocks on something *outside* the pool (so not via [`managed_block`],
/// which is for peer-produced pool tokens) would otherwise silently remove itself from the
/// pool with no replacement. When several workers do that concurrently the pool drains, and
/// any pool task the blocked work transitively depends on has no worker left to run it —
/// a deadlock. This marks the worker blocked and ensures a live replacement (so `target`
/// non-blocked workers keep draining the queue), then clears the mark when `f` returns
/// (including on unwind). No token / cycle detection: the wait is on an external resource,
/// not a pool token. Off-pool it just runs `f`.
pub fn block_in_place<R>(f: impl FnOnce() -> R) -> R {
    block_in_place_labeled("block_in_place", f)
}

/// Like [`block_in_place`], but tags the wait with a static `label` (e.g. `"node-eval:recv"`)
/// so the `instrument` stall dump can name *what external resource* each externally-blocked
/// worker is parked on — the missing piece for diagnosing a stall that funnels into a worker
/// that owns a task but is invisible to the `WaitGraph`.
pub fn block_in_place_labeled<R>(label: &'static str, f: impl FnOnce() -> R) -> R {
    let _ = label;
    if !in_worker() {
        return f();
    }
    let wt = current();
    wt.inner.blocked.fetch_add(1, SeqCst);
    #[cfg(feature = "instrument")]
    wt.inner
        .ext_blocked
        .lock()
        .push((wt.index, label, Instant::now()));
    wt.inner.ensure_replacement();

    struct Unblock<'a> {
        inner: &'a Inner,
        #[cfg(feature = "instrument")]
        index: usize,
    }
    impl Drop for Unblock<'_> {
        fn drop(&mut self) {
            self.inner.blocked.fetch_sub(1, SeqCst);
            #[cfg(feature = "instrument")]
            self.inner
                .ext_blocked
                .lock()
                .retain(|(i, _, _)| *i != self.index);
        }
    }
    let _unblock = Unblock {
        inner: &wt.inner,
        #[cfg(feature = "instrument")]
        index: wt.index,
    };
    f()
}

/// Free-function form of [`WorkerHandle::check_cancelled`]. No-op off the pool.
pub fn check_cancelled_current() {
    if in_worker() {
        WorkerHandle { _priv: () }.check_cancelled();
    }
}

fn current() -> &'static WorkerThread {
    let ptr = CURRENT.with(|c| c.get());
    assert!(
        !ptr.is_null(),
        "tt_parallel: this operation must run inside a pool job (use Pool::run)"
    );
    // SAFETY: targets the `WorkerThread` on this thread's `worker_main` frame, which
    // outlives every job it runs.
    unsafe { &*ptr }
}

fn worker_main(inner: Arc<Inner>, index: usize, deque: Deque<JobRef>, helper: bool) {
    let wt = WorkerThread {
        inner: inner.clone(),
        index,
        deque,
        depth: Cell::new(0),
        owning: Cell::new(false),
        fork_while_owning: Cell::new(false),
    };
    CURRENT.with(|c| c.set(&wt));
    let handle = WorkerHandle { _priv: () };

    let mut idle_rounds: u32 = 0;
    let mut backoff = Backoff::new();
    loop {
        if inner.shutdown.load(SeqCst) {
            break;
        }
        match wt.find_job() {
            Some(job) => {
                idle_rounds = 0;
                backoff.reset();
                // Run at the job's exposed depth (preserves granularity control).
                handle.run_chunk(&wt, job);
            }
            None => {
                idle_rounds = idle_rounds.saturating_add(1);
                if idle_rounds < SPIN_ROUNDS {
                    // Stay hot: new work usually appears within a few microseconds. `Backoff`
                    // starts with `spin_loop` hints and only escalates to `yield_now`, so a
                    // brief gap between jobs doesn't cost a syscall — with this many workers,
                    // yielding on every round was itself a measurable share of system time.
                    backoff.snooze();
                    continue;
                }
                idle_rounds = 0;
                backoff.reset();
                let non_blocked = inner
                    .live
                    .load(SeqCst)
                    .saturating_sub(inner.blocked.load(SeqCst));
                if helper && non_blocked > inner.target {
                    break; // surplus helper retires
                }
                inner.sleep.park();
            }
        }
    }
    CURRENT.with(|c| c.set(std::ptr::null()));
    inner.live.fetch_sub(1, SeqCst);
    inner.slots.lock().push((wt.index, wt.deque));
}

impl WorkerThread {
    fn find_job(&self) -> Option<JobRef> {
        if let Some(job) = self.deque.pop() {
            self.inner.pending.fetch_sub(1, Relaxed);
            return Some(job);
        }
        // Registered job sources come before the injector: a source job is part of a
        // traversal whose driver may be gating many blocked workers (it owns their awaited
        // task token), so running it beats pulling yet another injector task that may
        // immediately block on that same token. Runs `owning` with its token registered —
        // see [`JobSource`].
        if let Some(job) = self.take_source_job() {
            return Some(job);
        }
        let backoff = Backoff::new();
        loop {
            let mut retry = false;
            match self.inner.injector.steal_batch_and_pop(&self.deque) {
                Steal::Success(job) => {
                    self.inner.pending.fetch_sub(1, Relaxed);
                    return Some(job);
                }
                Steal::Retry => retry = true,
                Steal::Empty => {}
            }
            for (i, stealer) in self.inner.stealers.iter().enumerate() {
                if i == self.index {
                    continue;
                }
                match stealer.steal_batch_and_pop(&self.deque) {
                    Steal::Success(job) => {
                        self.inner.pending.fetch_sub(1, Relaxed);
                        return Some(job);
                    }
                    Steal::Retry => retry = true,
                    Steal::Empty => {}
                }
            }
            if !retry {
                return None;
            }
            backoff.snooze();
        }
    }

    fn push(&self, job: JobRef) {
        self.inner.pending.fetch_add(1, Relaxed);
        self.deque.push(job);
        self.inner.sleep.wake_any();
    }

    /// Take one job from a registered [`JobSource`], if any has one queued. The returned
    /// `JobRef` carries the job's token (owned by this worker while running, via
    /// `run_chunk`) and `owning = true` (it is part of computing the source owner's
    /// traversal task, so it must not steal unrelated blocking work while it waits).
    fn take_source_job(&self) -> Option<JobRef> {
        if self.inner.source_jobs.load(Relaxed) == 0 {
            return None;
        }
        let job = {
            let sources = self.inner.sources.lock();
            let mut taken = None;
            for source in sources.iter() {
                if let Some(job) = source.queue.lock().pop_front() {
                    taken = Some(job);
                    break;
                }
            }
            taken?
        };
        self.inner.source_jobs.fetch_sub(1, Relaxed);
        self.inner.pending.fetch_sub(1, Relaxed);
        Some(HeapJob::boxed(job.f).into_job_ref_tracked(0, job.token, true))
    }
}

impl WorkerHandle {
    /// Fork two pieces of work that may run in parallel; return their results in order.
    /// `a` runs inline; `b` is offered to the pool for stealing. While waiting for `b` we
    /// run our own queued descendants (safe — they cannot depend on this `join` frame);
    /// if `b` was stolen and our deque drains, we park with compensation.
    pub fn join<RA, RB>(
        &self,
        a: impl FnOnce(&WorkerHandle) -> RA,
        b: impl FnOnce(&WorkerHandle) -> RB + Send,
    ) -> (RA, RB)
    where
        RB: Send,
    {
        let wt = current();
        let depth = wt.depth.get();

        // Deep (small-subtree) fast path: run both halves inline — pure serial recursion,
        // no deque, no atomics, no panic plumbing. The vast majority of joins take this
        // path, so fine-grained nested parallelism is nearly free.
        //
        // An owning worker must also stay inline. It has an in-progress Turbo Task token on
        // its stack, so parking in a fork/join wait can strand that token while the stolen
        // child synchronously waits for it: owner -> child job -> owner. Enforcing this at the
        // scheduler boundary makes the cycle impossible even if a caller bypasses the
        // higher-level `sync_parallel_read` guard. Parallelism still exists between tasks;
        // only nested fork/join inside one task is serialized.
        if wt.inner.sequential
            || (wt.owning.get() && !wt.fork_while_owning.get())
            || depth >= wt.inner.share_depth
        {
            let run = move || {
                wt.depth.set(depth + 1);
                let ra = a(self);
                wt.depth.set(depth + 1); // `a` restored to depth+1; keep it there for `b`
                let rb = b(self);
                wt.depth.set(depth);
                (ra, rb)
            };
            // Guard against stack overflow on very deep chains, checking only periodically
            // so the per-join fast path stays free.
            return if depth.is_multiple_of(STACK_CHECK_INTERVAL) {
                stacker::maybe_grow(STACK_RED_ZONE, STACK_SEGMENT, run)
            } else {
                run()
            };
        }

        // Shallow (big-subtree) path: expose `b` for stealing so the top of the tree
        // fans out across workers.
        wt.depth.set(depth + 1);
        // Token for this forked child, so a wait on it participates in cycle detection.
        let job_token = next_job_token();
        // Propagate owning-ness: if we are computing a task, this forked chunk is part of that
        // computation, so its thief must also be `owning` (not steal unrelated work onto the
        // chunk's stack). Captured now, applied by `run_chunk` on whichever worker runs it.
        let job_owning = wt.owning.get();
        let job = StackJob::new(b);
        wt.push(job.as_job_ref(depth + 1, job_token, job_owning));

        let ra = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| a(self))) {
            Ok(v) => v,
            Err(panic) => {
                // Must drive `b` to completion before unwinding: a thief may hold a
                // pointer into this (about-to-be-destroyed) frame.
                self.wait_for_job(wt, job.latch(), job_token);
                wt.depth.set(depth);
                std::panic::resume_unwind(panic);
            }
        };
        self.wait_for_job(wt, job.latch(), job_token);
        wt.depth.set(depth);
        // SAFETY: the latch is set, so `b` has executed.
        let rb = unsafe { job.into_result() };
        (ra, rb)
    }

    /// Wait for `latch` (a forked child) while keeping this worker useful. We always run
    /// our own queued descendants first (safe — they cannot depend on this `join` frame).
    /// When the deque drains and the child was stolen: in pure fork-join we *help* by
    /// stealing and running other work (rayon-style — full utilization); inside an
    /// `owning` task we instead park with compensation (stealing could self-wait).
    fn wait_for_job(&self, wt: &WorkerThread, latch: &job::Latch, job_token: u64) {
        let may_steal = !wt.owning.get();
        // Record the fork/join dependency edge for ALL workers (owning and non-owning) —
        // otherwise a cross-layer cycle where an owning worker parks on a job owned by a
        // non-owning spinner (which is waiting on a task owned by the first worker) is
        // invisible to `WaitGraph::recheck_wait`, so the `managed_block` side never detects
        // it and the deadline backstop fires instead. We only increment `blocked`/call
        // `compensate` for the owning park path (the non-owning path helps via stealing, so
        // it should not be counted as blocked).
        //
        // We record lazily (once, when we first need to wait) and keep the edge until the
        // latch is set, so the `managed_block` re-check can walk `worker -> job_token ->
        // owner` and close the cycle.
        let mut recorded = false;
        let mut blocked_inc = false;
        while !latch.is_set() {
            if let Some(j) = wt.deque.pop() {
                wt.inner.pending.fetch_sub(1, Relaxed);
                self.run_chunk(wt, j);
            } else if may_steal {
                if !recorded {
                    wt.inner.waits.begin_wait_record(wt.index, job_token);
                    recorded = true;
                }
                // Help the pool: steal and run other work until our child lands.
                // `find_job` includes the injector, so this path drains pending dirty
                // tasks that a blocked `managed_block` waiter may be waiting on (strong
                // consistency). Without this, if all owning workers are parked in join,
                // injector work starves.
                match wt.find_job() {
                    Some(j) => self.run_chunk(wt, j),
                    None => {
                        // No work available right now — yield to avoid busy spin, but
                        // remain recorded as waiting on the job so cycle detection can see us.
                        std::thread::yield_now();
                    }
                }
            } else {
                if !recorded {
                    wt.inner.waits.begin_wait_record(wt.index, job_token);
                    recorded = true;
                }
                if !blocked_inc {
                    wt.inner.blocked.fetch_add(1, SeqCst);
                    blocked_inc = true;
                }
                wt.inner.compensate();
                latch.wait();
                // `latch.wait` may have woken spuriously; loop re-checks `is_set` before
                // parking again. Keep `blocked` accounting balanced — decrement only if
                // we incremented, and re-increment on next iteration if we park again.
                if blocked_inc {
                    wt.inner.blocked.fetch_sub(1, SeqCst);
                    blocked_inc = false;
                }
            }
        }
        if blocked_inc {
            wt.inner.blocked.fetch_sub(1, SeqCst);
        }
        if recorded {
            wt.inner.waits.end_wait(wt.index);
        }
    }

    /// Execute a deque job at the depth it was exposed at (carried in the `JobRef`), so
    /// granularity control is preserved — a chunk stolen while already deep inlines instead
    /// of wastefully re-sharing. SAFETY: `j` must be run exactly once (popped/stolen).
    fn run_chunk(&self, wt: &WorkerThread, j: JobRef) {
        let saved = wt.depth.replace(j.depth);
        let saved_owning = wt.owning.get();
        if j.owning {
            wt.owning.set(true);
        }
        let tracked = j.token != 0;
        if tracked {
            wt.inner.waits.begin_compute(j.token, wt.index);
        }
        struct RunChunkGuard<'a> {
            wt: &'a WorkerThread,
            saved: u32,
            saved_owning: bool,
            tracked: bool,
            token: u64,
        }
        impl Drop for RunChunkGuard<'_> {
            fn drop(&mut self) {
                if self.tracked {
                    self.wt.inner.waits.end_compute(self.token);
                }
                self.wt.owning.set(self.saved_owning);
                self.wt.depth.set(self.saved);
            }
        }
        let _guard = RunChunkGuard {
            wt,
            saved,
            saved_owning,
            tracked,
            token: j.token,
        };
        // SAFETY: popped once, executed once. `StackJob::execute` catches its own panics, but
        // `HeapJob::execute` does not — the guard above ensures we still clear the wait-graph
        // and restore owning/depth even on unwind.
        unsafe { j.execute(self) };
        wt.inner.completed.fetch_add(1, Relaxed);
        // Guard drops here, restoring state and clearing job token ownership.
    }

    /// Run `f` with forking enabled even though this worker is computing a task.
    ///
    /// Ordinary `join`s inside an `owning` task body run inline, because most of them are
    /// small and the scheduling overhead would dominate. A deliberate fan-out site — a
    /// module-graph frontier, a `parallel!` over hundreds of items — is the opposite case:
    /// it is the *only* place breadth can come from, since a sync task body cannot suspend
    /// the way an async one can. Wrapping such a site in `scoped_fork` lets its `join`s
    /// expose work to the pool.
    ///
    /// Waiting still parks-and-compensates rather than stealing (see
    /// [`WorkerThread::fork_while_owning`]); only the fork side is unlocked. Restores the
    /// previous value on return, including on unwind, and nests.
    pub fn scoped_fork<R>(&self, f: impl FnOnce(&WorkerHandle) -> R) -> R {
        let wt = current();
        let prev = wt.fork_while_owning.replace(true);
        struct Restore<'a> {
            wt: &'a WorkerThread,
            prev: bool,
        }
        impl Drop for Restore<'_> {
            fn drop(&mut self) {
                self.wt.fork_while_owning.set(self.prev);
            }
        }
        let _restore = Restore { wt, prev };
        f(self)
    }

    /// Map `f` over `items` in parallel via recursive `join` splitting, preserving order.
    pub fn par_map<T, R>(
        &self,
        items: Vec<T>,
        f: impl Fn(&WorkerHandle, T) -> R + Sync + Send,
    ) -> Vec<R>
    where
        T: Send,
        R: Send,
    {
        self.par_map_inner(items, &f)
    }

    fn par_map_inner<T, R>(
        &self,
        mut items: Vec<T>,
        f: &(impl Fn(&WorkerHandle, T) -> R + Sync + Send),
    ) -> Vec<R>
    where
        T: Send,
        R: Send,
    {
        match items.len() {
            0 => Vec::new(),
            1 => vec![f(self, items.pop().unwrap())],
            n => {
                let right = items.split_off(n / 2);
                let (mut l, r) =
                    self.join(|w| w.par_map_inner(items, f), |w| w.par_map_inner(right, f));
                l.extend(r);
                l
            }
        }
    }

    /// Wait for a peer-produced value via managed blocking: keep pool parallelism up
    /// (compensate) while this worker parks, refusing to park if it would close a
    /// dependency cycle. `token` identifies the awaited unit (see [`WorkerHandle::owning`]).
    pub fn managed_block(&self, token: u64, mut blocker: impl Blocker) -> Result<(), Cycle> {
        if blocker.is_releasable() {
            return Ok(());
        }
        let wt = current();
        // Wake-capable blockers are confirmed by the central detector and sleep until
        // completion/cancellation/cycle. Other blockers retain local bounded rechecks.
        let managed_wait = blocker.cycle_waker().map(ManagedWait::new);
        let should_compensate = if let Some(wait) = &managed_wait {
            wt.inner
                .waits
                .begin_managed_wait(wt.index, token, wait.clone())
        } else {
            wt.inner.waits.begin_wait_record(wt.index, token);
            true
        };
        wt.inner.blocked.fetch_add(1, SeqCst);
        if should_compensate {
            wt.inner.compensate();
        }
        // Bail out on cancellation so a cancel can't hang on a wait that will never be
        // released (its producer was itself cancelled). The blocker should wake on cancel
        // (e.g. its event is fired) or use a bounded `block`.
        let mut cycle = false;
        let mut cycle_streak: u32 = 0;
        while !blocker.is_releasable() && !wt.inner.cancelled.load(Relaxed) {
            if managed_wait.as_ref().is_some_and(|wait| wait.has_cycle()) {
                cycle = true;
                break;
            }
            // Fallback for blockers without a targeted wake handle.
            if managed_wait.is_none() && wt.inner.waits.recheck_wait(wt.index, token).is_err() {
                cycle_streak += 1;
                // Require the cycle to persist across consecutive re-checks so a transient
                // transition-window phantom can't trigger a false abort; a genuine deadlock
                // is permanent and clears this bar within a few milliseconds.
                if cycle_streak >= CYCLE_CONFIRM_STREAK {
                    cycle = true;
                    break;
                }
            } else {
                cycle_streak = 0;
            }
            blocker.block(managed_wait.is_none().then_some(CYCLE_RECHECK_INTERVAL));
        }
        wt.inner.blocked.fetch_sub(1, SeqCst);
        wt.inner.waits.end_wait(wt.index);
        if cycle {
            return Err(Cycle);
        }
        if !blocker.is_releasable() {
            // Woke due to cancellation, not completion.
            std::panic::resume_unwind(Box::new(Cancelled));
        }
        Ok(())
    }

    /// Run `f` while declaring this worker is producing `token`, so other workers'
    /// [`WorkerHandle::managed_block`] calls on `token` participate in cycle detection.
    pub fn owning<R>(&self, token: u64, f: impl FnOnce(&WorkerHandle) -> R) -> R {
        let wt = current();
        // Per-worker, scoped: set for the duration of the body and restore the previous value
        // (a task body's `par_map` recurses into more `owning` regions on this same worker, so
        // this nests). While set, this worker's `join` waits park rather than steal.
        //
        // IMPORTANT: must be panic-safe — a panic inside `f` (e.g. a `join` child's panic that
        // `resume_unwind`s to the parent) must not leak the `owner` entry or leave `owning=true`
        // forever. Otherwise the worker becomes OWNS-BUT-IDLE, the token stays marked as owned
        // forever, and depending waiters deadlock with no cycle edge recorded. This is exactly
        // the stall signature observed in `v0/chat` under sync.
        let prev_owning = wt.owning.replace(true);
        wt.inner.waits.begin_compute(token, wt.index);
        struct Guard<'a> {
            inner: &'a Inner,
            token: u64,
            prev_owning: bool,
        }
        impl Drop for Guard<'_> {
            fn drop(&mut self) {
                self.inner.waits.end_compute(self.token);
                CURRENT.with(|c| {
                    let ptr = c.get();
                    if !ptr.is_null() {
                        unsafe {
                            (*ptr).owning.set(self.prev_owning);
                        }
                    }
                });
            }
        }
        let _guard = Guard {
            inner: &wt.inner,
            token,
            prev_owning,
        };
        let r = f(self);
        // Normal return: `Guard::drop` will clear the wait-graph + owning flag. We must
        // `forget` the guard's restore of `owning` is already done by drop, but we need to
        // avoid double-restore? Actually `Drop` restores owning too, so we just let drop do it.
        // But we must prevent `end_compute` running twice — `Guard` does it once, and we skip
        // manual call. So just return, guard drops.
        // (We can't call `mem::forget`, we want drop to run.)
        r
    }

    /// Whether the current computation has been cancelled (via [`Pool::cancel`]).
    pub fn is_cancelled(&self) -> bool {
        current().inner.cancelled.load(Relaxed)
    }

    /// Cancellation checkpoint: if the computation has been cancelled, unwind (caught by
    /// [`Pool::run_cancellable`]). Call this periodically inside long task bodies so a
    /// cancel abandons in-flight work promptly instead of running to completion.
    pub fn check_cancelled(&self) {
        if self.is_cancelled() {
            std::panic::resume_unwind(Box::new(Cancelled));
        }
    }

    /// Spawn fire-and-forget work onto the pool.
    pub fn spawn(&self, f: impl FnOnce(&WorkerHandle) + Send + 'static) {
        current().push(HeapJob::boxed(f).into_job_ref(0));
    }
}

impl Drop for Pool {
    fn drop(&mut self) {
        self.inner.shutdown.store(true, SeqCst);
        let handles: Vec<JoinHandle<()>> = std::mem::take(&mut *self.inner.threads.lock());
        for _ in 0..8 {
            self.inner.sleep.wake_all();
        }
        for h in handles {
            self.inner.sleep.wake_all();
            let _ = h.join();
        }
    }
}
