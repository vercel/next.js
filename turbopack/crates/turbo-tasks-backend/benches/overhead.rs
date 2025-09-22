use std::time::{Duration, Instant};

use criterion::{BenchmarkId, Criterion, black_box};
use futures::{FutureExt, StreamExt, stream::FuturesUnordered};
use tokio::spawn;
use turbo_tasks::{TurboTasks, TurboTasksApi};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

// Tunable task: busy-wait for a given duration
#[inline(never)]
fn busy_task(duration: Duration) {
    let start = Instant::now();
    while start.elapsed() < duration {
        std::hint::spin_loop();
    }
}

// Simulate running the task inside turbo-tasks (replace with actual turbo-tasks API)
#[turbo_tasks::function]
fn busy_turbo(key: u64, duration: Duration) {
    busy_task(black_box(duration));
    black_box(key); // consume the key, we need it to be part of the cache key.
}

pub fn overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("task_overhead");
    group.sample_size(100);

    let rt = tokio::runtime::Builder::new_multi_thread()
        .disable_lifo_slot()
        .worker_threads(1)
        .thread_name("tokio-thread")
        .enable_all()
        .build()
        .unwrap();

    let rt_parallel = tokio::runtime::Builder::new_multi_thread()
        .disable_lifo_slot()
        .thread_name("tokio-parallel-thread")
        .enable_all()
        .build()
        .unwrap();

    // Test durations between 10us and 1ms.  This enables two things
    // 1. ensure that our busy task is working correctly, we should see uncached times scale with
    //    this metric
    // 2. see if there are effects related to how long await points take
    for micros in [1, 10, 100, 1000] {
        let duration = Duration::from_micros(micros);

        group.bench_with_input(BenchmarkId::new("direct", micros), &duration, |b, &d| {
            b.iter(|| busy_task(black_box(d)))
        });

        group.bench_with_input(BenchmarkId::new("tokio", micros), &duration, |b, &d| {
            b.to_async(&rt).iter_custom(move |iters| {
                spawn(async move {
                    let start = Instant::now();
                    for _ in 0..iters {
                        spawn(async move {
                            busy_task(black_box(d));
                        })
                        .await
                        .unwrap();
                    }
                    start.elapsed()
                })
                .then(|r| async { r.unwrap() })
            });
        });

        group.bench_with_input(
            BenchmarkId::new("turbo-uncached", micros),
            &duration,
            |b, &d| {
                run_turbo::<Uncached>(&rt, b, d, false);
            },
        );
        // Same as turbo-uncached but reports the time as measured by turbotasks itself
        // This allows us to understand the cost of the indirection within turbotasks
        group.bench_with_input(
            BenchmarkId::new("turbo-uncached-stats", micros),
            &duration,
            |b, &d| {
                run_turbo_stats(&rt, b, d);
            },
        );

        group.bench_with_input(
            BenchmarkId::new("turbo-cached-same-keys", micros),
            &duration,
            |b, &d| {
                run_turbo::<CachedSame>(&rt, b, d, false);
            },
        );

        group.bench_with_input(
            BenchmarkId::new("turbo-cached-different-keys", micros),
            &duration,
            |b, &d| {
                run_turbo::<CachedDifferent>(&rt, b, d, false);
            },
        );

        group.bench_with_input(
            BenchmarkId::new("tokio-parallel", micros),
            &duration,
            |b, &d| {
                b.to_async(&rt_parallel).iter_custom(move |iters| {
                    spawn(async move {
                        let start = Instant::now();
                        let mut futures = (0..iters)
                            .map(|_| {
                                spawn(async move {
                                    busy_task(black_box(d));
                                })
                            })
                            .collect::<FuturesUnordered<_>>();
                        while futures.next().await.is_some() {}
                        start.elapsed()
                    })
                    .then(|r| async { r.unwrap() })
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("turbo-uncached-parallel", micros),
            &duration,
            |b, &d| {
                run_turbo::<Uncached>(&rt_parallel, b, d, true);
            },
        );
    }
    group.finish();
}

trait TurboMode {
    fn key(index: u64) -> u64;
    fn is_cached() -> bool;
}
struct Uncached;
impl TurboMode for Uncached {
    fn key(index: u64) -> u64 {
        index
    }

    fn is_cached() -> bool {
        false
    }
}
struct CachedSame;
impl TurboMode for CachedSame {
    fn key(_index: u64) -> u64 {
        0
    }

    fn is_cached() -> bool {
        true
    }
}
struct CachedDifferent;
impl TurboMode for CachedDifferent {
    fn key(index: u64) -> u64 {
        index
    }

    fn is_cached() -> bool {
        true
    }
}

fn run_turbo<Mode: TurboMode>(
    rt: &tokio::runtime::Runtime,
    b: &mut criterion::Bencher<'_>,
    d: Duration,
    is_parallel: bool,
) {
    b.to_async(rt).iter_custom(|iters| {
        // It is important to create the tt instance here to ensure the cache is not shared across
        // iterations.
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        ));

        async move {
            tt.run(async move {
                // If cached run once outside the loop to ensure the tasks are cached.
                if Mode::is_cached() {
                    for i in 0..iters {
                        // Precache all possible tasks even if we might only check a few below.
                        // This ensures we are testing a large cache
                        // Do not use Mode::key here, to create a large task set
                        black_box(busy_turbo(i, black_box(d)).await?);
                    }
                }
                if is_parallel {
                    let mut vcs = Vec::with_capacity(iters as usize);
                    let start = Instant::now();
                    vcs.extend(
                        (0..iters).map(|i| black_box(busy_turbo(Mode::key(i), black_box(d)))),
                    );
                    for vc in vcs {
                        vc.await?;
                    }
                    Ok(start.elapsed())
                } else {
                    let start = Instant::now();
                    for i in 0..iters {
                        black_box(busy_turbo(Mode::key(i), black_box(d)).await?);
                    }
                    Ok(start.elapsed())
                }
            })
            .await
            .unwrap()
        }
    });
}

fn run_turbo_stats(rt: &tokio::runtime::Runtime, b: &mut criterion::Bencher<'_>, d: Duration) {
    b.to_async(rt).iter_custom(|iters| {
        // It is important to create the tt instance here to ensure the cache is not shared across
        // iterations.
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        let stats = tt.task_statistics().enable().clone();

        async move {
            tt.run_once(async move {
                for i in 0..iters {
                    black_box(busy_turbo(i, black_box(d)).await?);
                }
                Ok(stats.get(&BUSY_TURBO_FUNCTION).duration)
            })
            .await
            .unwrap()
        }
    });
}
