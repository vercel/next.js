//! Benchmarks keyed cell dependencies at scale: `n` reader tasks each read `m` keys of a single
//! keyed cell (a `cell = "keyed"` `FxHashMap<u32, u32>`), so the cell's owner task holds `n * m`
//! keyed dependents and every reader holds `m` keyed dependencies.
//!
//! Read modes (how a reader accesses its `m` keys):
//! - `keyed_reader`: one `map.keyed_reader().await?`, then `m` synchronous `get`s. The provisional
//!   dependency is refined to `m` hashed keyed dependencies when the `KeyedReadRef` is dropped.
//! - `get`: `m` separate `map.get(&key).await?` reads, each registering one keyed dependency.
//! - `full`: one `map.await?` (a single non-keyed dependency), then `m` lookups. Baseline.
//!
//! Key layouts:
//! - `disjoint`: reader `i` reads keys `i * m .. (i + 1) * m`; `k = n * m + 1` keys in total, so
//!   every dependency edge is on a distinct key.
//! - `shared`: all readers read keys `0 .. m`; `k = m + 1`.
//!
//! In both layouts the last key is read by no reader.
//!
//! Scenarios:
//! - `initial`: a fresh backend; the map is computed (not timed), then the root executing all
//!   readers is timed (cold execution incl. registering all dependency edges).
//! - `change_one`: one key read by reader 0 changes (`disjoint`: 1 reader is re-executed, `shared`:
//!   all `n`; `full`: always all `n`). Includes recomputing the map and its key diff.
//! - `change_unread`: the key that no reader reads changes. No reader is re-executed (except in
//!   `full` mode), so this isolates the cost of finding the affected dependents.
//! - `change_all`: every value changes (cell replaced), so all readers re-execute and replace all
//!   their dependency edges.
//!
//! The scenario `change_none` (the map is recomputed to an equal value) gives the map recompute +
//! diff cost without any invalidation, as a baseline for the `change_*` scenarios.
//!
//! Additionally, once per configuration, the memory held by the graph is measured (mimalloc
//! committed bytes and RSS, deltas from before the readers ran), and printed as a line starting
//! with `KEYED_DEPS_MEM` (and appended to the file in `KEYED_DEPS_STATS_FILE`, if set).
//!
//! `KEYED_DEPS_MEMORY_ONLY=1` skips the timed benchmarks (use one process per configuration so the
//! reported peak RSS is meaningful). `KEYED_DEPS_PERSIST=1` additionally snapshots the graph to a
//! persistent backing storage (reporting snapshot time and on-disk bytes per edge) and times a
//! `change_one` after evicting everything, which has to restore the owner task (and its dependents)
//! from disk (`KEYED_DEPS_PERSIST` lines).
//!
//! The grid can be narrowed with env vars (comma separated): `KEYED_DEPS_N`, `KEYED_DEPS_M`,
//! `KEYED_DEPS_MODES`, `KEYED_DEPS_LAYOUTS`, `KEYED_DEPS_SCENARIOS`. The number of worker threads
//! follows `TURBO_TASKS_AVAILABLE_PARALLELISM` (or the available CPUs).
//!
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- keyed_deps
//! KEYED_DEPS_N=1000 KEYED_DEPS_M=10000 TURBO_TASKS_AVAILABLE_PARALLELISM=16 \
//!   taskset -c 0-15 cargo bench -p turbo-tasks-backend --bench mod -- keyed_deps
//! ```

use std::{
    io::Write,
    str::FromStr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use rustc_hash::FxHashMap;
use turbo_tasks::{
    OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc, parallel::available_parallelism,
};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, EvictionMode, GitVersionInfo, StorageMode,
    TurboTasksBackend, noop_backing_storage,
};
use turbo_tasks_malloc::TurboMalloc;

/// Counts reader executions, to report how many readers an invalidation re-executed.
static READER_EXECUTIONS: AtomicU64 = AtomicU64::new(0);

