use std::{
    fs::{self},
    panic::AssertUnwindSafe,
    path::Path,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use anyhow::{anyhow, Context, Result};
use chromiumoxide::Browser;
use codspeed_criterion_compat::{
    measurement::WallTime, BatchSize, Bencher, BenchmarkGroup, BenchmarkId, Criterion,
};
use once_cell::sync::Lazy;
use tokio::{
    runtime::Runtime,
    sync::Mutex,
    time::{sleep, timeout},
};
use util::{
    build_test, create_browser,
    env::{read_env, read_env_bool, read_env_list},
    module_picker::ModulePicker,
    AsyncBencherExtension, PreparedApp, BINDING_NAME,
};

use self::{bundlers::RenderType, util::resume_on_error};
use crate::{bundlers::Bundler, util::PageGuard};

pub mod bundlers;
pub mod util;

pub fn bench_startup(c: &mut Criterion, bundlers: &[Box<dyn Bundler>]) {
    let mut g = c.benchmark_group("bench_startup");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    bench_startup_internal(g, false, bundlers);
}

pub fn bench_hydration(c: &mut Criterion, bundlers: &[Box<dyn Bundler>]) {
    let mut g = c.benchmark_group("bench_hydration");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    bench_startup_internal(g, true, bundlers);
}

fn bench_startup_internal(
    mut g: BenchmarkGroup<WallTime>,
    hydration: bool,
    bundlers: &[Box<dyn Bundler>],
) {
    let runtime = Runtime::new().unwrap();
    let browser = Lazy::new(|| runtime.block_on(create_browser()));

    for bundler in bundlers {
        let wait_for_hydration = match bundler.render_type() {
            RenderType::ClientSideRendered => {
                // For bundlers without server rendered html "startup" means time to hydration
                // as they only render an empty screen without hydration. Since startup and
                // hydration would be the same we skip the hydration benchmark for them.
                if hydration {
                    continue;
                } else {
                    true
                }
            }
            RenderType::ServerSidePrerendered => hydration,
            RenderType::ServerSideRenderedWithEvents => hydration,
            RenderType::ServerSideRenderedWithoutInteractivity => {
                // For bundlers without interactivity there is no hydration event to wait for
                if hydration {
                    continue;
                } else {
                    false
                }
            }
        };
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);
            resume_on_error(AssertUnwindSafe(|| {
                g.bench_with_input(
                    BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                    &input,
                    |b, &(bundler, module_count)| {
                        let test_app = build_test(module_count, bundler);
                        let browser = &*browser;

                        b.to_async(&runtime).try_iter_batched(
                            || PreparedApp::new(bundler, test_app.path().to_path_buf()),
                            |mut app| async move {
                                app.start_server()?;
                                let mut guard = app.open_page(browser).await?;
                                if wait_for_hydration {
                                    guard.wait_for_hydration().await?;
                                }
                                Ok((app, guard))
                            },
                            BatchSize::PerIteration,
                        );
                    },
                );
            }));
        }
    }
    g.finish();
}

#[derive(Copy, Clone)]
enum CodeLocation {
    Effect,
    Evaluation,
}

pub fn bench_hmr_to_eval(c: &mut Criterion, bundlers: &[Box<dyn Bundler>]) {
    let mut g = c.benchmark_group("bench_hmr_to_eval");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    bench_hmr_internal(g, CodeLocation::Evaluation, bundlers);
}

pub fn bench_hmr_to_commit(c: &mut Criterion, bundlers: &[Box<dyn Bundler>]) {
    let mut g = c.benchmark_group("bench_hmr_to_commit");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    bench_hmr_internal(g, CodeLocation::Effect, bundlers);
}

