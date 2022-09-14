use std::{
    fs::{self},
    path::Path,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use bundlers::get_bundlers;
use criterion::{
    criterion_group, criterion_main, measurement::WallTime, BenchmarkGroup, BenchmarkId, Criterion,
};
use tokio::{
    runtime::Runtime,
    time::{sleep, timeout},
};
use util::{
    build_test, create_browser, AsyncBencherExtension, PageGuard, PreparedApp, BINDING_NAME,
};

mod bundlers;
mod util;

const MAX_UPDATE_TIMEOUT: Duration = Duration::from_secs(60);

fn bench_startup(c: &mut Criterion) {
    let mut g = c.benchmark_group("bench_startup");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(80));

    bench_startup_internal(g, false);
}

fn bench_hydration(c: &mut Criterion) {
    let mut g = c.benchmark_group("bench_hydration");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(80));

    bench_startup_internal(g, true);
}

fn bench_startup_internal(mut g: BenchmarkGroup<WallTime>, hydration: bool) {
    let runtime = Runtime::new().unwrap();
    let browser = &runtime.block_on(create_browser());

    for bundler in get_bundlers() {
        let wait_for_hydration = if !bundler.has_server_rendered_html() {
            // For bundlers without server rendered html "startup" means time to hydration
            // as they only render an empty screen without hydration. Since startup and
            // hydration would be the same we skip the hydration benchmark for them.
            if hydration {
                continue;
            } else {
                true
            }
        } else {
            hydration
        };
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);
            g.bench_with_input(
                BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                &input,
                |b, &(bundler, module_count)| {
                    let test_app = build_test(module_count, bundler);
                    let template_dir = test_app.path();
                    b.to_async(&runtime).try_iter_async(
                        || async { PreparedApp::new(bundler, template_dir.to_path_buf()) },
                        |mut app| async {
                            app.start_server()?;
                            let mut guard = app.with_page(browser).await?;
                            if wait_for_hydration {
                                guard.wait_for_hydration().await?;
                            }

                            // Defer the dropping of the guard to `teardown`.
                            Ok(guard)
                        },
                        |_guard| async move {},
                    );
                },
            );
        }
    }
    g.finish();
}

fn bench_simple_file_change(c: &mut Criterion) {
    let mut g = c.benchmark_group("bench_simple_file_change");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    let runtime = Runtime::new().unwrap();
    let browser = &runtime.block_on(create_browser());

    for bundler in get_bundlers() {
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);
            g.bench_with_input(
                BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                &input,
                |b, &(bundler, module_count)| {
                    let test_app = build_test(module_count, bundler);
                    let template_dir = test_app.path();
                    fn add_code(app_path: &Path, code: &str) -> Result<()> {
                        let triangle_path = app_path.join("src/triangle.jsx");
                        let mut contents = fs::read_to_string(&triangle_path)?;
                        const COMPONENT_START: &str =
                            "export default function Container({ style }) {\n";
                        let a = contents
                            .find(COMPONENT_START)
                            .ok_or_else(|| anyhow!("unable to find component start"))?;
                        let b = contents
                            .find("\n    return <>")
                            .ok_or_else(|| anyhow!("unable to find component start"))?;
                        contents.replace_range(a..b, &format!("{COMPONENT_START}{code}"));
                        fs::write(&triangle_path, contents)?;
                        Ok(())
                    }
                    async fn make_change<'a>(guard: &mut PageGuard<'a>) -> Result<()> {
                        let msg = format!("TURBOPACK_BENCH_CHANGE_{}", guard.app_mut().counter());
                        add_code(
                            guard.app().path(),
                            &format!(
                                "    React.useEffect(() => {{ globalThis.{BINDING_NAME}('{msg}'); \
                                 }});\n"
                            ),
                        )?;

                        // Wait for the change introduced above to be reflected at runtime.
                        // This expects HMR or automatic reloading to occur.
                        timeout(MAX_UPDATE_TIMEOUT, guard.wait_for_binding(&msg))
                            .await?
                            .context("update was not registered by bundler")?;

                        Ok(())
                    }
                    b.to_async(Runtime::new().unwrap()).try_iter_async(
                        || async {
                            let mut app = PreparedApp::new(bundler, template_dir.to_path_buf())?;
                            app.start_server()?;
                            let mut guard = app.with_page(browser).await?;
                            guard.wait_for_hydration().await?;

                            // Make warmup change
                            make_change(&mut guard).await?;

                            Ok(guard)
                        },
                        |mut guard| async move {
                            make_change(&mut guard).await?;

                            // Defer the dropping of the guard to `teardown`.
                            Ok(guard)
                        },
                        |_guard| async move {},
                    );
                },
            );
        }
    }
}

fn bench_restart(c: &mut Criterion) {
    let mut g = c.benchmark_group("bench_restart");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    let runtime = Runtime::new().unwrap();
    let browser = &runtime.block_on(create_browser());

    for bundler in get_bundlers() {
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);

            g.bench_with_input(
                BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                &input,
                |b, &(bundler, module_count)| {
                    let test_app = build_test(module_count, bundler);
                    let template_dir = test_app.path();
                    b.to_async(Runtime::new().unwrap()).try_iter_async(
                        || async {
                            // Run a complete build, shut down, and test running it again
                            let mut app = PreparedApp::new(bundler, template_dir.to_path_buf())?;
                            app.start_server()?;
                            let mut guard = app.with_page(browser).await?;
                            guard.wait_for_hydration().await?;

                            let mut app = guard.close_page().await?;

                            // Give it 4 seconds time to store the cache
                            sleep(Duration::from_secs(4)).await;

                            app.stop_server()?;
                            Ok(app)
                        },
                        |mut app| async {
                            app.start_server()?;
                            let mut guard = app.with_page(browser).await?;
                            guard.wait_for_hydration().await?;

                            // Defer the dropping of the guard to `teardown`.
                            Ok(guard)
                        },
                        |_guard| async move {},
                    );
                },
            );
        }
    }
}

fn get_module_counts() -> Vec<usize> {
    let config = std::env::var("TURBOPACK_BENCH_COUNTS").ok();
    match config.as_deref() {
        None | Some("") => {
            vec![100, 1_000]
        }
        Some(config) => config
            .split(',')
            .map(|s| s.parse().expect("Invalid value for TURBOPACK_BENCH_COUNTS"))
            .collect(),
    }
}

criterion_group!(
    name = benches;
    config = Criterion::default();
    targets = bench_startup, bench_hydration, bench_simple_file_change, bench_restart
);
criterion_main!(benches);