#[turbo_tasks::value]
struct Input {
    /// Changes the value of key 0 (read by reader 0, or by all readers in the `shared` layout).
    one: State<u32>,
    /// Changes the value of the last key, which no reader reads.
    unread: State<u32>,
    /// Changes the values of all keys.
    all: State<u32>,
    /// Forces a recomputation of the map without changing its value.
    none: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn create_input() -> Vc<Input> {
    Input {
        one: State::new(0),
        unread: State::new(0),
        all: State::new(0),
        none: State::new(0),
    }
    .cell()
}

#[turbo_tasks::value(transparent, cell = "keyed")]
struct KeyedMap(FxHashMap<u32, u32>);

fn value_of(key: u32, k: u32, one: u32, unread: u32, all: u32) -> u32 {
    let mut value = key.wrapping_mul(0x9e37_79b9) ^ all;
    if key == 0 {
        value = value.wrapping_add(one);
    }
    if key == k - 1 {
        value = value.wrapping_add(unread);
    }
    value
}

#[turbo_tasks::function]
async fn make_map(input: ResolvedVc<Input>, k: u32) -> Result<Vc<KeyedMap>> {
    let input = input.await?;
    let one = *input.one.get();
    let unread = *input.unread.get();
    let all = *input.all.get();
    let _ = *input.none.get();
    let mut map = FxHashMap::with_capacity_and_hasher(k as usize, Default::default());
    for key in 0..k {
        map.insert(key, value_of(key, k, one, unread, all));
    }
    Ok(Vc::cell(map))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    KeyedReader,
    Get,
    Full,
}

impl Mode {
    fn name(self) -> &'static str {
        match self {
            Mode::KeyedReader => "keyed_reader",
            Mode::Get => "get",
            Mode::Full => "full",
        }
    }
}

impl FromStr for Mode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        Ok(match s {
            "keyed_reader" => Mode::KeyedReader,
            "get" => Mode::Get,
            "full" => Mode::Full,
            _ => return Err(format!("unknown mode {s}")),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Layout {
    Disjoint,
    Shared,
}

impl Layout {
    fn name(self) -> &'static str {
        match self {
            Layout::Disjoint => "disjoint",
            Layout::Shared => "shared",
        }
    }

    /// The total number of keys in the map.
    fn k(self, n: u32, m: u32) -> u32 {
        match self {
            Layout::Disjoint => n * m + 1,
            Layout::Shared => m + 1,
        }
    }

    fn first_key(self, index: u32, m: u32) -> u32 {
        match self {
            Layout::Disjoint => index * m,
            Layout::Shared => 0,
        }
    }
}

impl FromStr for Layout {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        Ok(match s {
            "disjoint" => Layout::Disjoint,
            "shared" => Layout::Shared,
            _ => return Err(format!("unknown layout {s}")),
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Scenario {
    Initial,
    ChangeOne,
    ChangeUnread,
    ChangeAll,
    ChangeNone,
}

impl Scenario {
    fn name(self) -> &'static str {
        match self {
            Scenario::Initial => "initial",
            Scenario::ChangeOne => "change_one",
            Scenario::ChangeUnread => "change_unread",
            Scenario::ChangeAll => "change_all",
            Scenario::ChangeNone => "change_none",
        }
    }
}

impl FromStr for Scenario {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, String> {
        Ok(match s {
            "initial" => Scenario::Initial,
            "change_one" => Scenario::ChangeOne,
            "change_unread" => Scenario::ChangeUnread,
            "change_all" => Scenario::ChangeAll,
            "change_none" => Scenario::ChangeNone,
            _ => return Err(format!("unknown scenario {s}")),
        })
    }
}

/// Reads `m` keys of `map`, starting at `first_key`. `mode` is the `Mode` as `u8` (0 =
/// `keyed_reader`, 1 = `get`, 2 = `full`). `index` only makes the readers distinct tasks (in the
/// `shared` layout all other arguments are equal).
#[turbo_tasks::function]
async fn reader(
    map: ResolvedVc<KeyedMap>,
    index: u32,
    first_key: u32,
    m: u32,
    mode: u8,
) -> Result<Vc<u64>> {
    let _ = index;
    READER_EXECUTIONS.fetch_add(1, Ordering::Relaxed);
    let mut sum = 0u64;
    match mode {
        0 => {
            let reader = map.keyed_reader().await?;
            for key in first_key..first_key + m {
                sum = sum.wrapping_add(reader.get(&key).copied().unwrap_or_default() as u64);
            }
        }
        1 => {
            for key in first_key..first_key + m {
                let value = map.get(&key).await?;
                sum = sum.wrapping_add(value.as_deref().copied().unwrap_or_default() as u64);
            }
        }
        _ => {
            let full = map.await?;
            for key in first_key..first_key + m {
                sum = sum.wrapping_add(full.get(&key).copied().unwrap_or_default() as u64);
            }
        }
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function(operation, root)]
async fn readers_root(
    input: ResolvedVc<Input>,
    n: u32,
    m: u32,
    k: u32,
    shared: bool,
    mode: u8,
) -> Result<Vc<u64>> {
    let map = make_map(*input, k).to_resolved().await?;
    let layout = if shared {
        Layout::Shared
    } else {
        Layout::Disjoint
    };
    let values = (0..n)
        .map(|index| reader(*map, index, layout.first_key(index, m), m, mode))
        .try_join()
        .await?;
    Ok(Vc::cell(
        values
            .iter()
            .fold(0u64, |sum, value| sum.wrapping_add(**value)),
    ))
}

/// Only computes the map (not timed part of `initial`).
#[turbo_tasks::function(operation, root)]
async fn map_root(input: ResolvedVc<Input>, k: u32) -> Result<Vc<u32>> {
    Ok(Vc::cell(make_map(*input, k).await?.len() as u32))
}

#[derive(Clone, Copy, Debug)]
struct Config {
    n: u32,
    m: u32,
    mode: Mode,
    layout: Layout,
}

impl Config {
    fn k(&self) -> u32 {
        self.layout.k(self.n, self.m)
    }

    fn edges(&self) -> u64 {
        match self.mode {
            Mode::Full => self.n as u64,
            _ => self.n as u64 * self.m as u64,
        }
    }

    fn root(&self, input: ResolvedVc<Input>) -> OperationVc<u64> {
        readers_root(
            input,
            self.n,
            self.m,
            self.k(),
            self.layout == Layout::Shared,
            self.mode as u8,
        )
    }
}

fn env_list<T: FromStr>(name: &str, default: &[T]) -> Vec<T>
where
    T: Clone,
    T::Err: std::fmt::Debug,
{
    match std::env::var(name) {
        Ok(value) if !value.is_empty() => value
            .split(',')
            .map(|s| s.trim().parse().unwrap_or_else(|e| panic!("{name}: {e:?}")))
            .collect(),
        _ => default.to_vec(),
    }
}

fn create_tt() -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            ..Default::default()
        },
        noop_backing_storage(),
    ))
}