fn bench_hmr_internal(
    mut g: BenchmarkGroup<WallTime>,
    location: CodeLocation,
    bundlers: &[Box<dyn Bundler>],
) {
    // Only capture one sample for warmup
    g.warm_up_time(Duration::from_millis(1));

    let runtime = Runtime::new().unwrap();
    let browser = Lazy::new(|| runtime.block_on(create_browser()));

    for bundler in bundlers {
        if matches!(
            bundler.render_type(),
            RenderType::ServerSideRenderedWithEvents
                | RenderType::ServerSideRenderedWithoutInteractivity
        ) && matches!(location, CodeLocation::Evaluation)
        {
            // We can't measure evaluation time for these bundlers since it's not evaluated
            // in the browser
            continue;
        }
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);

            resume_on_error(AssertUnwindSafe(|| {
                g.bench_with_input(
                    BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                    &input,
                    |b, &(bundler, module_count)| {
                        bench_hmr_internal_bench(
                            b,
                            location,
                            &runtime,
                            &browser,
                            bundler,
                            module_count,
                        )
                        .expect("failed to run `bench_hmr_internal_bench`")
                    },
                );
            }));
        }
    }
}

fn bench_hmr_internal_bench(
    b: &mut Bencher,
    location: CodeLocation,
    runtime: &Runtime,
    browser: &Browser,
    bundler: &dyn Bundler,
    module_count: usize,
) -> Result<()> {
    let hmr_warmup = read_env("TURBOPACK_BENCH_HMR_WARMUP", 10)?;

    let test_app = build_test(module_count, bundler);
    let module_picker = Arc::new(ModulePicker::new(test_app.modules().to_vec()));

    let modules = test_app.modules();

    let max_init_update_timeout = bundler.max_init_update_timeout(module_count);
    let max_update_timeout = bundler.max_update_timeout(module_count);

    let mut app = PreparedApp::new_without_copy(bundler, test_app.path().to_path_buf());
    app.start_server()?;

    let mut guard = runtime.block_on(app.open_page(browser))?;

    runtime.block_on(async {
        if bundler.has_hydration_event() {
            guard.wait_for_hydration().await?;
        } else {
            guard.page().wait_for_navigation().await?;
        }
        guard
            .page()
            .evaluate_expression("globalThis.HMR_IS_HAPPENING = true")
            .await
            .context("Unable to evaluate JavaScript in the page for HMR check flag")?;

        // There's a possible race condition between hydration and
        // connection to the HMR server. We attempt to make updates with an
        // exponential backoff until one succeeds.
        let mut exponential_duration = Duration::from_millis(100);
        loop {
            match make_change(
                &modules[0].0,
                bundler,
                &mut guard,
                location,
                exponential_duration,
            )
            .await
            {
                Ok(duration) => {
                    if cfg!(target_os = "linux") {
                        // TODO(sokra) triggering HMR updates too fast can have weird effects on
                        // Linux
                        tokio::time::sleep(std::cmp::max(duration, Duration::from_millis(100)))
                            .await;
                    }

                    break;
                }
                Err(e) => {
                    exponential_duration *= 2;
                    if exponential_duration > max_init_update_timeout {
                        return Err(e.context("failed to make warmup change"));
                    }
                }
            }
        }

        // Once we know the HMR server is connected, we make a few warmup
        // changes.
        let mut hmr_warmup_iter = 0;
        let mut hmr_warmup_dropped = 0;
        while hmr_warmup_iter < hmr_warmup {
            match make_change(
                &modules[0].0,
                bundler,
                &mut guard,
                location,
                max_update_timeout,
            )
            .await
            {
                Err(_) => {
                    // We don't care about dropped updates during warmup.
                    hmr_warmup_dropped += 1;

                    if hmr_warmup_dropped >= hmr_warmup {
                        return Err(anyhow!(
                            "failed to make warmup change {} times",
                            hmr_warmup_dropped
                        ));
                    }
                }
                Ok(duration) => {
                    if cfg!(target_os = "linux") {
                        // TODO(sokra) triggering HMR updates too fast can have weird effects on
                        // Linux
                        tokio::time::sleep(std::cmp::max(duration, Duration::from_millis(100)))
                            .await;
                    }

                    hmr_warmup_iter += 1;
                }
            }
        }

        anyhow::Ok(())
    })?;

    let guard = Mutex::new(guard);

    b.to_async(runtime).try_iter_batched(
        || {
            if cfg!(target_os = "linux") {
                // TODO(sokra) triggering HMR updates too fast can have weird effects on Linux
                std::thread::sleep(Duration::from_millis(100));
            }

            Ok(guard.try_lock()?)
        },
        |mut guard| {
            let module_picker = module_picker.clone();

            async move {
                let module = module_picker.pick();
                if make_change(module, bundler, &mut guard, location, max_update_timeout)
                    .await
                    .is_err()
                {
                    // Some bundlers (e.g. Turbopack and Vite) can drop
                    // updates under certain conditions. We don't want
                    // to crash or stop the benchmark
                    // because of this. Instead, we keep going and
                    // report the number of dropped updates at the end.

                    // dropped += 1;
                    // continue;
                };

                Ok(())
            }
        },
        BatchSize::PerIteration,
    );

    // teardown
    runtime.block_on(async move {
        let hmr_is_happening = guard
            .try_lock()
            .unwrap()
            .page()
            .evaluate_expression("globalThis.HMR_IS_HAPPENING")
            .await
            .unwrap();

        // Make sure that we are really measuring HMR and not accidentically
        // full refreshing the page
        assert!(hmr_is_happening.value().unwrap().as_bool().unwrap());
    });

    Ok(())
}

