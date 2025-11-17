use anyhow::Result;
use criterion::{BenchmarkId, Criterion};
use turbo_tasks::{Completion, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

pub fn scope_stress(c: &mut Criterion) {
    if matches!(
        std::env::var("TURBOPACK_BENCH_STRESS").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    ) {
        return;
    }

    let mut group = c.benchmark_group("turbo_tasks_backend_scope_stress");
    group.sample_size(20);

    for size in [5, 10, 15, 20, 25, 30, 100, 200, 300] {
        group.throughput(criterion::Throughput::Elements(
            /* tasks for fib from 0 to size - 1 = */
            (size as u64) * (size as u64) +
            /* root tasks = */
            (2 * size as u64)
                - 1,
        ));
        group.bench_with_input(
            BenchmarkId::new("rectangle", format_args!("{size} x {size}")),
            &size,
            |b, size| {
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
                        (0..size)
                            .map(|a| (a, size - 1))
                            .chain((0..size - 1).map(|b| (size - 1, b)))
                            .map(|(a, b)| {
                                let tt = &tt;
                                async move {
                                    Ok(tt
                                        .run(async move {
                                            rectangle(a, b).strongly_consistent().await?;
                                            Ok(())
                                        })
                                        .await?)
                                }
                            })
                            .try_join()
                            .await
                            .unwrap();

                        tt
                    }
                })
            },
        );
    }
}

/// This fills a rectagle from (0, 0) to (a, b) by
/// first filling (0, 0) to (a - 1, b) and then (0, 0) to (a, b - 1) recursively
#[turbo_tasks::function]
async fn rectangle(a: u32, b: u32) -> Result<Vc<Completion>> {
    if a > 0 {
        rectangle(a - 1, b).await?;
    }
    if b > 0 {
        rectangle(a, b - 1).await?;
    }
    Ok(Completion::new())
}