fn create_persistent_tt() -> (Arc<TurboTasks<TurboTasksBackend>>, tempfile::TempDir) {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    let dir = tempfile::Builder::new()
        .prefix("keyed-deps-bench-")
        .tempdir_in(&parent)
        .unwrap();
    let tt = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            // Snapshots are only taken explicitly (`snapshot_and_evict_for_testing`).
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            dir.path(),
            &GitVersionInfo {
                describe: "bench-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_ci: false,
                is_short_session: true,
                skip_compaction: true,
            },
        )
        .unwrap()
        .0,
    ));
    (tt, dir)
}

fn dir_size(path: &std::path::Path) -> u64 {
    std::fs::read_dir(path)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| match entry.metadata() {
                    Ok(meta) if meta.is_dir() => dir_size(&entry.path()),
                    Ok(meta) => meta.len(),
                    Err(_) => 0,
                })
                .sum()
        })
        .unwrap_or_default()
}

/// Peak RSS of the process (`VmHWM`), in bytes.
fn peak_rss() -> u64 {
    std::fs::read_to_string("/proc/self/status")
        .ok()
        .and_then(|status| {
            status
                .lines()
                .find(|line| line.starts_with("VmHWM:"))
                .and_then(|line| line.split_whitespace().nth(1)?.parse::<u64>().ok())
        })
        .map_or(0, |kb| kb * 1024)
}

