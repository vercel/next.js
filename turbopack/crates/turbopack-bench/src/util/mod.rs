use std::{
    io::{
        BufRead, BufReader, Read, Write, {self},
    },
    panic::UnwindSafe,
    process::Command,
    time::Duration,
};

use anyhow::Result;
use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    error::CdpError::Ws,
};
use codspeed_criterion_compat::{async_executor::AsyncExecutor, AsyncBencher};
use criterion::BatchSize;
use futures::{Future, StreamExt};
pub use page_guard::PageGuard;
pub use prepared_app::PreparedApp;
use regex::Regex;
use tungstenite::{error::ProtocolError::ResetWithoutClosingHandshake, Error::Protocol};
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
    fn try_iter_batched<I, O, S, R, F>(&mut self, setup: S, routine: R, size: BatchSize)
    where
        S: Fn() -> Result<I>,
        R: Fn(I) -> F,
        F: Future<Output = Result<O>>;
}

impl<'a, 'b, A: AsyncExecutor> AsyncBencherExtension<A> for AsyncBencher<'a, 'b, A> {
    fn try_iter_batched<I, O, S, R, F>(&mut self, setup: S, routine: R, size: BatchSize)
    where
        S: Fn() -> Result<I>,
        R: Fn(I) -> F,
        F: Future<Output = Result<O>>,
    {
        self.iter_batched(
            || setup().expect("setup failed"),
            |input| async { routine(input).await.expect("routine failed") },
            size,
        )
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
