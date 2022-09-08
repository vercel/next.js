use std::{
    fs::{self},
    future::Future,
    io::{self, Write},
    path::{Path, PathBuf},
    process::Child,
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use bundlers::{command, get_bundlers, Bundler};
use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    cdp::js_protocol::runtime::{AddBindingParams, EventBindingCalled, EventExceptionThrown},
    error::CdpError::Ws,
    listeners::EventStream,
    Page,
};
use criterion::{
    async_executor::AsyncExecutor,
    black_box, criterion_group, criterion_main,
    measurement::{Measurement, WallTime},
    AsyncBencher, BenchmarkGroup, BenchmarkId, Criterion,
};
use futures::{FutureExt, StreamExt};
use tokio::{
    runtime::Runtime,
    time::{sleep, timeout},
};
use tungstenite::{error::ProtocolError::ResetWithoutClosingHandshake, Error::Protocol};
use turbopack_create_test_app::test_app_builder::{TestApp, TestAppBuilder};
use url::Url;

mod bundlers;

const BINDING_NAME: &str = "__turbopackBenchBinding";
const TEST_APP_HYDRATION_DONE: &str = "Hydration done";

const MAX_UPDATE_TIMEOUT: Duration = Duration::from_secs(20);
const MAX_HYDRATION_TIMEOUT: Duration = Duration::from_secs(30);

fn get_module_counts() -> &'static [usize] {
    let config = std::env::var("TURBOPACK_BENCH_COUNTS").ok();
    match config.as_deref() {
        Some("all") => {
            static C: &[usize] = &[100, 500, 1_000, 2_000];
            C
        }
        Some("others") => {
            static C: &[usize] = &[500, 2_000];
            C
        }
        None | Some("") => {
            static C: &[usize] = &[100, 1_000];
            C
        }
        _ => panic!("Invalid value for TURBOPACK_BENCH_COUNTS"),
    }
}

fn retry<A, F, R>(mut args: A, f: F, max_retries: usize, mut timeout: Duration) -> Result<R>
where
    F: Fn(&mut A) -> Result<R>,
{
    let mut retries = 0usize;
    loop {
        match f(&mut args) {
            Ok(value) => return Ok(value),
            Err(e) => {
                if retries >= max_retries {
                    return Err(e);
                }
                retries += 1;
                std::thread::sleep(timeout);
                timeout += timeout;
            }
        }
    }
}

fn retry_default<A, F, R>(args: A, f: F) -> Result<R>
where
    F: Fn(&mut A) -> Result<R>,
{
    // waits 5, 10, 20, 40, 80, 160 seconds = 315 seconds total
    retry(args, f, 5, Duration::from_secs(5))
}

async fn retry_async<A, F, Fut, R>(
    mut args: A,
    f: F,
    max_retries: usize,
    mut timeout: Duration,
) -> Result<R>
where
    F: Fn(&mut A) -> Fut,
    Fut: Future<Output = Result<R>>,
{
    let mut retries = 0usize;
    loop {
        match f(&mut args).await {
            Ok(value) => return Ok(value),
            Err(e) => {
                if retries >= max_retries {
                    return Err(e);
                }
                retries += 1;
                tokio::time::sleep(timeout).await;
                timeout += timeout;
            }
        }
    }
}

async fn retry_async_default<A, F, Fut, R>(args: A, f: F) -> Result<R>
where
    F: Fn(&mut A) -> Fut,
    Fut: Future<Output = Result<R>>,
{
    // waits 5, 10, 20, 40, 80, 160 seconds = 315 seconds total
    retry_async(args, f, 5, Duration::from_secs(5)).await
}

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