/// Persistence: snapshots the graph (timed), reports the on-disk size, then evicts everything and
/// changes one key (timed), so the invalidation has to restore the map's owner task with all its
/// dependents from disk.
fn run_persistence(rt: &tokio::runtime::Runtime, config: Config) {
    let (tt, dir) = rt.block_on(async { create_persistent_tt() });
    let input_op = rt
        .block_on(tt.run_once(async move {
            let input_op = create_input();
            let input = input_op.resolve().strongly_consistent().await?;
            config.root(input).read_strongly_consistent().await?;
            Ok(input_op)
        }))
        .unwrap();
    let size_before = dir_size(dir.path());
    let start = Instant::now();
    {
        let _guard = rt.enter();
        tt.backend().snapshot_and_evict_for_testing(&tt);
    }
    let snapshot = start.elapsed();
    let size = dir_size(dir.path()).saturating_sub(size_before);
    let mut change_evicted = Duration::ZERO;
    for generation in 1..=3u32 {
        {
            let _guard = rt.enter();
            tt.backend().snapshot_and_evict_for_testing(&tt);
        }
        change_evicted += rt
            .block_on(tt.run_once(async move {
                let input = input_op.resolve().strongly_consistent().await?;
                let state = input_op.read_strongly_consistent().await?;
                let start = Instant::now();
                state.one.set(generation);
                config.root(input).read_strongly_consistent().await?;
                Ok(start.elapsed())
            }))
            .unwrap();
    }
    report(format!(
        "KEYED_DEPS_PERSIST threads={} mode={} layout={} n={} m={} k={} edges={} \
         snapshot_ms={:.3} disk_bytes={} disk_per_edge={:.2} change_one_evicted_ms={:.3}",
        available_parallelism().map_or(1, |p| p.get()),
        config.mode.name(),
        config.layout.name(),
        config.n,
        config.m,
        config.k(),
        config.edges(),
        snapshot.as_secs_f64() * 1000.0,
        size,
        size as f64 / config.edges() as f64,
        change_evicted.as_secs_f64() * 1000.0 / 3.0,
    ));
    rt.block_on(async { tt.stop_and_wait().await });
}

fn runtime() -> tokio::runtime::Runtime {
    let threads = available_parallelism().map_or(1, |p| p.get());
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(threads)
        .enable_all()
        .build()
        .unwrap()
}

/// Memory measurement in bytes, after asking mimalloc to return freed memory.
fn memory() -> (usize, usize) {
    TurboMalloc::collect(true);
    (
        TurboMalloc::memory_usage(),
        TurboMalloc::memory_footprint().unwrap_or_default(),
    )
}

fn report(line: String) {
    eprintln!("{line}");
    if let Ok(path) = std::env::var("KEYED_DEPS_STATS_FILE") {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .unwrap();
        writeln!(file, "{line}").unwrap();
    }
}

/// Runs the map computation (not timed) and then the readers (timed) on a fresh backend. Returns
/// the duration of the readers and the backend.
fn run_initial(
    rt: &tokio::runtime::Runtime,
    config: Config,
    measure_memory: bool,
) -> (Duration, Arc<TurboTasks<TurboTasksBackend>>) {
    let tt = rt.block_on(async { create_tt() });
    let k = config.k();
    let input = rt
        .block_on(tt.run_once(async move {
            let input_op = create_input();
            let input = input_op.resolve().strongly_consistent().await?;
            map_root(input, k).read_strongly_consistent().await?;
            Ok(input)
        }))
        .unwrap();
    let before = measure_memory.then(memory);
    let start = Instant::now();
    rt.block_on(tt.run_once(async move {
        config.root(input).read_strongly_consistent().await?;
        Ok(())
    }))
    .unwrap();
    let elapsed = start.elapsed();
    if let Some((commit_before, rss_before)) = before {
        let (commit_after, rss_after) = memory();
        let commit = commit_after.saturating_sub(commit_before);
        let rss = rss_after.saturating_sub(rss_before);
        report(format!(
            "KEYED_DEPS_MEM threads={} mode={} layout={} n={} m={} k={} edges={} initial_ms={:.3} \
             commit_delta={} rss_delta={} commit_per_edge={:.1} rss_per_edge={:.1} \
             commit_per_task={:.1} peak_rss={}",
            available_parallelism().map_or(1, |p| p.get()),
            config.mode.name(),
            config.layout.name(),
            config.n,
            config.m,
            k,
            config.edges(),
            elapsed.as_secs_f64() * 1000.0,
            commit,
            rss,
            commit as f64 / config.edges() as f64,
            rss as f64 / config.edges() as f64,
            commit as f64 / config.n as f64,
            peak_rss(),
        ));
    }
    (elapsed, tt)
}

