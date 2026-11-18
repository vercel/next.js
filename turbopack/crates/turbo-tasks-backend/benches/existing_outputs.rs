//! Reading already computed task outputs after they were computed by an earlier root operation:
//!
//! - `new_root_operation`: a new root operation reads the existing outputs through intermediate
//!   tasks (e.g. computing stats about the endpoints of an earlier build).
//! - `without_parent`: the existing tasks are called from a `run` closure, i.e. without a parent
//!   task.
//!
//! Only the second phase is measured. Every iteration uses a fresh backend, so the second phase
//! always starts from the same state.

use std::time::{Duration, Instant};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion};
use turbo_tasks::{TryJoinIterExt, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

/// Size of the shared module graph. Each module reads `DEPS` lower modules.
const MODULES: u32 = 20_000;
const DEPS: u32 = 4;
/// Modules read by each endpoint.
const FANOUT: u32 = 20;
/// Endpoints read by one batch task of the new root operation.
const BATCH: u32 = 64;

fn hash(a: u32, b: u32) -> u32 {
    let mut x = (a as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (b as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F);
    x ^= x >> 31;
    x = x.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x ^= x >> 29;
    x as u32
}

#[turbo_tasks::function]
async fn module(i: u32) -> Result<Vc<u64>> {
    let mut sum = i as u64;
    if i > 0 {
        for v in (0..DEPS).map(|k| module(hash(i, k) % i)).try_join().await? {
            sum = sum.wrapping_add(*v);
        }
    }
    Ok(Vc::cell(sum % 1_000_000_007))
}

#[turbo_tasks::function]
async fn endpoint(e: u32) -> Result<Vc<u64>> {
    let values = (0..FANOUT)
        .map(|k| module(hash(e + 1_000_000, k) % MODULES))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|v| **v).sum()))
}

#[turbo_tasks::function(operation, root)]
async fn emit_operation(endpoints: u32) -> Result<Vc<u64>> {
    let values = (0..endpoints).map(endpoint).try_join().await?;
    Ok(Vc::cell(values.iter().map(|v| **v).sum()))
}

#[turbo_tasks::function]
async fn wrapper(e: u32) -> Result<Vc<u64>> {
    Ok(Vc::cell(*endpoint(e).await? + 1))
}

#[turbo_tasks::function]
async fn batch(start: u32, end: u32) -> Result<Vc<u64>> {
    let values = (start..end).map(wrapper).try_join().await?;
    Ok(Vc::cell(values.iter().map(|v| **v).sum()))
}

#[turbo_tasks::function(operation, root)]
async fn stats_operation(endpoints: u32) -> Result<Vc<u64>> {
    let values = (0..endpoints)
        .step_by(BATCH as usize)
        .map(|start| batch(start, (start + BATCH).min(endpoints)))
        .try_join()
        .await?;
    Ok(Vc::cell(values.iter().map(|v| **v).sum()))
}

#[derive(Clone, Copy)]
enum Shape {
    NewRootOperation,
    WithoutParent,
}

async fn measure(shape: Shape, endpoints: u32, iters: u64) -> Duration {
    let mut total = Duration::ZERO;
    for _ in 0..iters {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        ));
        tt.run(async move {
            emit_operation(endpoints).read_strongly_consistent().await?;
            Ok(())
        })
        .await
        .unwrap();

        let start = Instant::now();
        match shape {
            Shape::NewRootOperation => {
                tt.run(async move {
                    stats_operation(endpoints)
                        .read_strongly_consistent()
                        .await?;
                    Ok(())
                })
                .await
                .unwrap();
            }
            Shape::WithoutParent => {
                tt.run(async move {
                    for e in 0..endpoints {
                        let _ = endpoint(e);
                    }
                    Ok(())
                })
                .await
                .unwrap();
                // Wait until the work queued by the calls has settled.
                tt.run(async move {
                    emit_operation(endpoints).read_strongly_consistent().await?;
                    Ok(())
                })
                .await
                .unwrap();
            }
        }
        total += start.elapsed();
        tt.stop_and_wait().await;
    }
    total
}

pub fn existing_outputs(c: &mut Criterion) {
    let mut group = c.benchmark_group("turbo_tasks_backend_existing_outputs");
    group.sample_size(10);

    for (name, shape, endpoints) in [
        ("new_root_operation", Shape::NewRootOperation, 500),
        ("without_parent", Shape::WithoutParent, 50),
    ] {
        group.bench_with_input(
            BenchmarkId::new(name, format_args!("{endpoints} endpoints")),
            &endpoints,
            |b, &endpoints| {
                let rt = tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                b.to_async(rt)
                    .iter_custom(|iters| measure(shape, endpoints, iters));
            },
        );
    }
}
