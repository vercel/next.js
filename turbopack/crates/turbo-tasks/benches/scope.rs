use std::time::{Duration, Instant};

use criterion::{BenchmarkId, Criterion, black_box};
use turbo_tasks::parallel;

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

// Tunable task: busy-wait for a given duration
#[inline(never)]
fn busy_task<T>(duration: Duration, result: T) -> T {
    let start = Instant::now();
    while start.elapsed() < duration {
        std::hint::spin_loop();
    }
    black_box(result) // prevent optimizing away the function
}

fn get_test_cases() -> Vec<(Duration, u32)> {
    let mut cases = Vec::new();
    for item_dur in [30_000] {
        let item_duration = Duration::from_nanos(item_dur);
        for item_count in [10, 30, 100, 300, 1000, 3000, 10_000, 30_000, 100_000] {
            let total_duration = item_duration * item_count * 20;
            if total_duration > Duration::from_secs(20) {
                // Skip very long runs
                continue;
            }
            cases.push((item_duration, item_count));
        }
    }
    cases
}

pub fn overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("scope_overhead");
    group.sample_size(20);

    let rt = tokio::runtime::Builder::new_multi_thread()
        .disable_lifo_slot()
        .thread_name("tokio-thread")
        .enable_all()
        .build()
        .unwrap();

    for (item_duration, item_count) in get_test_cases() {
        group.bench_with_input(
            BenchmarkId::new(format!("parallel {item_duration:?}"), item_count),
            &item_count,
            |b, &d| {
                let items = (0..d).collect::<Vec<_>>();
                b.to_async(&rt).iter(|| async {
                    let result: Vec<_> =
                        parallel::map_collect(&items, |&i| black_box(busy_task(item_duration, i)));
                    result
                });
            },
        );
    }

    for (item_duration, item_count) in get_test_cases() {
        group.bench_with_input(
            BenchmarkId::new(format!("single_threaded {item_duration:?}"), item_count),
            &item_count,
            |b, &d| {
                let items = (0..d).collect::<Vec<_>>();
                b.iter(|| {
                    items
                        .iter()
                        .map(|&i| black_box(busy_task(item_duration, i)))
                        .collect::<Vec<_>>()
                });
            },
        );
    }
}