pub fn keyed_deps(c: &mut Criterion) {
    let ns = env_list("KEYED_DEPS_N", &[1u32, 10, 100, 1_000]);
    let ms = env_list("KEYED_DEPS_M", &[1u32, 10, 100, 1_000, 10_000]);
    let modes = env_list(
        "KEYED_DEPS_MODES",
        &[Mode::KeyedReader, Mode::Get, Mode::Full],
    );
    let layouts = env_list("KEYED_DEPS_LAYOUTS", &[Layout::Disjoint, Layout::Shared]);
    let scenarios = env_list(
        "KEYED_DEPS_SCENARIOS",
        &[
            Scenario::Initial,
            Scenario::ChangeOne,
            Scenario::ChangeUnread,
            Scenario::ChangeAll,
            Scenario::ChangeNone,
        ],
    );
    let threads = available_parallelism().map_or(1, |p| p.get());
    // Only measure memory (and persistence), without the timed benchmarks. Use one process per
    // configuration so that the reported peak RSS belongs to that configuration.
    let memory_only = std::env::var_os("KEYED_DEPS_MEMORY_ONLY").is_some();
    // Also measure the snapshot size and the cost of invalidating one key after eviction.
    let persistence = std::env::var_os("KEYED_DEPS_PERSIST").is_some();

    let mut group = c.benchmark_group("turbo_tasks_backend_keyed_deps");
    group.sample_size(10);
    group.warm_up_time(Duration::from_millis(500));
    group.measurement_time(Duration::from_secs(3));

    for &layout in &layouts {
        for &mode in &modes {
            for &n in &ns {
                for &m in &ms {
                    let config = Config { n, m, mode, layout };
                    let rt = runtime();
                    // Memory, once per configuration.
                    {
                        let (_, tt) = run_initial(&rt, config, true);
                        rt.block_on(async { tt.stop_and_wait().await });
                        drop(tt);
                    }
                    if persistence {
                        run_persistence(&rt, config);
                    }
                    if memory_only {
                        continue;
                    }
                    for &scenario in &scenarios {
                        group.throughput(Throughput::Elements(config.edges()));
                        let id = BenchmarkId::new(
                            format!(
                                "{}/{}/{}/t{threads}",
                                scenario.name(),
                                layout.name(),
                                mode.name()
                            ),
                            format!("n{n}_m{m}"),
                        );
                        if scenario == Scenario::Initial {
                            group.bench_function(id, |b| {
                                b.iter_custom(|iters| {
                                    let mut total = Duration::ZERO;
                                    for _ in 0..iters {
                                        let (elapsed, tt) = run_initial(&rt, config, false);
                                        total += elapsed;
                                        rt.block_on(async { tt.stop_and_wait().await });
                                    }
                                    total
                                })
                            });
                            continue;
                        }
                        // Build the graph once (not timed), then change the input repeatedly.
                        let tt = rt.block_on(async { create_tt() });
                        let input_op = rt
                            .block_on(tt.run_once(async move {
                                let input_op = create_input();
                                let input = input_op.resolve().strongly_consistent().await?;
                                config.root(input).read_strongly_consistent().await?;
                                Ok(input_op)
                            }))
                            .unwrap();
                        let mut generation = 0u32;
                        let mut executions = 0u64;
                        let mut changes = 0u64;
                        group.bench_function(id, |b| {
                            b.iter_custom(|iters| {
                                let mut total = Duration::ZERO;
                                for _ in 0..iters {
                                    generation += 1;
                                    let value = generation;
                                    let before = READER_EXECUTIONS.load(Ordering::Relaxed);
                                    total += rt
                                        .block_on(tt.run_once(async move {
                                            let input =
                                                input_op.resolve().strongly_consistent().await?;
                                            let state = input_op.read_strongly_consistent().await?;
                                            let start = Instant::now();
                                            match scenario {
                                                Scenario::ChangeOne => state.one.set(value),
                                                Scenario::ChangeUnread => state.unread.set(value),
                                                Scenario::ChangeAll => state.all.set(value),
                                                Scenario::ChangeNone => state.none.set(value),
                                                Scenario::Initial => unreachable!(),
                                            }
                                            config.root(input).read_strongly_consistent().await?;
                                            Ok(start.elapsed())
                                        }))
                                        .unwrap();
                                    executions +=
                                        READER_EXECUTIONS.load(Ordering::Relaxed) - before;
                                    changes += 1;
                                }
                                total
                            })
                        });
                        report(format!(
                            "KEYED_DEPS_RERUN threads={threads} scenario={} mode={} layout={} \
                             n={n} m={m} reruns_per_change={:.2}",
                            scenario.name(),
                            mode.name(),
                            layout.name(),
                            executions as f64 / changes.max(1) as f64,
                        ));
                        rt.block_on(async { tt.stop_and_wait().await });
                    }
                }
            }
        }
    }

    group.finish();
}
