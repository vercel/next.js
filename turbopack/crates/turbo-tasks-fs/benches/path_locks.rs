#[allow(unused_imports)] // Inline unit tests are not run by the benchmark harness.
#[path = "../src/mutex_map.rs"]
mod mutex_map;

use std::{path::PathBuf, sync::Arc, thread, time::Instant};

use criterion::{BenchmarkId, Criterion, Throughput};
use futures::executor::block_on;
use mutex_map::MutexMap;

pub fn overhead(c: &mut Criterion) {
    let mut group = c.benchmark_group("filesystem_path_locks");
    for workers in [1, 6] {
        group.throughput(Throughput::Elements(workers));
        group.bench_with_input(
            BenchmarkId::from_parameter(workers),
            &workers,
            |b, &workers| {
                let map = MutexMap::<Arc<PathBuf>>::default();
                b.iter_custom(|iters| {
                    let start = Instant::now();
                    thread::scope(|scope| {
                        for worker in 0..workers {
                            let map = &map;
                            scope.spawn(move || {
                                let path = Arc::new(PathBuf::from(format!(
                                    "/project/node_modules/package-{worker}/dist/index.js"
                                )));
                                for _ in 0..iters {
                                    let guard = block_on(map.lock(path.clone()));
                                    std::hint::black_box(&guard);
                                    drop(guard);
                                }
                            });
                        }
                    });
                    start.elapsed()
                });
            },
        );
    }
    group.finish();
}