fn bench_startup_internal(mut g: BenchmarkGroup<WallTime>, wait_for_hydration: bool) {
    let runtime = Runtime::new().unwrap();
    let browser = &runtime.block_on(create_browser());

    for bundler in retry_default((), |_| get_bundlers()).expect("failed to get bundlers") {
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);
            g.bench_with_input(
                BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                &input,
                |b, &(bundler, module_count)| {
                    let test_app = build_test(*module_count, bundler);
                    let template_dir = test_app.path();
                    b.to_async(&runtime).try_iter_async(
                        || async { PreparedApp::new(bundler, template_dir.to_path_buf()) },
                        |mut app| async {
                            app.start_server()?;
                            let (guard, mut events) = app.new_page(browser).await?;
                            guard.page().wait_for_navigation().await?;
                            if wait_for_hydration {
                                timeout(
                                    MAX_HYDRATION_TIMEOUT,
                                    wait_for_binding(&mut events, TEST_APP_HYDRATION_DONE),
                                )
                                .await??;
                            }
                            // return the PreparedApp doesn't make dropping it part of the
                            // measurement
                            Ok((app, guard))
                        },
                        |(_app, guard)| async move {
                            if let Err(e) = guard.close_page().await {
                                eprintln!("failed to close page: {:?}", e);
                            }
                        },
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

    for bundler in retry_default((), |_| get_bundlers()).expect("failed to get bundlers") {
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);

            g.bench_with_input(
                BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                &input,
                |b, &(bundler, module_count)| {
                    let test_app = build_test(*module_count, bundler);
                    let template_dir = test_app.path();
                    fn add_code<'a>(app: &mut PreparedApp<'a>, code: &str) -> Result<()> {
                        let triangle_path = app.path().join("src/triangle.jsx");
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
                    async fn make_change<'a>(
                        app: &mut PreparedApp<'a>,
                        events: &mut EventStream<EventBindingCalled>,
                    ) -> Result<()> {
                        let msg = format!("TURBOPACK_BENCH_CHANGE_{}", app.counter());
                        add_code(
                            app,
                            &format!(
                                "    React.useEffect(() => {{ globalThis.{BINDING_NAME}('{msg}'); \
                                 }});\n"
                            ),
                        )?;

                        // Wait for the change introduced above to be reflected at runtime.
                        // This expects HMR or automatic reloading to occur.
                        timeout(MAX_UPDATE_TIMEOUT, wait_for_binding(events, &msg))
                            .await?
                            .context("update was not registered by bundler")?;

                        Ok(())
                    }
                    b.to_async(Runtime::new().unwrap()).try_iter_async(
                        || async {
                            let mut app = PreparedApp::new(bundler, template_dir.to_path_buf())?;
                            app.start_server()?;
                            let (guard, mut events) = app.new_page(browser).await?;
                            guard.page().wait_for_navigation().await?;
                            timeout(
                                MAX_HYDRATION_TIMEOUT,
                                wait_for_binding(&mut events, TEST_APP_HYDRATION_DONE),
                            )
                            .await??;

                            // Make warmup change
                            make_change(&mut app, &mut events).await?;

                            Ok((app, guard, events))
                        },
                        |(mut app, guard, mut events)| async move {
                            make_change(&mut app, &mut events).await?;

                            // Defer the dropping of the app and the page guard to `teardown`.
                            Ok((app, guard))
                        },
                        |(_app, guard)| async move {
                            if let Err(err) = guard.close_page().await {
                                eprintln!("failed to close page: {:?}", err);
                            }
                        },
                    );
                },
            );
        }
    }
}

async fn wait_for_binding(
    events: &mut EventStream<EventBindingCalled>,
    payload: &str,
) -> Result<()> {
    while let Some(event) = events.next().await {
        if event.name == BINDING_NAME && event.payload == payload {
            return Ok(());
        }
    }

    Err(anyhow!("event stream ended before binding was called"))
}

/// Adds benchmark-specific bindings to the page.
async fn add_binding(page: &Page) -> Result<()> {
    page.execute(AddBindingParams::new(BINDING_NAME)).await?;
    Ok(())
}

fn bench_restart(c: &mut Criterion) {
    let mut g = c.benchmark_group("bench_restart");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(60));

    let runtime = Runtime::new().unwrap();
    let browser = &runtime.block_on(create_browser());

    for bundler in retry_default((), |_| get_bundlers()).expect("failed to get bundlers") {
        for module_count in get_module_counts() {
            let input = (bundler.as_ref(), module_count);

            g.bench_with_input(
                BenchmarkId::new(bundler.get_name(), format!("{} modules", module_count)),
                &input,
                |b, &(bundler, module_count)| {
                    let test_app = build_test(*module_count, bundler);
                    let template_dir = test_app.path();
                    b.to_async(Runtime::new().unwrap()).try_iter_async(
                        || async {
                            // Run a complete build, shut down, and test running it again
                            let mut app = PreparedApp::new(bundler, template_dir.to_path_buf())?;
                            app.start_server()?;
                            let (guard, mut events) = app.new_page(browser).await?;
                            guard.page().wait_for_navigation().await?;
                            timeout(
                                MAX_HYDRATION_TIMEOUT,
                                wait_for_binding(&mut events, TEST_APP_HYDRATION_DONE),
                            )
                            .await??;
                            guard.close_page().await?;

                            // Give it 4 seconds time to store the cache
                            sleep(Duration::from_secs(4)).await;

                            app.stop_server()?;
                            Ok(app)
                        },
                        |mut app| async {
                            app.start_server()?;
                            let (guard, mut events) = app.new_page(browser).await?;
                            guard.page().wait_for_navigation().await?;
                            timeout(
                                MAX_HYDRATION_TIMEOUT,
                                wait_for_binding(&mut events, TEST_APP_HYDRATION_DONE),
                            )
                            .await??;
                            Ok((app, guard))
                        },
                        |(_app, guard)| async move {
                            if let Err(err) = guard.close_page().await {
                                eprintln!("failed to close page: {:?}", err);
                            }
                        },
                    );
                },
            );
        }
    }
}

