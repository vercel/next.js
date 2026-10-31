//! Isolated aggregation-queue removals, not task execution or end-to-end aggregation.
//!
//! ```bash
//! # Ten routine cases (placements × job shapes, plus a follower-map boundary case).
//! TURBOPACK_BENCH_AGGREGATION_QUEUE=1 cargo bench -p turbo-tasks-backend --bench mod -- aggregation_queue
//! # Full matrix; pass a Criterion filter to select cases, or --test to smoke-test each once.
//! TURBOPACK_BENCH_AGGREGATION_QUEUE=extended cargo bench -p turbo-tasks-backend --bench mod -- --test aggregation_queue
//! ```
//!
//! Each interval includes removal payload allocation, context/queue construction and draining all
//! removal jobs/effects. Backend/runtime construction, additions and state checks are excluded.
//! The fixture uses restored tasks, no backing storage, one backend worker and disabled
//! aggregation-number optimizations. `edges` is total edges; `followers` is follower-side
//! cardinality (not a guarantee of backing representation after arbitrary map histories).
//!
//! This Criterion target also enables dev-dependency features. To profile normal-library code
//! without those features, use the same hidden fixture from a normal dependency in an external
//! driver and inspect its actual feature graph.

use std::{
    hint::black_box,
    time::{Duration, Instant},
};

use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks_backend::private::aggregation_queue::{Config, Fixture};

pub fn aggregation_queue(c: &mut Criterion) {
    let extended = match std::env::var("TURBOPACK_BENCH_AGGREGATION_QUEUE").as_deref() {
        Ok("1") => false,
        Ok("extended") => true,
        _ => return,
    };
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
        .unwrap();
    let mut group = c.benchmark_group("aggregation_queue");
    group
        .sample_size(30)
        .warm_up_time(Duration::from_secs(1))
        .measurement_time(Duration::from_secs(3));
    for config in Config::cases(extended) {
        let fixture = {
            let _entered = runtime.enter();
            Fixture::new(config)
        };
        group.throughput(Throughput::Elements(config.edges as u64));
        group.bench_function(BenchmarkId::from_parameter(config.name()), |b| {
            b.iter_custom(|iters| {
                let mut elapsed = Duration::ZERO;
                for _ in 0..iters {
                    let start = Instant::now();
                    black_box(&fixture).remove();
                    elapsed += start.elapsed();
                    fixture.check_removed();
                    fixture.restore();
                    fixture.check_restored();
                }
                elapsed
            });
        });
        fixture.check_restored();
        runtime.block_on(fixture.shutdown());
    }
    group.finish();
}
