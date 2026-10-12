//! EXPERIMENT (not for merge): opt-in instrumentation of the `PriorityRunner` queue (heap mutex,
//! lock-free lowest band, `claimable` map), the local deferred-band slot, and graph traversal
//! width.
//!
//! Enabled by `TURBO_TASKS_EXPERIMENT_LOCK_STATS=<output file>`. A background thread writes one
//! JSON line every 250ms with per-interval deltas of the counters, the heap mutex statistics,
//! gauges and named marks. When the variable is not set, every recording function returns after
//! checking a cached flag.

use std::{
    io::Write,
    sync::{
        LazyLock,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

pub static ENABLED: LazyLock<bool> =
    LazyLock::new(|| std::env::var_os("TURBO_TASKS_EXPERIMENT_LOCK_STATS").is_some());

/// Sites that lock the remaining heap mutex.
#[derive(Clone, Copy)]
#[repr(usize)]
pub enum Site {
    HeapPush = 0,
    HeapPop = 1,
}
const SITES: [&str; 2] = ["heap_push", "heap_pop"];

pub struct SiteStats {
    pub acquires: AtomicU64,
    pub contended: AtomicU64,
    /// Time spent inside contended `lock()` calls (spinning, sleeping, or runnable-but-preempted).
    pub wait_ns: AtomicU64,
    /// Time from acquisition to the start of guard drop. This is the guarded body only; it
    /// excludes the unlock itself (including any futex wake), so it is NOT mutex occupancy.
    pub guarded_ns: AtomicU64,
}

impl SiteStats {
    const fn new() -> Self {
        Self {
            acquires: AtomicU64::new(0),
            contended: AtomicU64::new(0),
            wait_ns: AtomicU64::new(0),
            guarded_ns: AtomicU64::new(0),
        }
    }
}

pub static SITE_STATS: [SiteStats; 2] = [SiteStats::new(), SiteStats::new()];

macro_rules! counters {
    ($($(#[$doc:meta])* $name:ident => $json:literal,)*) => {
        $($(#[$doc])* pub static $name: AtomicU64 = AtomicU64::new(0);)*
        static COUNTERS: &[(&str, &AtomicU64)] = &[$(($json, &$name),)*];
    };
}

counters! {
    /// `schedule` spawned a worker for the task directly (never queued).
    SPAWN_DIRECT => "spawn_direct",
    /// `schedule` took the queued path (saturated or lost the reservation race).
    SCHEDULE_QUEUED => "schedule_queued",
    /// `claimable` inserts, and inserts that replaced a queued payload.
    MAP_INSERT => "map_insert",
    MAP_REPLACED => "map_replaced",
    /// `Executor::discard` calls for replaced payloads.
    DISCARD => "discard",
    /// Band pushes: lowest band (`ConcurrentQueue`) and heap.
    LOWEST_PUSH => "lowest_push",
    HEAP_PUSH => "heap_push",
    /// Band entries popped from the lowest band, from the heap, and band entries that resolved to
    /// no payload (tombstones: claimed, replaced, or re-queued with another priority).
    LOWEST_POP => "lowest_pop",
    HEAP_POP => "heap_pop",
    POP_TOMBSTONE => "pop_tombstone",
    /// `Queue::pop` calls that returned a payload / found nothing.
    POP_HIT => "pop_hit",
    POP_EMPTY => "pop_empty",
    /// `claim` calls that found / didn't find a queued payload.
    CLAIM_HIT => "claim_hit",
    CLAIM_MISS => "claim_miss",
    /// Local slot: band pushes deferred into the thread-local buffer, deferrals refused because
    /// the buffer was full, and adaptive mode declining because the bands looked empty.
    SLOT_DEFER => "slot_defer",
    SLOT_FULL => "slot_full",
    SLOT_ADAPTIVE_SKIP => "slot_adaptive_skip",
    /// Deferred keys flushed at the end of the outermost worker poll / before a blocking wait,
    /// and flushed keys skipped because their payload was already gone (claimed or popped).
    SLOT_FLUSH_POLL_END => "slot_flush_poll_end",
    SLOT_FLUSH_BLOCKING => "slot_flush_blocking",
    SLOT_FLUSH_SKIP_GONE => "slot_flush_skip_gone",
    /// Graph traversal: completed node expansions.
    TRAVERSAL_COMPLETED => "traversal_completed",
}

/// Gauges. `ACTIVE_WORKERS` is the last value observed at a direct spawn or a worker retirement,
/// not an exact live count of every transition.
pub static ACTIVE_WORKERS: AtomicUsize = AtomicUsize::new(0);
pub static TARGET_WORKERS: AtomicUsize = AtomicUsize::new(0);
/// Graph traversal: number of edge futures currently in flight (frontier width).
pub static TRAVERSAL_IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);
pub static TRAVERSAL_IN_FLIGHT_MAX: AtomicUsize = AtomicUsize::new(0);

#[inline]
pub fn count(counter: &AtomicU64) {
    if *ENABLED {
        counter.fetch_add(1, Ordering::Relaxed);
    }
}

#[inline]
pub fn add(counter: &AtomicU64, n: u64) {
    if *ENABLED && n > 0 {
        counter.fetch_add(n, Ordering::Relaxed);
    }
}

#[inline]
pub fn record_active_workers(n: usize) {
    if *ENABLED {
        ACTIVE_WORKERS.store(n, Ordering::Relaxed);
    }
}

/// Pushes the band entries deferred in this thread's local slot. Must be called before blocking
/// the current thread on something another task may need to produce.
pub fn flush_local_slot() {
    crate::priority_runner::local_slot::flush(
        crate::priority_runner::local_slot::FlushReason::Blocking,
    );
}

/// Named wall-clock marks (e.g. start/end of the whole app module graph), flushed by the dumper.
pub static MARKS: parking_lot::Mutex<Vec<(&'static str, u128)>> =
    parking_lot::Mutex::new(Vec::new());

pub fn mark(name: &'static str) {
    if *ENABLED {
        let unix_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        MARKS.lock().push((name, unix_ms));
    }
}

/// Tracks this traversal's contribution to `TRAVERSAL_IN_FLIGHT`, so that a cancelled or erroring
/// traversal does not leave the global gauge permanently raised.
#[derive(Default)]
pub struct TraversalGauge {
    in_flight: usize,
}

impl TraversalGauge {
    pub fn push(&mut self) {
        if *ENABLED {
            self.in_flight += 1;
            let n = TRAVERSAL_IN_FLIGHT.fetch_add(1, Ordering::Relaxed) + 1;
            TRAVERSAL_IN_FLIGHT_MAX.fetch_max(n, Ordering::Relaxed);
        }
    }

    pub fn complete(&mut self) {
        if *ENABLED {
            self.in_flight -= 1;
            TRAVERSAL_IN_FLIGHT.fetch_sub(1, Ordering::Relaxed);
            TRAVERSAL_COMPLETED.fetch_add(1, Ordering::Relaxed);
        }
    }
}

impl Drop for TraversalGauge {
    fn drop(&mut self) {
        if self.in_flight > 0 {
            TRAVERSAL_IN_FLIGHT.fetch_sub(self.in_flight, Ordering::Relaxed);
        }
    }
}

/// Locks `mutex`, recording acquisition, contention and wait time for `site`. The returned guard
/// records the guarded time on drop.
pub fn lock<'a, T>(mutex: &'a parking_lot::Mutex<T>, site: Site) -> TimedGuard<'a, T> {
    if !*ENABLED {
        return TimedGuard {
            guard: mutex.lock(),
            site,
            acquired: None,
        };
    }
    let stats = &SITE_STATS[site as usize];
    stats.acquires.fetch_add(1, Ordering::Relaxed);
    let guard = match mutex.try_lock() {
        Some(g) => g,
        None => {
            stats.contended.fetch_add(1, Ordering::Relaxed);
            let start = Instant::now();
            let g = mutex.lock();
            stats
                .wait_ns
                .fetch_add(start.elapsed().as_nanos() as u64, Ordering::Relaxed);
            g
        }
    };
    TimedGuard {
        guard,
        site,
        acquired: Some(Instant::now()),
    }
}

pub struct TimedGuard<'a, T> {
    guard: parking_lot::MutexGuard<'a, T>,
    site: Site,
    acquired: Option<Instant>,
}

impl<T> std::ops::Deref for TimedGuard<'_, T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.guard
    }
}

impl<T> std::ops::DerefMut for TimedGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut T {
        &mut self.guard
    }
}

