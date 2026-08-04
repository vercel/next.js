//! Opt-in scheduler counters for the synchronous engine (`TURBO_SYNC_STATS=1`).
//!
//! The question these answer is always the same one: *why are workers idle?* A sync build
//! that is slower than the async one is almost never slower per task — it is slower because
//! the pool has nothing exposed to steal. These counters separate the two candidate causes:
//!
//! * **nothing was published** — `schedule` count is low, or the injector is persistently empty
//!   (see the `queue depth` histogram);
//! * **it was published but the reader ate it first** — `inline claimed` dwarfs `pool claimed`,
//!   i.e. the task that reached a `read!` computed the dependency on its own stack before any idle
//!   worker could pop the job for it.
//!
//! Everything here is `Relaxed` atomics on paths that already do far more expensive work, and
//! the whole module is inert unless the env var is set.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};

macro_rules! counters {
    ($($name:ident => $label:literal),* $(,)?) => {
        $(pub static $name: AtomicU64 = AtomicU64::new(0);)*
        fn all() -> Vec<(&'static str, u64)> {
            vec![$(($label, $name.load(Relaxed))),*]
        }
    };
}

counters! {
    SCHEDULE_CALLS => "schedule() -> job injected",
    PARMAP_CALLS => "sync_parallel_map calls",
    PARMAP_ITEMS => "  ...items",
    PARMAP_SERIAL => "  ...calls that fell back to serial",
    PARMAP_FANNED => "  ...items fanned out to the pool",
    POOL_JOBS_RUN => "pool jobs executed",
    POOL_CLAIMED => "  ...that ran a task body (useful)",
    INLINE_CLAIMED => "read-miss computed inline by the reader",
    MANAGED_BLOCKS => "managed_block parks (waited on a peer)",
    PAR_CALLS => "parallel! calls",
    PAR_ITEMS => "parallel! items",
    PAR_HITS => "  ...cache hits resolved by probe",
    PAR_MISSES => "  ...misses published to the pool",
    PAR_HELP_CLAIMED => "  ...misses claimed by the calling worker",
    TRAV_STREAMS => "streaming graph traversals",
    TRAV_JOBS => "  ...edges jobs published to the pool",
}

static ENABLED: std::sync::LazyLock<bool> =
    std::sync::LazyLock::new(|| std::env::var("TURBO_SYNC_STATS").as_deref() == Ok("1"));

#[inline]
pub fn enabled() -> bool {
    *ENABLED
}

/// Bump a counter, but only when stats are on (so the hot paths pay a predictable-branch
/// load rather than a contended atomic increment in normal builds).
#[inline]
pub fn bump(counter: &AtomicU64) {
    if enabled() {
        counter.fetch_add(1, Relaxed);
    }
}

#[inline]
pub fn bump_by(counter: &AtomicU64, n: u64) {
    if enabled() {
        counter.fetch_add(n, Relaxed);
    }
}

/// Histogram of "how many workers were actually running" and "how deep was the queue",
/// sampled by a background thread. `running[k]` = milliseconds observed with exactly `k`
/// non-parked, non-blocked workers; `running[0]` is the pool sitting idle.
static SAMPLER_STARTED: AtomicBool = AtomicBool::new(false);
const MAX_BUCKET: usize = 64;
static RUNNING_HIST: [AtomicU64; MAX_BUCKET] = [const { AtomicU64::new(0) }; MAX_BUCKET];
static QUEUE_HIST: [AtomicU64; MAX_BUCKET] = [const { AtomicU64::new(0) }; MAX_BUCKET];
static SAMPLES: AtomicU64 = AtomicU64::new(0);

/// Start the background sampler. Idempotent; no-op unless stats are enabled. `snapshot`
/// returns `(running_workers, queued_jobs)`.
pub fn start_sampler(snapshot: fn() -> (usize, usize)) {
    if !enabled() || SAMPLER_STARTED.swap(true, Relaxed) {
        return;
    }
    static TIMELINE: std::sync::LazyLock<bool> =
        std::sync::LazyLock::new(|| std::env::var("TURBO_SYNC_TIMELINE").as_deref() == Ok("1"));
    std::thread::Builder::new()
        .name("tt-sync-stats".into())
        .spawn(move || {
            let t0 = std::time::Instant::now();
            let mut tick = 0u32;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(1));
                let (running, queued) = snapshot();
                RUNNING_HIST[running.min(MAX_BUCKET - 1)].fetch_add(1, Relaxed);
                QUEUE_HIST[queued.min(MAX_BUCKET - 1)].fetch_add(1, Relaxed);
                SAMPLES.fetch_add(1, Relaxed);
                if *TIMELINE {
                    tick += 1;
                    if tick % 50 == 0 {
                        eprintln!(
                            "  [t={:>6.2}s] running={running:>2} queued={queued:>3}",
                            t0.elapsed().as_secs_f64()
                        );
                    }
                }
            }
        })
        .expect("spawn tt-sync-stats");
}

