use std::{
    sync::atomic::{AtomicU32, Ordering},
    time::{Duration, Instant},
};

use criterion::{BatchSize, BenchmarkId, Criterion, black_box};
use turbo_tasks::{ReadConsistency, TurboTasks};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

use super::register;

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
fn busy_turbo(key: u64, duration: Duration) -> () {
    busy_task(duration);
    black_box(key);
}

pub fn overhead(c: &mut Criterion) {
    register();

    let mut group = c.benchmark_group("task_overhead");
    group.sample_size(50);
    // Test durations between 10us and 1ms
    for micros in [1, 10, 50, 100, 500, 1000] {
        let duration = Duration::from_micros(micros);

        group.bench_with_input(BenchmarkId::new("direct", micros), &duration, |b, &d| {
            b.iter(|| busy_task(black_box(d)))
        });

        group.bench_with_input(BenchmarkId::new("turbo", micros), &duration, |b, &d| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();

            b.to_async(rt).iter_custom(|iters| {
                let tt = TurboTasks::new(TurboTasksBackend::new(
                    BackendOptions {
                        storage_mode: None,
                        ..Default::default()
                    },
                    noop_backing_storage(),
                ));
                let tt = tt.clone();
                async move {
                    tt.run_once(async move {
                        let start = Instant::now();
                        for i in 0..iters {
                            busy_turbo(i, d).await?;
                        }
                        Ok(start.elapsed())
                    })
                    .await
                    .unwrap()
                }
            });
        });

        group.bench_with_input(
            BenchmarkId::new("turbo-cached", micros),
            &duration,
            |b, &d| {
                let rt = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                    .unwrap();

                b.to_async(rt).iter_custom(|iters| {
                    let tt = TurboTasks::new(TurboTasksBackend::new(
                        BackendOptions {
                            storage_mode: None,
                            ..Default::default()
                        },
                        noop_backing_storage(),
                    ));
                    let tt = tt.clone();
                    async move {
                        tt.run_once(async move {
                            let start = Instant::now();
                            for _ in 0..iters {
                                busy_turbo(0, d).await?;
                            }
                            Ok(start.elapsed())
                        })
                        .await
                        .unwrap()
                    }
                });
            },
        );
    }
    group.finish();
}
