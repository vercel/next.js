use std::{
    io::{self, BufRead, BufReader, Read, Write},
    panic::UnwindSafe,
    process::Command,
    time::Duration,
};

use anyhow::Result;
use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    error::CdpError::Ws,
};
use criterion::{
    async_executor::AsyncExecutor,
    black_box,
    measurement::{Measurement, WallTime},
    AsyncBencher,
};
use futures::{Future, StreamExt};
pub use page_guard::PageGuard;
pub use prepared_app::PreparedApp;
use regex::Regex;
use tungstenite::{error::ProtocolError::ResetWithoutClosingHandshake, Error::Protocol};
use turbopack_create_test_app::test_app_builder::{PackageJsonConfig, TestApp, TestAppBuilder};

use crate::bundlers::Bundler;

pub mod npm;
mod page_guard;
mod prepared_app;

pub const BINDING_NAME: &str = "__turbopackBenchBinding";

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
    // waits 5, 10, 20, 40 seconds = 75 seconds total
    retry(args, f, 3, Duration::from_secs(5))
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
    // waits 5, 10, 20, 40 seconds = 75 seconds total
    retry_async(args, f, 3, Duration::from_secs(5)).await
}

pub fn build_test(module_count: usize, bundler: &dyn Bundler) -> TestApp {
    let test_app = TestAppBuilder {
        module_count,
        directories_count: module_count / 20,
        package_json: Some(PackageJsonConfig {
            react_version: bundler.react_version().to_string(),
        }),
        ..Default::default()
    }
    .build()
    .unwrap();

    let npm = command("npm")
        .args(["install", "--prefer-offline", "--loglevel=error"])
        .current_dir(test_app.path())
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

pub async fn create_browser() -> Browser {
    let with_head = !matches!(
        std::env::var("TURBOPACK_BENCH_HEAD").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    );
    let with_devtools = !matches!(
        std::env::var("TURBOPACK_BENCH_DEVTOOLS").ok().as_deref(),
        None | Some("") | Some("no") | Some("false")
    );
    let mut builder = BrowserConfig::builder();
    if with_head {
        builder = builder.with_head();
    }
    if with_devtools {
        builder = builder.arg("--auto-open-devtools-for-tabs");
    }
    let (browser, mut handler) = Browser::launch(builder.build().unwrap()).await.unwrap();

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

pub fn resume_on_error<F: FnOnce() + UnwindSafe>(f: F) {
    let runs_as_bench = std::env::args().find(|a| a == "--bench");

    if runs_as_bench.is_some() {
        use std::panic::catch_unwind;
        // panics are already printed to the console, so no need to handle the result.
        let _ = catch_unwind(f);
    } else {
        f();
    }
}

pub trait AsyncBencherExtension {
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
        let config = std::env::var("TURBOPACK_BENCH_BENCH").ok();
        let bench_benchmark_itself = !matches!(
            config.as_deref(),
            None | Some("") | Some("no") | Some("false")
        );

        let setup = &setup;
        let routine = &routine;
        let teardown = &teardown;
        self.iter_custom(|iters| async move {
            let measurement = WallTime;
            let mut value = measurement.zero();

            let mut iter = 0u64;
            let mut failures = 0u64;
            while iter < iters {
                loop {
                    let early_start = bench_benchmark_itself.then(|| measurement.start());
                    let input = black_box(
                        retry_async_default((), |_| setup())
                            .await
                            .expect("failed to setup"),
                    );

                    let start = early_start.unwrap_or_else(|| measurement.start());
                    match routine(input).await {
                        Ok(output) => {
                            let duration;
                            if bench_benchmark_itself {
                                teardown(black_box(output)).await;
                                duration = measurement.end(start);
                            } else {
                                duration = measurement.end(start);
                                teardown(black_box(output)).await;
                            }
                            value = measurement.add(&value, &duration);
                            iter += 1;
                            break;
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
                }
            }

            value
        })
    }
}

pub fn command(bin: &str) -> Command {
    if cfg!(windows) {
        let mut command = Command::new("cmd.exe");
        command.args(["/C", bin]);
        command
    } else {
        Command::new(bin)
    }
}

pub fn wait_for_match<R>(readable: R, re: Regex) -> Option<String>
where
    R: Read,
{
    // See https://docs.rs/async-process/latest/async_process/#examples
    let mut line_reader = BufReader::new(readable).lines();
    // Read until the match appears in the buffer
    let mut matched: Option<String> = None;
    while let Some(Ok(line)) = line_reader.next() {
        if let Some(cap) = re.captures(&line) {
            matched = Some(cap.get(1).unwrap().as_str().into());
            break;
        }
    }

    matched
}
