//! Benchmarks adding and removing edges of the aggregation graph.
//!
//! - `ordered`: one parent alternates between connecting all of its children and none of them.
//!   Every removal is processed after the corresponding addition.
//! - `concurrent`: many roots and parents share children and change which children they connect on
//!   every iteration, so additions and removals of the same edges run concurrently and removals can
//!   overtake additions.
//!
//! The graph is built once per configuration. Each iteration sets the state and reads all roots
//! strongly consistently.
//!
//! ```bash
//! cargo bench -p turbo-tasks-backend --bench mod -- aggregation_churn
//! ```

use std::time::{Duration, Instant};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{OperationVc, ResolvedVc, State, TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Length of the chain below each child. Chains increase the aggregation numbers of the tasks.
const CHAIN: u32 = 4;

#[turbo_tasks::value(transparent)]
struct Generation(State<u32>);

#[turbo_tasks::function(operation, root)]
fn create_generation() -> Vc<Generation> {
    Generation(State::new(0)).cell()
}

/// Deterministically decides if `from` connects to `to` in `generation`.
fn connected(generation: u32, salt: u32, from: u32, to: u32) -> bool {
    let mut x = generation
        .wrapping_mul(0x9e37_79b9)
        .wrapping_add(salt.wrapping_mul(0x85eb_ca6b))
        .wrapping_add(from.wrapping_mul(0xc2b2_ae35))
        .wrapping_add(to.wrapping_mul(0x27d4_eb2f));
    x ^= x >> 15;
    x = x.wrapping_mul(0x2c1b_3c6d);
    x ^= x >> 12;
    x.is_multiple_of(3)
}

#[turbo_tasks::task_input]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, bincode::Encode, bincode::Decode)]
struct Shape {
    parents: u32,
    children: u32,
    /// When `false`, every parent connects all children in even and none in odd generations.
    concurrent: bool,
}

#[turbo_tasks::function(operation, root)]
async fn root_operation(
    generation: ResolvedVc<Generation>,
    shape: Shape,
    root: u32,
) -> Result<Vc<()>> {
    let current = *generation.await?.get();
    (0..shape.parents)
        .filter(|&parent_index| !shape.concurrent || connected(current, 0, root, parent_index))
        .map(|parent_index| parent(*generation, shape, parent_index))
        .map(|parent| async move { parent.await })
        .try_join()
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn parent(generation: Vc<Generation>, shape: Shape, index: u32) -> Result<Vc<()>> {
    let current = *generation.await?.get();
    (0..shape.children)
        .filter(|&child_index| {
            if shape.concurrent {
                connected(current, 1, index, child_index)
            } else {
                current.is_multiple_of(2)
            }
        })
        .map(|child_index| child(child_index, CHAIN))
        .map(|child| async move { child.await })
        .try_join()
        .await?;
    Ok(Vc::cell(()))
}

#[turbo_tasks::function]
async fn child(index: u32, depth: u32) -> Result<Vc<()>> {
    if depth > 0 {
        child(index, depth - 1).await?;
    }
    Ok(Vc::cell(()))
}

async fn set_and_read(
    generation_op: OperationVc<Generation>,
    shape: Shape,
    roots: u32,
    value: u32,
) -> Result<Duration> {
    let generation = generation_op.resolve().strongly_consistent().await?;
    let state = generation_op.read_strongly_consistent().await?;
    let start = Instant::now();
    state.set(value);
    (0..roots)
        .map(|root| async move {
            root_operation(generation, shape, root)
                .read_strongly_consistent()
                .await
        })
        .try_join()
        .await?;
    Ok(start.elapsed())
}

pub fn aggregation_churn(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_aggregation_churn");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(10));

    let configs = [
        (
            "ordered",
            1,
            Shape {
                parents: 1,
                children: 1_000,
                concurrent: false,
            },
        ),
        (
            "concurrent",
            8,
            Shape {
                parents: 64,
                children: 256,
                concurrent: true,
            },
        ),
    ];
    for (name, roots, shape) in configs {
        group.throughput(Throughput::Elements(shape.children as u64));
        group.bench_with_input(
            BenchmarkId::new(name, format_args!("{} x {}", shape.parents, shape.children)),
            &shape,
            |b, &shape| {
                let rt = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                // `TurboTasks::new` needs the runtime context.
                let tt = rt.block_on(async {
                    TurboTasks::new(TurboTasksBackend::new(
                        BackendOptions {
                            storage_mode: None,
                            ..Default::default()
                        },
                        noop_backing_storage(),
                    ))
                });
                // Build the graph once (not timed).
                let generation_op = rt
                    .block_on(tt.run_once(async move {
                        let generation_op = create_generation();
                        set_and_read(generation_op, shape, roots, 0).await?;
                        Ok(generation_op)
                    }))
                    .unwrap();

                let mut next_value = 1u32;
                b.iter_custom(|iters| {
                    let mut total = Duration::ZERO;
                    for _ in 0..iters {
                        let value = next_value;
                        next_value = next_value.wrapping_add(1);
                        total += rt
                            .block_on(tt.run_once(async move {
                                set_and_read(generation_op, shape, roots, value).await
                            }))
                            .unwrap();
                    }
                    total
                });
                rt.block_on(async { tt.stop_and_wait().await });
            },
        );
    }

    group.finish();
}
