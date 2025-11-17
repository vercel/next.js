#![cfg_attr(not(codspeed), allow(unused))]

#[global_allocator]
static ALLOC: turbo_tasks_malloc::TurboMalloc = turbo_tasks_malloc::TurboMalloc;

use std::{
    path::{Path, PathBuf},
    process::Command,
};

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use turbopack_cli::arguments::{BuildArguments, CommonArguments};

fn list_apps() -> (PathBuf, Vec<PathBuf>) {
    // We need to rely on `CARGO_MANIFEST_DIR` because we are running it via `cargo codspeed`

    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let apps_dir = Path::new(&manifest_dir)
        .join("../../benchmark-apps")
        .canonicalize()
        .expect("failed to canonicalize path");

    let mut apps = Vec::new();

    for entry in std::fs::read_dir(&apps_dir).unwrap() {
        let entry = entry.unwrap();
        let path = entry.path();
        if path.is_dir() {
            // Exclude node_modules
            if path.file_name().unwrap_or_default() == "node_modules" {
                continue;
            }

            apps.push(path);
        }
    }

    (apps_dir, apps)
}

fn bench_small_apps(c: &mut Criterion) {
    use turbo_tasks_malloc::TurboMalloc;

    let (apps_dir, apps) = list_apps();
    let mut g = c.benchmark_group("turbopack/build/apps");

    for app in apps {
        g.bench_function(
            BenchmarkId::new("build", app.file_name().unwrap().to_string_lossy()),
            |b| {
                let apps_dir = apps_dir.clone();
                let app = app.clone();

                b.iter(move || {
                    let mut rt = tokio::runtime::Builder::new_multi_thread();
                    rt.enable_all().on_thread_stop(|| {
                        TurboMalloc::thread_stop();
                    });
                    let rt = rt.build().unwrap();

                    let apps_dir = apps_dir.clone();
                    let app = app.clone();

                    let app_name = app.file_name().unwrap().to_string_lossy().to_string();

                    rt.block_on(async move {
                        turbopack_cli::build::build(&BuildArguments {
                            common: CommonArguments {
                                entries: Some(vec![format!("{app_name}/index.tsx")]),
                                dir: Some(app.clone()),
                                root: Some(apps_dir),
                                log_level: None,
                                show_all: false,
                                log_detail: false,
                                full_stats: false,
                                target: None,
                                worker_threads: None,
                            },
                            no_sourcemap: false,
                            no_minify: false,
                            force_memory_cleanup: true,
                            no_scope_hoist: false,
                        })
                        .await
                    })
                    .unwrap();
                });
            },
        );
    }
}

criterion_group!(
  name = benches;
  config = Criterion::default().sample_size(10);
  targets = bench_small_apps
);
criterion_main!(benches);
