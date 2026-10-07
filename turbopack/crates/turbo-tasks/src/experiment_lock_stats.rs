//! EXPERIMENT (not for merge): opt-in instrumentation of the PriorityRunner queue mutex and of
//! graph traversal width, to separate lock contention from lack of available work.
//!
//! Enabled by `TURBO_TASKS_EXPERIMENT_LOCK_STATS=<output file>`. A background thread writes one
//! JSON line every 250ms with deltas since the previous line (counters) and gauges.

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

#[derive(Clone, Copy)]
#[repr(usize)]
pub enum Site {
    Schedule = 0,
    Claim = 1,
    PopFromWorker = 2,
    SpawnIfAvailable = 3,
}
const SITES: [&str; 4] = ["schedule", "claim", "pop_from_worker", "spawn_if_available"];

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

pub static SITE_STATS: [SiteStats; 4] = [
    SiteStats::new(),
    SiteStats::new(),
    SiteStats::new(),
    SiteStats::new(),
];

/// Successful pops / claims (work handed out) and pops that found the queue empty.
pub static POP_HIT: AtomicU64 = AtomicU64::new(0);
pub static POP_EMPTY: AtomicU64 = AtomicU64::new(0);
pub static CLAIM_HIT: AtomicU64 = AtomicU64::new(0);
pub static CLAIM_MISS: AtomicU64 = AtomicU64::new(0);
pub static PUSHES: AtomicU64 = AtomicU64::new(0);
pub static SPAWNS_DIRECT: AtomicU64 = AtomicU64::new(0);
/// Gauges, updated under the queue lock / by the runner.
pub static QUEUE_LEN: AtomicUsize = AtomicUsize::new(0);
pub static QUEUE_LEN_MAX: AtomicUsize = AtomicUsize::new(0);
/// Live queued items (excluding tombstones of claimed items).
pub static QUEUE_LIVE: AtomicUsize = AtomicUsize::new(0);
pub static QUEUE_LIVE_MAX: AtomicUsize = AtomicUsize::new(0);
pub static QUEUE_LIVE_MIN: AtomicUsize = AtomicUsize::new(usize::MAX);
pub static ACTIVE_WORKERS: AtomicUsize = AtomicUsize::new(0);
pub static TARGET_WORKERS: AtomicUsize = AtomicUsize::new(0);
/// Graph traversal: number of edge futures currently in flight (frontier width), and
/// number of completed edge futures.
pub static TRAVERSAL_IN_FLIGHT: AtomicUsize = AtomicUsize::new(0);
pub static TRAVERSAL_IN_FLIGHT_MAX: AtomicUsize = AtomicUsize::new(0);
pub static TRAVERSAL_COMPLETED: AtomicU64 = AtomicU64::new(0);
/// Local deferred-schedule slot (see `priority_runner::local_slot`).
pub static SLOT_PUT: AtomicU64 = AtomicU64::new(0);
pub static SLOT_HIT: AtomicU64 = AtomicU64::new(0);
pub static SLOT_MISS: AtomicU64 = AtomicU64::new(0);
pub static SLOT_FLUSH_POLL_END: AtomicU64 = AtomicU64::new(0);
pub static SLOT_FLUSH_BLOCKING: AtomicU64 = AtomicU64::new(0);
/// Adaptive mode decided not to park because the shared queue had no live items.
pub static SLOT_ADAPTIVE_SKIP: AtomicU64 = AtomicU64::new(0);

pub fn count(counter: &AtomicU64) {
    if *ENABLED {
        counter.fetch_add(1, Ordering::Relaxed);
    }
}

/// Pushes a task parked in this thread's local deferred-schedule slot to the shared queue. Must be
/// called before blocking the current thread on something another task may need to produce.
pub fn flush_local_slot() {
    crate::priority_runner::local_slot::flush(
        crate::priority_runner::local_slot::FlushReason::Blocking,
    );
}

