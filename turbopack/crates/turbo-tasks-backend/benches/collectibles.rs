//! Benchmarks for taking collectibles (`OperationVc::take_collectibles`), which unemits all taken
//! collectibles from the taking task and propagates that through the aggregation graph.
//!
//! The `peek` variant runs the same task graph without unemitting. It is a comparison workload,
//! not a subtractive control: taking also stops the collectibles from propagating to the uppers.
//! Run with:
//!
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- collectibles
//! ```

use std::time::{Duration, Instant};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, TurboTasks, ValueToString, Vc, emit};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Number of tasks between the root task and the task taking the collectibles, so that the unemit
/// has to propagate through a few levels of the aggregation graph.
const DEPTH: u32 = 8;

pub fn collectibles(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_collectibles");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(5));

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();

    for count in [10, 100, 1_000, 10_000] {
        group.throughput(Throughput::Elements(count as u64));
        for take in [false, true] {
            let name = if take { "take" } else { "peek" };
            group.bench_with_input(BenchmarkId::new(name, count), &count, |b, &count| {
                b.to_async(&rt).iter_custom(|iters| async move {
                    let tt = TurboTasks::new(TurboTasksBackend::new(
                        BackendOptions {
                            storage_mode: None,
                            ..Default::default()
                        },
                        noop_backing_storage(),
                    ));
                    let duration = tt
                        .run(async move {
                            // Emit the collectibles once, outside of the measurement.
                            emitting_operation(count).read_strongly_consistent().await?;
                            let start = Instant::now();
                            for iteration in 0..iters as u32 {
                                let taken = chain_operation(count, take, iteration, DEPTH)
                                    .read_strongly_consistent()
                                    .await?;
                                assert_eq!(*taken, count);
                            }
                            Ok(start.elapsed())
                        })
                        .await
                        .unwrap();
                    // Stopping and dropping the instance happens outside of the measurement.
                    tt.stop_and_wait().await;
                    duration
                })
            });
        }
    }
}

#[turbo_tasks::value]
struct Collectible(u32);

#[turbo_tasks::value_impl]
impl ValueToString for Collectible {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.0.to_string().into())
    }
}

#[turbo_tasks::function]
fn emit_all(count: u32) {
    for i in 0..count {
        emit(ResolvedVc::upcast::<Box<dyn ValueToString>>(
            Collectible(i).resolved_cell(),
        ));
    }
}

#[turbo_tasks::function(operation, root)]
async fn emitting_operation(count: u32) -> Result<Vc<()>> {
    emit_all(count).as_side_effect().await?;
    Ok(Vc::cell(()))
}

/// Takes (or peeks) the collectibles of [`emitting_operation`]. `iteration` makes every call a new
/// task.
#[turbo_tasks::function(operation, root)]
async fn collecting_operation(count: u32, take: bool, iteration: u32) -> Result<Vc<u32>> {
    let _ = iteration;
    let source = emitting_operation(count);
    source.connect().await?;
    let collectibles = if take {
        source.take_collectibles::<Box<dyn ValueToString>>()
    } else {
        source.peek_collectibles::<Box<dyn ValueToString>>()
    };
    Ok(Vc::cell(collectibles.len() as u32))
}

/// A chain of `depth` tasks above [`collecting_operation`].
#[turbo_tasks::function(operation, root)]
async fn chain_operation(count: u32, take: bool, iteration: u32, depth: u32) -> Result<Vc<u32>> {
    if depth == 0 {
        Ok(collecting_operation(count, take, iteration).connect())
    } else {
        Ok(chain_operation(count, take, iteration, depth - 1).connect())
    }
}