struct PreparedApp<'a> {
    bundler: &'a dyn Bundler,
    server: Option<(Child, String)>,
    test_dir: tempfile::TempDir,
    counter: usize,
}

impl<'a> PreparedApp<'a> {
    fn new(bundler: &'a dyn Bundler, template_dir: PathBuf) -> Result<Self> {
        let test_dir = tempfile::tempdir()?;

        fs_extra::dir::copy(
            &template_dir,
            &test_dir,
            &fs_extra::dir::CopyOptions {
                content_only: true,
                ..fs_extra::dir::CopyOptions::default()
            },
        )?;

        Ok(Self {
            bundler,
            server: None,
            test_dir,
            counter: 0,
        })
    }

    fn counter(&mut self) -> usize {
        self.counter += 1;
        self.counter
    }

    fn start_server(&mut self) -> Result<()> {
        assert!(self.server.is_none(), "Server already started");

        self.server = Some(self.bundler.start_server(self.test_dir.path())?);

        Ok(())
    }

    async fn new_page(
        &self,
        browser: &Browser,
    ) -> Result<(PageGuard, EventStream<EventBindingCalled>)> {
        let server = self.server.as_ref().context("Server must be started")?;
        let page = browser.new_page("about:blank").await?;
        // Bindings survive page reloads. Set them up as early as possible.
        add_binding(&page).await?;

        let mut errors = page.event_listener::<EventExceptionThrown>().await?;
        let binding_events = page.event_listener::<EventBindingCalled>().await?;

        let destination = Url::parse(&server.1)?.join(self.bundler.get_path())?;
        page.goto(destination).await?;

        // Make sure no runtime errors occurred when loading the page
        assert!(errors.next().now_or_never().is_none());

        Ok((PageGuard::new(page), binding_events))
    }

    fn stop_server(&mut self) -> Result<()> {
        let mut proc = self.server.take().expect("Server never started").0;
        stop_process(&mut proc)?;
        Ok(())
    }

    fn path(&self) -> &Path {
        self.test_dir.path()
    }
}

impl<'a> Drop for PreparedApp<'a> {
    fn drop(&mut self) {
        if let Some(mut server) = self.server.take() {
            stop_process(&mut server.0).expect("failed to stop process");
        }
    }
}

/// Closes a browser page on Drop.
struct PageGuard(Option<Page>);

impl PageGuard {
    /// Creates a new guard for the given page.
    pub fn new(page: Page) -> Self {
        Self(Some(page))
    }

    /// Returns a reference to the page.
    pub fn page(&self) -> &Page {
        self.0.as_ref().unwrap()
    }

    pub async fn close_page(mut self) -> Result<()> {
        // Invariant: the page is always Some while the guard is alive.
        let page = self.0.take().unwrap();
        page.close().await?;
        Ok(())
    }
}

impl Drop for PageGuard {
    fn drop(&mut self) {
        // The page might have been closed already in `close_page`.
        if let Some(page) = self.0.take() {
            // This is a way to block on a future in a destructor. It's not ideal, but for
            // the purposes of this benchmark it's fine.
            futures::executor::block_on(page.close()).expect("failed to close page");
        }
    }
}

