//! Benchmarks sequential vs parallel decoding of a `batch_lookup_data` batch, used to pick
//! `PARALLEL_DECODE_THRESHOLD`.
//!
//! Only decoding is timed: the raw bytes are read from a real persisted database once during setup,
//! so disk I/O does not hide the scheduling overhead of the parallel path.
//!
//! Gated behind `TURBOPACK_BENCH_BATCH_LOOKUP` because the setup builds and persists a task graph.
//! Run with:
//!
//! ```bash
//! TURBOPACK_BENCH_BATCH_LOOKUP=1 cargo bench -p turbo-tasks-backend --bench mod -- batch_lookup
//! ```

use std::{
    hint::black_box,
    time::{Duration, Instant},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, Throughput};
use turbo_tasks::{TaskId, TurboTasks, Vc};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
    private::{
        ArcBytes, PARALLEL_DECODE_THRESHOLD, SpecificTaskDataCategory, batch_lookup_raw,
        decode_task_storage_batch,
    },
};

/// Batch sizes to measure. Must not exceed the number of persisted tasks.
const SIZES: &[usize] = &[2, 8, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192];

/// Leaves of the persisted tree. Together with the interior nodes this is more than the largest
/// batch size.
const LEAVES: u32 = 16384;
const BRANCHING: u32 = 4;

fn enabled() -> bool {
    !matches!(
        std::env::var("TURBOPACK_BENCH_BATCH_LOOKUP")
            .ok()
            .as_deref(),
        None | Some("") | Some("no") | Some("false")
    )
}

const VERSION_INFO: GitVersionInfo = GitVersionInfo {
    describe: "bench-unversioned",
    dirty: false,
};

const STORAGE_OPTIONS: BackingStorageOptions = BackingStorageOptions {
    is_ci: false,
    is_short_session: true,
    skip_compaction: true,
};

#[turbo_tasks::function]
fn leaf(index: u32) -> Vc<u32> {
    Vc::cell(index.wrapping_mul(1_000_003))
}

#[turbo_tasks::function]
async fn node(index: u32, span: u32) -> Result<Vc<u32>> {
    if span <= 1 {
        return Ok(leaf(index));
    }
    let child_span = span.div_ceil(BRANCHING);
    let mut sum = 0u32;
    let mut start = index;
    while start < index + span {
        let this_span = child_span.min(index + span - start);
        sum = sum.wrapping_add(*node(start, this_span).await?);
        start += this_span;
    }
    Ok(Vc::cell(sum))
}

#[turbo_tasks::function(operation, root)]
fn root() -> Vc<u32> {
    node(0, LEAVES)
}

/// Builds and persists a task graph, then reads the raw bytes of every persisted task for both
/// categories.
fn setup(rt: &tokio::runtime::Runtime) -> (Vec<ArcBytes>, Vec<ArcBytes>, tempfile::TempDir) {
    let parent = std::path::PathBuf::from(format!("{}/.cache", env!("CARGO_TARGET_TMPDIR")));
    std::fs::create_dir_all(&parent).unwrap();
    let dir = tempfile::Builder::new()
        .prefix("batch-lookup-bench-")
        .tempdir_in(&parent)
        .unwrap();

    rt.block_on(async {
        // `TurboTasks::new` needs the runtime context.
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(StorageMode::ReadWriteOnShutdown),
                ..Default::default()
            },
            turbo_tasks_backend::turbo_backing_storage(dir.path(), &VERSION_INFO, STORAGE_OPTIONS)
                .unwrap()
                .0,
        ));
        turbo_tasks::run_once(tt.clone(), async move {
            root().read_strongly_consistent().await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
        tt.stop_and_wait().await;
    });

    let (meta, data) = rt.block_on(async {
        let (storage, _) =
            turbo_tasks_backend::turbo_backing_storage(dir.path(), &VERSION_INFO, STORAGE_OPTIONS)
                .unwrap();
        // Persistent task ids are allocated densely from 1. Over-fetch and drop the misses.
        let task_ids: Vec<TaskId> = (1..=LEAVES * 4)
            .map(|id| TaskId::try_from(id).unwrap())
            .collect();
        let fetch = |category| -> Vec<ArcBytes> {
            batch_lookup_raw(&storage, &task_ids, category)
                .unwrap()
                .into_iter()
                .flatten()
                .collect()
        };
        (
            fetch(SpecificTaskDataCategory::Meta),
            fetch(SpecificTaskDataCategory::Data),
        )
    });
    let max = *SIZES.iter().max().unwrap();
    assert!(
        meta.len() >= max && data.len() >= max,
        "not enough persisted tasks: meta={}, data={}, need {max}",
        meta.len(),
        data.len()
    );
    (meta, data, dir)
}

/// Times `iters` decodes of `bytes[..size]` on a runtime worker thread, which is where
/// `batch_lookup_data` runs in practice. Only the decode call is timed, not dropping the decoded
/// storages (which in practice are moved into the in-memory storage).
fn time_decode(
    rt: &tokio::runtime::Runtime,
    bytes: &[ArcBytes],
    size: usize,
    category: SpecificTaskDataCategory,
    threshold: usize,
    iters: u64,
) -> Duration {
    let input: Vec<Option<ArcBytes>> = bytes[..size].iter().cloned().map(Some).collect();
    rt.block_on(async move {
        tokio::spawn(async move {
            let mut total = Duration::ZERO;
            for _ in 0..iters {
                let start = Instant::now();
                let decoded =
                    decode_task_storage_batch(black_box(&input), category, threshold).unwrap();
                total += start.elapsed();
                drop(black_box(decoded));
            }
            total
        })
        .await
        .unwrap()
    })
}

pub fn batch_lookup(c: &mut Criterion) {
    if !enabled() {
        return;
    }

    let rt = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap();
    let (meta, data, _dir) = setup(&rt);

    for (name, category, bytes) in [
        ("meta", SpecificTaskDataCategory::Meta, &meta),
        ("data", SpecificTaskDataCategory::Data, &data),
    ] {
        let mut group = c.benchmark_group(format!("turbo_tasks_backend_batch_lookup/{name}"));
        group.measurement_time(Duration::from_secs(2));
        group.warm_up_time(Duration::from_secs(1));
        for &size in SIZES {
            group.throughput(Throughput::Elements(size as u64));
            for (mode, threshold) in [
                ("sequential", usize::MAX),
                ("parallel", 0),
                ("default", PARALLEL_DECODE_THRESHOLD),
            ] {
                group.bench_with_input(BenchmarkId::new(mode, size), &size, |b, &size| {
                    b.iter_custom(|iters| time_decode(&rt, bytes, size, category, threshold, iters))
                });
            }
        }
        group.finish();
    }
}