pub fn record_queue_len(heap_len: usize, live: usize) {
    QUEUE_LEN.store(heap_len, Ordering::Relaxed);
    QUEUE_LEN_MAX.fetch_max(heap_len, Ordering::Relaxed);
    QUEUE_LIVE.store(live, Ordering::Relaxed);
    QUEUE_LIVE_MAX.fetch_max(live, Ordering::Relaxed);
    QUEUE_LIVE_MIN.fetch_min(live, Ordering::Relaxed);
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

/// Lock `mutex`, recording acquisition, contention and wait time for `site`. The returned guard
/// records hold time on drop.
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
            let mut prev = [[0u64; 4]; 4];
            let mut prev_misc = [0u64; 13];
            loop {
                std::thread::sleep(Duration::from_millis(250));
                let t_ms = start.elapsed().as_millis();
                let mut sites = String::new();
                for (i, s) in SITE_STATS.iter().enumerate() {
                    let cur = [
                        s.acquires.load(Ordering::Relaxed),
                        s.contended.load(Ordering::Relaxed),
                        s.wait_ns.load(Ordering::Relaxed),
                        s.guarded_ns.load(Ordering::Relaxed),
                    ];
                    let d: Vec<u64> = cur.iter().zip(prev[i]).map(|(c, p)| c - p).collect();
                    prev[i] = cur;
                    if i > 0 {
                        sites.push(',');
                    }
                    sites.push_str(&format!(
                        "\"{}\":{{\"acq\":{},\"cont\":{},\"wait_us\":{},\"guarded_us\":{}}}",
                        SITES[i],
                        d[0],
                        d[1],
                        d[2] / 1000,
                        d[3] / 1000
                    ));
                }
                let misc_cur = [
                    POP_HIT.load(Ordering::Relaxed),
                    POP_EMPTY.load(Ordering::Relaxed),
                    CLAIM_HIT.load(Ordering::Relaxed),
                    CLAIM_MISS.load(Ordering::Relaxed),
                    PUSHES.load(Ordering::Relaxed),
                    SPAWNS_DIRECT.load(Ordering::Relaxed),
                    TRAVERSAL_COMPLETED.load(Ordering::Relaxed),
                    SLOT_PUT.load(Ordering::Relaxed),
                    SLOT_HIT.load(Ordering::Relaxed),
                    SLOT_MISS.load(Ordering::Relaxed),
                    SLOT_FLUSH_POLL_END.load(Ordering::Relaxed),
                    SLOT_FLUSH_BLOCKING.load(Ordering::Relaxed),
                    SLOT_ADAPTIVE_SKIP.load(Ordering::Relaxed),
                ];
                let md: Vec<u64> = misc_cur.iter().zip(prev_misc).map(|(c, p)| c - p).collect();
                prev_misc = misc_cur;
                let live_min = QUEUE_LIVE_MIN.swap(usize::MAX, Ordering::Relaxed);
                let marks: Vec<(&'static str, u128)> = std::mem::take(&mut *MARKS.lock());
                let marks_json = marks
                    .iter()
                    .map(|(n, t)| format!("[\"{n}\",{t}]"))
                    .collect::<Vec<_>>()
                    .join(",");
                let _ = writeln!(
                    file,
                    "{{\"t_ms\":{t_ms},\"unix_start_ms\":{unix_start_ms},\"marks\":[{marks_json}],\
                     \"sites\":{{{sites}}},\"pop_hit\":{},\"pop_empty\":{},\"claim_hit\":{},\"\
                     claim_miss\":{},\"pushes\":{},\"spawns_direct\":{},\"traversal_completed\":\
                     {},\"slot_put\":{},\"slot_hit\":{},\"slot_miss\":{},\"slot_flush_poll_end\":\
                     {},\"slot_flush_blocking\":{},\"slot_adaptive_skip\":{},\"queue_len\":{},\"\
                     queue_len_max\":{},\"queue_live\":{},\"queue_live_max\":{},\"queue_live_min\"\
                     :{},\"active_workers\":{},\"target_workers\":{},\"traversal_in_flight\":{},\"\
                     traversal_in_flight_max\":{}}}",
                    md[0],
                    md[1],
                    md[2],
                    md[3],
                    md[4],
                    md[5],
                    md[6],
                    md[7],
                    md[8],
                    md[9],
                    md[10],
                    md[11],
                    md[12],
                    QUEUE_LEN.load(Ordering::Relaxed),
                    QUEUE_LEN_MAX.swap(0, Ordering::Relaxed),
                    QUEUE_LIVE.load(Ordering::Relaxed),
                    QUEUE_LIVE_MAX.swap(0, Ordering::Relaxed),
                    if live_min == usize::MAX {
                        -1
                    } else {
                        live_min as i64
                    },
                    ACTIVE_WORKERS.load(Ordering::Relaxed),
                    TARGET_WORKERS.load(Ordering::Relaxed),
                    TRAVERSAL_IN_FLIGHT.load(Ordering::Relaxed),
                    TRAVERSAL_IN_FLIGHT_MAX.swap(0, Ordering::Relaxed),
                );
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
