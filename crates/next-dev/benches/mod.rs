use std::{
    fs::remove_dir_all,
    future::Future,
    io::{self, BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdout, Command, Stdio},
    time::Duration,
};

use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    cdp::js_protocol::runtime::EventExceptionThrown,
    error::CdpError::Ws,
    Page,
};
use criterion::{
    async_executor::AsyncExecutor,
    black_box, criterion_group, criterion_main,
    measurement::{Measurement, WallTime},
    AsyncBencher, BenchmarkId, Criterion,
};
use futures::{FutureExt, StreamExt};
use regex::Regex;
use tokio::runtime::Runtime;
use tungstenite::{error::ProtocolError::ResetWithoutClosingHandshake, Error::Protocol};
use turbopack_create_test_app::test_app_builder::TestAppBuilder;

fn bench_startup(c: &mut Criterion) {
    let mut g = c.benchmark_group("bench_startup");
    g.sample_size(10);
    g.measurement_time(Duration::from_secs(80));

    let runtime = Runtime::new().unwrap();
    let browser = &runtime.block_on(create_browser());

    for size in [100, 1_000] {
        g.bench_with_input(BenchmarkId::new("modules", size), &size, |b, &s| {
            let test_dir = build_test(s);
            b.to_async(&runtime).iter_batched_async(
                PreparedApp::new,
                |mut app| async {
                    app.start_server(&test_dir);
                    let page = app.new_page(browser).await;
                    page.wait_for_navigation().await.unwrap();
                    app.schedule_page_disposal(page);
                    // return the PreparedApp doesn't make dropping it part of the measurement
                    app
                },
                |app| app.dispose(),
            );
            remove_dir_all(&test_dir).unwrap();
        });
    }

    g.finish();
}
struct PreparedApp {
    server: Option<(Child, String)>,
    pages: Vec<Page>,
}

impl PreparedApp {
    async fn new() -> Self {
        Self {
            server: None,
            pages: Vec::new(),
        }
    }

    fn start_server(&mut self, test_dir: &PathBuf) {
        assert!(self.server.is_none(), "Server already started");
        let mut proc = Command::new(std::env!("CARGO_BIN_EXE_next-dev"))
            .args([".", "--no-open", "--port", "0"])
            .current_dir(test_dir)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();

        let addr = wait_for_addr(proc.stdout.as_mut().unwrap());
        self.server = Some((proc, addr));
    }

    async fn new_page(&self, browser: &Browser) -> Page {
        let server = self.server.as_ref().expect("Server must be started");
        let page = browser.new_page("about:blank").await.unwrap();
        let mut errors = page.event_listener::<EventExceptionThrown>().await.unwrap();

        page.goto(&server.1).await.unwrap();

        // Make sure no runtime errors occurred when loading the page
        assert!(errors.next().now_or_never().is_none());

        page
    }

    fn schedule_page_disposal(&mut self, page: Page) {
        self.pages.push(page);
    }

    async fn dispose(self) {
        if let Some(mut server) = self.server {
            server.0.kill().unwrap();
            server.0.wait().unwrap();
        }
        for page in self.pages {
            page.close().await.unwrap();
        }
    }
}

fn command(bin: &str) -> Command {
    if cfg!(windows) {
        let mut command = Command::new("cmd.exe");
        command.args(["/C", bin]);
        command
    } else {
        Command::new(bin)
    }
}

fn build_test(module_count: usize) -> PathBuf {
    let test_dir = TestAppBuilder {
        module_count,
        directories_count: module_count / 20,
        package_json: true,
        ..Default::default()
    }
    .build()
    .unwrap();

    let npm = command("npm")
        .args(["install", "--prefer-offline", "--loglevel=error"])
        .current_dir(&test_dir)
        .output()
        .unwrap();

    if !npm.status.success() {
        io::stdout().write_all(&npm.stdout).unwrap();
        io::stderr().write_all(&npm.stderr).unwrap();
        panic!("npm install failed. See above.");
    }

    test_dir
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

fn wait_for_addr(stdout: &mut ChildStdout) -> String {
    // See https://docs.rs/async-process/latest/async_process/#examples
    let mut line_reader = BufReader::new(stdout).lines();
    let started_regex = Regex::new("server listening on: (.*)").unwrap();
    // Wait for "server listening on" message to appear before navigating there.
    let mut addr: Option<String> = None;
    while let Some(Ok(line)) = line_reader.next() {
        if let Some(cap) = started_regex.captures(&line) {
            addr = Some(cap.get(1).unwrap().as_str().into());
            break;
        }
    }

    addr.unwrap()
}

trait AsyncBencherExtension {
    fn iter_batched_async<I, O, S, SF, R, F, T, TF>(&mut self, setup: S, routine: R, teardown: T)
    where
        S: Fn() -> SF,
        SF: Future<Output = I>,
        R: Fn(I) -> F,
        F: Future<Output = O>,
        T: Fn(O) -> TF,
        TF: Future<Output = ()>;
}

impl<'a, 'b, A: AsyncExecutor> AsyncBencherExtension for AsyncBencher<'a, 'b, A, WallTime> {
    #[inline(never)]
    fn iter_batched_async<I, O, S, SF, R, F, T, TF>(&mut self, setup: S, routine: R, teardown: T)
    where
        S: Fn() -> SF,
        SF: Future<Output = I>,
        R: Fn(I) -> F,
        F: Future<Output = O>,
        T: Fn(O) -> TF,
        TF: Future<Output = ()>,
    {
        let setup = &setup;
        let routine = &routine;
        let teardown = &teardown;
        self.iter_custom(|iters| {
            async move {
                let batch_size = std::cmp::min(iters, 50);
                let measurement = WallTime;
                let mut value = measurement.zero();

                if batch_size == 1 {
                    for _ in 0..iters {
                        let input = black_box(setup().await);

                        let start = measurement.start();
                        let output = routine(input).await;
                        let end = measurement.end(start);
                        value = measurement.add(&value, &end);

                        teardown(black_box(output)).await;
                    }
                } else {
                    let mut iteration_counter = 0;

                    while iteration_counter < iters {
                        let batch_size = std::cmp::min(batch_size, iters - iteration_counter);

                        let inputs = black_box({
                            let mut inputs = Vec::new();
                            for _ in 0..batch_size {
                                inputs.push(setup().await)
                            }
                            inputs
                        });
                        let mut outputs = Vec::with_capacity(batch_size as usize);

                        let start = measurement.start();
                        // Can't use .extend here like the sync version does
                        for input in inputs {
                            outputs.push(routine(input).await);
                        }
                        let end = measurement.end(start);
                        value = measurement.add(&value, &end);

                        for output in black_box(outputs) {
                            teardown(output).await;
                        }

                        iteration_counter += batch_size;
                    }
                }

                value
            }
        })
    }
}

criterion_group!(benches, bench_startup);
criterion_main!(benches);