fn insert_code(
    path: &Path,
    bundler: &dyn Bundler,
    message: &str,
    location: CodeLocation,
) -> Result<impl FnOnce() -> Result<()>> {
    let mut contents = fs::read_to_string(path)?;

    const PRAGMA_EVAL_START: &str = "/* @turbopack-bench:eval-start */";
    const PRAGMA_EVAL_END: &str = "/* @turbopack-bench:eval-end */";

    let eval_start = contents
        .find(PRAGMA_EVAL_START)
        .ok_or_else(|| anyhow!("unable to find effect start pragma in {}", contents))?;
    let eval_end = contents
        .find(PRAGMA_EVAL_END)
        .ok_or_else(|| anyhow!("unable to find effect end pragma in {}", contents))?;

    match (location, bundler.render_type()) {
        (CodeLocation::Effect, _) => {
            contents.replace_range(
                eval_start + PRAGMA_EVAL_START.len()..eval_end,
                &format!("\nEFFECT_PROPS.message = \"{message}\";\n"),
            );
        }
        (
            CodeLocation::Evaluation,
            RenderType::ClientSideRendered | RenderType::ServerSidePrerendered,
        ) => {
            let code = format!(
                "\nglobalThis.{BINDING_NAME} && globalThis.{BINDING_NAME}(\"{message}\");\n"
            );
            contents.replace_range(eval_start + PRAGMA_EVAL_START.len()..eval_end, &code);
        }
        (
            CodeLocation::Evaluation,
            RenderType::ServerSideRenderedWithEvents
            | RenderType::ServerSideRenderedWithoutInteractivity,
        ) => {
            panic!("evaluation can't be measured for bundlers which evaluate on server side");
        }
    }

    let path = path.to_owned();
    Ok(move || Ok(fs::write(&path, contents)?))
}

static CHANGE_TIMEOUT_MESSAGE: &str = "update was not registered by bundler";

async fn make_change(
    module: &Path,
    bundler: &dyn Bundler,
    guard: &mut PageGuard,
    location: CodeLocation,
    timeout_duration: Duration,
) -> Result<Duration> {
    static CHANGE_COUNTER: AtomicUsize = AtomicUsize::new(0);

    let msg = format!(
        "TURBOPACK_BENCH_CHANGE_{}",
        CHANGE_COUNTER.fetch_add(1, Ordering::Relaxed)
    );

    // Keep the IO out of the measurement.
    let commit = insert_code(module, bundler, &msg, location)?;

    let start = Instant::now();

    commit()?;

    // Wait for the change introduced above to be reflected at runtime.
    // This expects HMR or automatic reloading to occur.
    timeout(timeout_duration, guard.wait_for_binding(&msg))
        .await
        .context(CHANGE_TIMEOUT_MESSAGE)??;

    let duration = start.elapsed();

    Ok(duration)
}

