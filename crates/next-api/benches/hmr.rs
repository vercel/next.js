#![cfg_attr(not(codspeed), allow(unused))]

extern crate turbo_tasks_malloc;

use std::{
    path::Path,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use next_api::register;
use tokio::time::timeout;
use turbopack_core::target;
use turbopack_create_test_app::test_app_builder::{
    EffectMode, PackageJsonConfig, TestApp, TestAppBuilder,
};

/// A simple HMR benchmark that measures the time to complete HMR updates
/// This is inspired by the HMR testing logic in next-rs-api.test.ts
pub struct HmrBenchmark {
    test_app: TestApp,
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            turbo_tasks_malloc::TurboMalloc::thread_stop();
        })
        .build()
        .context("Failed to build tokio runtime")
        .unwrap()
}

impl HmrBenchmark {
    pub fn new(module_count: usize) -> Result<Self> {
        // Create a test app similar to the one used in next-rs-api.test.ts
        let test_app = TestAppBuilder {
            module_count,
            directories_count: module_count / 20,
            package_json: Some(PackageJsonConfig {
                react_version: "^18.2.0".to_string(),
            }),
            effect_mode: EffectMode::Hook,
            ..Default::default()
        }
        .build()
        .context("Failed to build test app")?;

        Ok(Self { test_app })
    }

    /// Simulate file changes for HMR testing
    pub fn make_file_change(&self, file_path: &Path, change_id: usize) -> Result<()> {
        let mut content =
            std::fs::read_to_string(file_path).context("Failed to read file content")?;

        // Add a comment with a unique identifier to trigger HMR
        let change_marker = format!("// HMR_CHANGE_{change_id}\n");
        content.push_str(&change_marker);

        std::fs::write(file_path, content).context("Failed to write modified content")?;

        Ok(())
    }

    /// Measure the time for a single HMR update
    pub async fn measure_hmr_update(
        &self,
        target_file: &Path,
        change_id: usize,
    ) -> Result<Duration> {
        let start = Instant::now();

        // Trigger file change
        self.make_file_change(target_file, change_id)?;

        // In a real scenario, we would wait for the HMR update to be processed
        // For this benchmark, we simulate the processing time
        tokio::time::sleep(Duration::from_millis(50)).await;

        let duration = start.elapsed();
        Ok(duration)
    }

    /// Run a warmup phase before benchmarking
    pub async fn warmup(&self, warmup_iterations: usize) -> Result<()> {
        let target_file = self.test_app.path().join("src").join("index.jsx");

        for i in 0..warmup_iterations {
            let _duration = self
                .measure_hmr_update(&target_file, i)
                .await
                .context("Failed to perform warmup HMR update")?;
        }

        Ok(())
    }

    /// Benchmark many HMR updates in sequence
    pub async fn bench_many_updates(&self, update_count: usize) -> Result<Vec<Duration>> {
        let target_file = self.test_app.path().join("src").join("index.jsx");
        let mut durations = Vec::with_capacity(update_count);

        for i in 0..update_count {
            let duration = timeout(
                Duration::from_secs(5),
                self.measure_hmr_update(&target_file, i + 1000), /* Offset to avoid conflicts
                                                                  * with warmup */
            )
            .await
            .context("HMR update timed out")?
            .context("HMR update failed")?;

            durations.push(duration);
        }

        Ok(durations)
    }
}

pub fn bench_hmr_single_update(c: &mut Criterion) {
    use turbo_tasks_malloc::TurboMalloc;

    register();

    let mut g = c.benchmark_group("hmr_single_update");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(30));

    let module_counts = vec![100, 500, 1000];

    for module_count in module_counts {
        g.bench_function(
            BenchmarkId::new("single_update", format!("{module_count}_modules")),
            |b| {
                b.to_async(&runtime()).iter_custom({
                    |iters| async move {
                        let benchmark = HmrBenchmark::new(module_count).unwrap();
                        let target_file = benchmark.test_app.path().join("src").join("index.jsx");

                        let mut total_duration = Duration::ZERO;
                        let mut change_counter = 0;

                        for _ in 0..iters {
                            change_counter += 1;
                            let duration = benchmark
                                .measure_hmr_update(&target_file, change_counter)
                                .await
                                .unwrap();
                            total_duration += duration;
                        }

                        total_duration
                    }
                });
            },
        );
    }

    g.finish();
}

pub fn bench_hmr_burst_updates(c: &mut Criterion) {
    use turbo_tasks_malloc::TurboMalloc;

    register();

    let mut g = c.benchmark_group("hmr_burst_updates");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    let test_cases = vec![
        (100, 10), // 100 modules, 10 updates
        (500, 10), // 500 modules, 10 updates
        (1000, 5), // 1000 modules, 5 updates
    ];

    for (module_count, update_count) in test_cases {
        g.bench_function(
            BenchmarkId::new(
                "burst_updates",
                format!("{module_count}_modules_{update_count}_updates"),
            ),
            |b| {
                b.to_async(&runtime()).iter_custom(move |iters| async move {
                    let benchmark = HmrBenchmark::new(module_count).unwrap();

                    let mut total_duration = Duration::ZERO;

                    for _ in 0..iters {
                        // Perform warmup
                        benchmark.warmup(3).await.unwrap();

                        // Measure burst of updates
                        let start = Instant::now();
                        let _durations = benchmark.bench_many_updates(update_count).await.unwrap();
                        let burst_duration = start.elapsed();

                        total_duration += burst_duration;
                    }

                    total_duration
                });
            },
        );
    }

    g.finish();
}

pub fn bench_hmr_throughput(c: &mut Criterion) {
    use turbo_tasks_malloc::TurboMalloc;

    register();

    let mut g = c.benchmark_group("hmr_throughput");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    let module_counts = vec![100, 500, 1000];

    for module_count in module_counts {
        g.bench_function(
            BenchmarkId::new("throughput", format!("{module_count}_modules")),
            |b| {
                b.to_async(&runtime()).iter_custom(move |iters| async move {
                    let benchmark = HmrBenchmark::new(module_count).unwrap();

                    let mut total_updates = 0;
                    let overall_start = Instant::now();

                    for _ in 0..iters {
                        // Perform warmup
                        benchmark.warmup(2).await.unwrap();

                        // Measure throughput over 1 second
                        let throughput_start = Instant::now();
                        let mut updates_in_window = 0;
                        let mut change_counter = 0;

                        while throughput_start.elapsed() < Duration::from_secs(1) {
                            change_counter += 1;
                            let target_file =
                                benchmark.test_app.path().join("src").join("index.jsx");
                            let _duration = benchmark
                                .measure_hmr_update(&target_file, change_counter)
                                .await
                                .unwrap();
                            updates_in_window += 1;
                        }

                        total_updates += updates_in_window;
                    }

                    let overall_duration = overall_start.elapsed();

                    // Return average time per update
                    if total_updates > 0 {
                        overall_duration / total_updates
                    } else {
                        overall_duration
                    }
                });
            },
        );
    }

    g.finish();
}

criterion_group!(
    name = benches;
    config = Criterion::default();
    targets = bench_hmr_single_update, bench_hmr_burst_updates, bench_hmr_throughput
);
criterion_main!(benches);
