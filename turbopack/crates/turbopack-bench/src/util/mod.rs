use std::{
    io::{
        BufRead, BufReader, Read, Write, {self},
    },
    panic::UnwindSafe,
    process::Command,
    time::{Duration, Instant},
};

use anyhow::Result;
use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    error::CdpError::Ws,
};
use criterion::{AsyncBencher, async_executor::AsyncExecutor, black_box, measurement::WallTime};
use futures::{Future, StreamExt};
pub use page_guard::PageGuard;
use parking_lot::Mutex;
pub use prepared_app::PreparedApp;
use regex::Regex;
use tungstenite::{Error::Protocol, error::ProtocolError::ResetWithoutClosingHandshake};
use turbo_tasks::util::FormatDuration;
use turbo_tasks_testing::retry::{retry, retry_async};
use turbopack_create_test_app::test_app_builder::{
    EffectMode, PackageJsonConfig, TestApp, TestAppBuilder,
};

use self::env::read_env_bool;
use crate::bundlers::{Bundler, RenderType};

pub mod env;
pub mod module_picker;
pub mod npm;
mod page_guard;
mod prepared_app;

pub const BINDING_NAME: &str = "__turbopackBenchBinding";

fn retry_default<A, F, R, E>(args: A, f: F) -> Result<R, E>
where
    F: Fn(&mut A) -> Result<R, E>,
{
    // waits 5, 10, 20, 40 seconds = 75 seconds total
    retry(args, f, 3, Duration::from_secs(5))
}

async fn retry_async_default<A, F, Fut, R, E>(args: A, f: F) -> Result<R, E>
where
    F: Fn(&mut A) -> Fut,
    Fut: Future<Output = Result<R, E>>,
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
        effect_mode: match bundler.render_type() {
            RenderType::ServerSideRenderedWithEvents => EffectMode::Component,
            _ => EffectMode::Hook,
        },
        ..Default::default()
    }
    .build()
    .unwrap();

    let npm = command("npm")
        .args(["install", "--loglevel=error"])
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
    let with_head = read_env_bool("TURBOPACK_BENCH_WITH_HEAD");
    let with_devtools = read_env_bool("TURBOPACK_BENCH_DEVTOOLS");
    let mut builder = BrowserConfig::builder();
    builder = builder.no_sandbox();
    if with_head {
        builder = builder.with_head();
    }
    if with_devtools {
        builder = builder.arg("--auto-open-devtools-for-tabs");
    }
    let (browser, mut handler) = retry_async(
        builder.build().unwrap(),
        |c| {
            let c = c.clone();
            Browser::launch(c)
        },
        3,
        Duration::from_millis(100),
    )
    .await
    .expect("Launching the browser failed");

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
    let ignore_errors = read_env_bool("TURBOPACK_BENCH_IGNORE_ERRORS");

    if runs_as_bench.is_some() || ignore_errors {
        use std::panic::catch_unwind;
        // panics are already printed to the console, so no need to handle the result.
        let _ = catch_unwind(f);
    } else {
        f();
    }
}

pub trait AsyncBencherExtension<A: AsyncExecutor> {
    fn try_iter_custom<R, F>(&mut self, routine: R)
    where
        R: Fn(u64, WallTime) -> F,
        F: Future<Output = Result<Duration>>;

    fn try_iter_async<I, S, SF, R, F, T, TF>(
        &mut self,
        runner: A,
        setup: S,
        routine: R,
        teardown: T,
    ) where
        S: Fn() -> SF,
        SF: Future<Output = Result<I>>,
        R: Fn(I, u64, WallTime, bool) -> F,
        F: Future<Output = Result<(I, Duration)>>,
        T: Fn(I) -> TF,
        TF: Future<Output = ()>;
}

impl<A: AsyncExecutor> AsyncBencherExtension<A> for AsyncBencher<'_, '_, A> {
    fn try_iter_custom<R, F>(&mut self, routine: R)
    where
        R: Fn(u64, WallTime) -> F,
        F: Future<Output = Result<Duration>>,
    {
        let log_progress = read_env_bool("TURBOPACK_BENCH_PROGRESS");

        let routine = &routine;
        self.iter_custom(|iters| async move {
            let measurement = WallTime;
            let value = routine(iters, measurement).await.expect("routine failed");
            if log_progress {
                eprint!(" {:?}/{}", FormatDuration(value / (iters as u32)), iters);
            }
            value
        });
    }

    fn try_iter_async<I, S, SF, R, F, T, TF>(
        &mut self,
        runner: A,
        setup: S,
        routine: R,
        teardown: T,
    ) where
        S: Fn() -> SF,
        SF: Future<Output = Result<I>>,
        R: Fn(I, u64, WallTime, bool) -> F,
        F: Future<Output = Result<(I, Duration)>>,
        T: Fn(I) -> TF,
        TF: Future<Output = ()>,
    {
        let log_progress = read_env_bool("TURBOPACK_BENCH_PROGRESS");

        let setup = &setup;
        let routine = &routine;
        let teardown = &teardown;
        let input_mutex = &Mutex::new(Some(black_box(runner.block_on(async {
            if log_progress {
                eprint!(" setup...");
            }
            let start = Instant::now();
            let input = retry_async_default((), |_| setup())
                .await
                .expect("failed to setup");
            if log_progress {
                let duration = start.elapsed();
                eprint!(" [{:?}]", FormatDuration(duration));
            }
            input
        }))));

        self.iter_custom(|iters| async move {
            let measurement = WallTime;

            let input = input_mutex
                .lock()
                .take()
                .expect("iter_custom only executes its closure once");

            let (output, value) = routine(input, iters, measurement, log_progress)
                .await
                .expect("Routine failed");
            let output = black_box(output);

            if log_progress {
                eprint!(" {:?}/{}", FormatDuration(value / (iters as u32)), iters);
            }

            input_mutex.lock().replace(output);

            value
        });

        let input = input_mutex.lock().take().unwrap();
        if log_progress {
            eprint!(" teardown...");
        }
        let start = Instant::now();
        runner.block_on(teardown(input));
        let duration = start.elapsed();
        if log_progress {
            eprintln!(" [{:?}]", FormatDuration(duration));
        }
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