pub fn bench_startup_cached(c: &mut Criterion, bundlers: &[Box<dyn Bundler>]) {
    let mut g = c.benchmark_group("bench_startup_cached");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    bench_startup_cached_internal(g, false, bundlers);
}

pub fn bench_hydration_cached(c: &mut Criterion, bundlers: &[Box<dyn Bundler>]) {
    let mut g = c.benchmark_group("bench_hydration_cached");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    bench_startup_cached_internal(g, true, bundlers);
}

fn bench_startup_cached_internal(
    mut g: BenchmarkGroup<WallTime>,
    hydration: bool,
    bundlers: &[Box<dyn Bundler>],
) {
    if !read_env_bool("TURBOPACK_BENCH_CACHED") {
        return;
    }

    let runtime = Runtime::new().unwrap();
    let browser = Lazy::new(|| runtime.block_on(create_browser()));

    for bundler in bundlers {
        let wait_for_hydration = match bundler.render_type() {
            RenderType::ClientSideRendered => {
                // For bundlers without server rendered html "startup" means time to hydration
                // as they only render an empty screen without hydration. Since startup and
                // hydration would be the same we skip the hydration benchmark for them.
                if hydration {
                    continue;
                } else {
                    true
                }
            }
            RenderType::ServerSidePrerendered => hydration,
            RenderType::ServerSideRenderedWithEvents => hydration,
            RenderType::ServerSideRenderedWithoutInteractivity => {
                // For bundlers without interactivity there is no hydration event to wait for
                if hydration {
                    continue;
                } else {
                    false
                }
            }
        };
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);

            resume_on_error(AssertUnwindSafe(|| {
                g.bench_with_input(
                    BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                    &input,
                    |b, &(bundler, module_count)| {
                        bench_startup_cached_internal_bench(
                            b,
                            wait_for_hydration,
                            &runtime,
                            &browser,
                            bundler,
                            module_count,
                        )
                        .expect("failed to run `bench_startup_cached_internal_bench`")
                    },
                );
            }));
        }
    }
}

fn bench_startup_cached_internal_bench(
    b: &mut Bencher,
    wait_for_hydration: bool,
    runtime: &Runtime,
    browser: &Browser,
    bundler: &dyn Bundler,
    module_count: usize,
) -> Result<()> {
    let test_app = build_test(module_count, bundler);

    let mut app = PreparedApp::new(bundler, test_app.path().to_path_buf())?;

    runtime.block_on(async {
        // Run a complete build, shut down, and test running it again
        app.start_server()?;
        let mut page = app.open_page(browser).await?;
        if bundler.has_hydration_event() {
            page.wait_for_hydration().await?;
        } else {
            page.page().wait_for_navigation().await?;
        }

        page.close_page().await?;

        // Give it 4 seconds time to store the cache
        sleep(Duration::from_secs(4)).await;

        anyhow::Ok(())
    })?;

    let app = Mutex::new(app);

    b.to_async(runtime).try_iter_batched(
        || {
            let mut app = app.try_lock()?;

            // this needs to happen after each iteration
            // we also left the server running above so the first iteration will work
            app.stop_server()?;

            Ok(app)
        },
        |mut app| async move {
            app.start_server()?;
            let mut page = app.open_page(browser).await?;
            if wait_for_hydration {
                page.wait_for_hydration().await?;
            }

            Ok(page)
        },
        BatchSize::PerIteration,
    );

    Ok(())
}
fn get_module_counts() -> Vec<usize> {
    read_env_list("TURBOPACK_BENCH_COUNTS", vec![1_000usize]).unwrap()
}