fn hist_line(name: &str, hist: &[AtomicU64; MAX_BUCKET], samples: u64) -> String {
    use std::fmt::Write;
    let mut s = String::new();
    let mut weighted = 0u64;
    let mut nonzero: Vec<(usize, u64)> = Vec::new();
    for (k, slot) in hist.iter().enumerate() {
        let v = slot.load(Relaxed);
        if v > 0 {
            nonzero.push((k, v));
            weighted += (k as u64) * v;
        }
    }
    let mean = if samples > 0 {
        weighted as f64 / samples as f64
    } else {
        0.0
    };
    let _ = write!(s, "  {name} (mean {mean:.2}):");
    for (k, v) in nonzero.iter().take(20) {
        let _ = write!(s, " {k}:{:.0}%", 100.0 * *v as f64 / samples.max(1) as f64);
    }
    s
}

/// Per-task-type execution timing (analysis only, `TURBO_SYNC_STATS=1`). Because sync
/// tasks run inline on the reader's stack, a child's wall time nests inside its parent's
/// — `self_ns` is wall minus the sum of inline-computed children, so it answers "which
/// task bodies own the serial critical path?" rather than "which subtrees are big?".
mod task_time {
    use std::{
        cell::RefCell,
        collections::HashMap,
        sync::{LazyLock, Mutex},
        time::Instant,
    };

    use super::enabled;

    #[derive(Default, Clone, Copy)]
    struct Agg {
        execs: u64,
        wall_ns: u64,
        self_ns: u64,
    }

    static AGG: LazyLock<Mutex<HashMap<String, Agg>>> =
        LazyLock::new(|| Mutex::new(HashMap::new()));

    thread_local! {
        /// Stack of "nanos spent in inline-computed children" accumulators, one frame per
        /// nested task execution on this thread.
        static CHILD_NS: RefCell<Vec<u64>> = const { RefCell::new(Vec::new()) };
    }

    /// Time a task body, resolving its name lazily (only when stats are on, so the hot
    /// path pays a predictable branch rather than a name lookup). Returns a guard; on
    /// drop it records wall/self time under the name and charges this execution's wall
    /// time to the parent frame (if any).
    pub fn time_task_named(name: impl FnOnce() -> String) -> Option<TaskTimer> {
        if !enabled() {
            return None;
        }
        CHILD_NS.with(|s| s.borrow_mut().push(0));
        Some(TaskTimer {
            name: name(),
            start: Instant::now(),
        })
    }

    pub struct TaskTimer {
        name: String,
        start: Instant,
    }

    impl Drop for TaskTimer {
        fn drop(&mut self) {
            let wall = self.start.elapsed().as_nanos() as u64;
            let child = CHILD_NS.with(|s| s.borrow_mut().pop().unwrap_or(0));
            let self_ns = wall.saturating_sub(child);
            CHILD_NS.with(|s| {
                if let Some(top) = s.borrow_mut().last_mut() {
                    *top += wall;
                }
            });
            let mut agg = AGG.lock().unwrap();
            let e = agg.entry(std::mem::take(&mut self.name)).or_default();
            e.execs += 1;
            e.wall_ns += wall;
            e.self_ns += self_ns;
        }
    }

    pub fn dump() {
        let agg = AGG.lock().unwrap();
        if agg.is_empty() {
            return;
        }
        let mut by_self: Vec<_> = agg.iter().collect();
        by_self.sort_by_key(|(_, a)| std::cmp::Reverse(a.self_ns));
        eprintln!("\n=== top task types by SELF time (serial critical path) ===");
        eprintln!(
            "  {:>10} {:>10} {:>8} {:>8}  {}",
            "self_ms", "wall_ms", "execs", "us/exec", "task"
        );
        for (name, a) in by_self.iter().take(30) {
            eprintln!(
                "  {:>10.1} {:>10.1} {:>8} {:>8.1}  {}",
                a.self_ns as f64 / 1e6,
                a.wall_ns as f64 / 1e6,
                a.execs,
                a.self_ns as f64 / 1e3 / a.execs.max(1) as f64,
                name
            );
        }
    }
}

pub use task_time::time_task_named;

/// Print everything collected. Safe to call when stats are off (prints nothing).
pub fn dump() {
    if !enabled() {
        return;
    }
    let samples = SAMPLES.load(Relaxed);
    eprintln!("\n=== sync scheduler stats ===");
    for (label, value) in all() {
        eprintln!("  {label:<48} {value:>12}");
    }
    let inline = INLINE_CLAIMED.load(Relaxed);
    let pooled = POOL_CLAIMED.load(Relaxed);
    let total = inline + pooled;
    if total > 0 {
        eprintln!(
            "  {:<48} {:>11.1}%",
            "task bodies run on the pool (vs inline)",
            100.0 * pooled as f64 / total as f64
        );
    }
    let futile = POOL_JOBS_RUN
        .load(Relaxed)
        .saturating_sub(POOL_CLAIMED.load(Relaxed));
    eprintln!(
        "  {:<48} {:>12}",
        "pool jobs that found nothing to do", futile
    );
    if samples > 0 {
        eprintln!("{}", hist_line("running workers", &RUNNING_HIST, samples));
        eprintln!("{}", hist_line("queued jobs    ", &QUEUE_HIST, samples));
    }
    task_time::dump();
}
