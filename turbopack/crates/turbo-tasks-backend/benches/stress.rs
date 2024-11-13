use anyhow::Result;
use criterion::{BenchmarkId, Criterion};
use turbo_tasks::{ReadConsistency, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{noop_backing_storage, BackendOptions, TurboTasksBackend};

use super::register;

pub fn fibonacci(c: &mut Criterion) {
    if matches!(
        std::env::var("TURBOPACK_BENCH_STRESS").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    ) {
        return;
    }

    register();

    let mut group = c.benchmark_group("turbo_tasks_backend_stress");
    group.sample_size(20);

    for size in [100, 200, 500, 1000, 1414] {
        group.throughput(criterion::Throughput::Elements(
            /* tasks for fib from 0 to size - 1 = */
            size as u64 * (size as u64 + 1) / 2 +
            /* root task = */
            1,
        ));
        group.bench_with_input(BenchmarkId::new("fibonacci", size), &size, |b, size| {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap();
            let size = *size;

            b.to_async(rt).iter_with_large_drop(move || {
                let tt = TurboTasks::new(TurboTasksBackend::new(
                    BackendOptions {
                        storage_mode: None,
                        ..Default::default()
                    },
                    noop_backing_storage(),
                ));
                async move {
                    let task = tt.spawn_once_task(async move {
                        // Number of tasks:
                        // 1 root task
                        // size >= 1 => + fib(0) = 1
                        // size >= 2 => + fib(1) = 2
                        (0..size).map(|i| fib(i, i)).try_join().await?;
                        Ok::<Vc<()>, _>(Default::default())
                    });
                    tt.wait_task_completion(task, ReadConsistency::Eventual)
                        .await
                        .unwrap();
                    tt
                }
            })
        });
    }
}

#[turbo_tasks::value(transparent)]
struct FibResult(u64);

// Number of tasks:
// fib(0) = 1 tasks
// fib(1) = 2 tasks
// fib(n) = n + 1 tasks

/// Computes a fibonacci number in a recursive matter. Due to turbo-tasks this
/// will result in a lot of cached tasks, so its performance is only O(n)
/// (compared to non-turbo-tasks O(1.6^N)).
/// This function also has a `key` parameter to allow forcing it to separate
/// cache entries by using different keys.
#[turbo_tasks::function]
async fn fib(i: u32, key: u32) -> Result<Vc<FibResult>> {
    Ok(match i {
        0 => FibResult(1).cell(),
        1 => fib(0, key),
        _ => {
            let a = fib(i - 1, key);
            let b = fib(i - 2, key);
            FibResult(a.await?.wrapping_add(*b.await?)).cell()
        }
    })
}