#[cfg(unix)]
fn stop_process(proc: &mut Child) -> Result<()> {
    use nix::{
        sys::signal::{kill, Signal},
        unistd::Pid,
    };

    const KILL_DEADLINE: Duration = Duration::from_secs(5);
    const KILL_DEADLINE_CHECK_STEPS: u32 = 10;

    let pid = Pid::from_raw(proc.id() as _);
    match kill(pid, Signal::SIGINT) {
        Ok(()) => {
            let expire = std::time::Instant::now() + KILL_DEADLINE;
            while let Ok(None) = proc.try_wait() {
                if std::time::Instant::now() > expire {
                    break;
                }
                std::thread::sleep(KILL_DEADLINE / KILL_DEADLINE_CHECK_STEPS);
            }
            if let Ok(None) = proc.try_wait() {
                eprintln!("Process {} did not exit after SIGINT, sending SIGKILL", pid);
                kill_process(proc)?;
            }
        }
        Err(_) => {
            eprintln!("Failed to send SIGINT to process {}, sending SIGKILL", pid);
            kill_process(proc)?;
        }
    }
    Ok(())
}

#[cfg(not(unix))]
fn stop_process(proc: &mut Child) -> Result<()> {
    kill_process(proc)
}

fn kill_process(proc: &mut Child) -> Result<()> {
    proc.kill()?;
    proc.wait()?;
    Ok(())
}

fn build_test(module_count: usize, bundler: &dyn Bundler) -> TestApp {
    let test_app = TestAppBuilder {
        module_count,
        directories_count: module_count / 20,
        package_json: true,
        ..Default::default()
    }
    .build()
    .unwrap();

    let npm = command("npm")
        .args(["install", "--prefer-offline", "--loglevel=error"])
        .current_dir(&test_app.path())
        .output()
        .unwrap();

    if !npm.status.success() {
        io::stdout().write_all(&npm.stdout).unwrap();
        io::stderr().write_all(&npm.stderr).unwrap();
        panic!("npm install failed. See above.");
    }

    retry_default((), |_| bundler.prepare(test_app.path())).unwrap();

    test_app
}

async fn create_browser() -> Browser {
    let (browser, mut handler) = Browser::launch(BrowserConfig::builder().build().unwrap())
        .await
        .unwrap();

    // See https://crates.io/crates/chromiumoxide
    tokio::task::spawn(async move {
        loop {
            if let Err(Ws(Protocol(ResetWithoutClosingHandshake))) = handler.next().await.unwrap() {
                break;
            }
        }
    });

    browser
}

trait AsyncBencherExtension {
    fn try_iter_async<I, O, S, SF, R, F, T, TF>(&mut self, setup: S, routine: R, teardown: T)
    where
        S: Fn() -> SF,
        SF: Future<Output = Result<I>>,
        R: Fn(I) -> F,
        F: Future<Output = Result<O>>,
        T: Fn(O) -> TF,
        TF: Future<Output = ()>;
}

impl<'a, 'b, A: AsyncExecutor> AsyncBencherExtension for AsyncBencher<'a, 'b, A, WallTime> {
    #[inline(never)]
    fn try_iter_async<I, O, S, SF, R, F, T, TF>(&mut self, setup: S, routine: R, teardown: T)
    where
        S: Fn() -> SF,
        SF: Future<Output = Result<I>>,
        R: Fn(I) -> F,
        F: Future<Output = Result<O>>,
        T: Fn(O) -> TF,
        TF: Future<Output = ()>,
    {
        let setup = &setup;
        let routine = &routine;
        let teardown = &teardown;
        self.iter_custom(|iters| async move {
            let measurement = WallTime;
            let mut value = measurement.zero();

            let mut iter = 0u64;
            let mut failures = 0u64;
            while iter < iters {
                let output = loop {
                    let input = black_box(
                        retry_async_default((), |_| setup())
                            .await
                            .expect("failed to setup"),
                    );

                    let start = measurement.start();
                    match routine(input).await {
                        Ok(output) => {
                            let duration = measurement.end(start);
                            value = measurement.add(&value, &duration);
                            iter += 1;
                            break output;
                        }
                        Err(err) => {
                            failures += 1;
                            if failures > iters {
                                panic!("Routine failed {failures} times, aborting\n{:?}", err)
                            } else {
                                eprintln!("Routine failed, will be retried: {:?}", err);
                                continue;
                            }
                        }
                    }
                };

                teardown(black_box(output)).await;
            }

            value
        })
    }
}

criterion_group!(
    name = benches;
    config = Criterion::default();
    targets = bench_startup, bench_hydration, bench_simple_file_change, bench_restart
);
criterion_main!(benches);