impl<T> Drop for TimedGuard<'_, T> {
    fn drop(&mut self) {
        if let Some(acquired) = self.acquired {
            SITE_STATS[self.site as usize]
                .guarded_ns
                .fetch_add(acquired.elapsed().as_nanos() as u64, Ordering::Relaxed);
        }
    }
}

static DUMPER: LazyLock<()> = LazyLock::new(|| {
    let Some(path) = std::env::var_os("TURBO_TASKS_EXPERIMENT_LOCK_STATS") else {
        return;
    };
    std::thread::Builder::new()
        .name("lock-stats".into())
        .spawn(move || {
            let mut file = std::io::BufWriter::new(std::fs::File::create(path).unwrap());
            let start = Instant::now();
            let unix_start_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis();
            let mut prev_sites = [[0u64; 4]; 2];
            let mut prev_counters = vec![0u64; COUNTERS.len()];
            loop {
                std::thread::sleep(Duration::from_millis(250));
                let t_ms = start.elapsed().as_millis();
                let mut line =
                    format!("{{\"t_ms\":{t_ms},\"unix_start_ms\":{unix_start_ms},\"marks\":[");
                let marks: Vec<(&'static str, u128)> = std::mem::take(&mut *MARKS.lock());
                for (i, (name, unix_ms)) in marks.iter().enumerate() {
                    if i > 0 {
                        line.push(',');
                    }
                    line.push_str(&format!("[\"{name}\",{unix_ms}]"));
                }
                line.push_str("],\"sites\":{");
                for (i, s) in SITE_STATS.iter().enumerate() {
                    let cur = [
                        s.acquires.load(Ordering::Relaxed),
                        s.contended.load(Ordering::Relaxed),
                        s.wait_ns.load(Ordering::Relaxed),
                        s.guarded_ns.load(Ordering::Relaxed),
                    ];
                    let d: Vec<u64> = cur.iter().zip(prev_sites[i]).map(|(c, p)| c - p).collect();
                    prev_sites[i] = cur;
                    if i > 0 {
                        line.push(',');
                    }
                    line.push_str(&format!(
                        "\"{}\":{{\"acq\":{},\"cont\":{},\"wait_us\":{},\"guarded_us\":{}}}",
                        SITES[i],
                        d[0],
                        d[1],
                        d[2] / 1000,
                        d[3] / 1000
                    ));
                }
                line.push('}');
                for (i, (name, counter)) in COUNTERS.iter().enumerate() {
                    let cur = counter.load(Ordering::Relaxed);
                    line.push_str(&format!(",\"{name}\":{}", cur - prev_counters[i]));
                    prev_counters[i] = cur;
                }
                line.push_str(&format!(
                    ",\"active_workers\":{},\"target_workers\":{},\"traversal_in_flight\":{},\"\
                     traversal_in_flight_max\":{}}}",
                    ACTIVE_WORKERS.load(Ordering::Relaxed),
                    TARGET_WORKERS.load(Ordering::Relaxed),
                    TRAVERSAL_IN_FLIGHT.load(Ordering::Relaxed),
                    TRAVERSAL_IN_FLIGHT_MAX.swap(0, Ordering::Relaxed),
                ));
                let _ = writeln!(file, "{line}");
                let _ = file.flush();
            }
        })
        .unwrap();
});

pub fn ensure_dumper() {
    if *ENABLED {
        LazyLock::force(&DUMPER);
    }
}
