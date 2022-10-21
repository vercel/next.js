#![cfg(test)]
extern crate test_generator;

use std::{
    env,
    net::SocketAddr,
    path::{Path, PathBuf},
};

use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    error::CdpError::Ws,
};
use futures::StreamExt;
use lazy_static::lazy_static;
use next_dev::{register, NextDevServerBuilder};
use owo_colors::OwoColorize;
use serde::Deserialize;
use test_generator::test_resources;
use tokio::{net::TcpSocket, task::JoinHandle};
use tungstenite::{error::ProtocolError::ResetWithoutClosingHandshake, Error::Protocol};
use turbo_tasks::TurboTasks;
use turbo_tasks_fs::util::sys_to_unix;
use turbo_tasks_memory::MemoryBackend;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JestRunResult {
    test_results: Vec<JestTestResult>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JestTestResult {
    test_path: Vec<String>,
    errors: Vec<String>,
}

lazy_static! {
    // Allows for interactive manual debugging of a test case in a browser with:
    // `TURBOPACK_DEBUG_BROWSER=1 cargo test -p next-dev -- test_my_pattern --nocapture`
    static ref DEBUG_BROWSER: bool = env::var("TURBOPACK_DEBUG_BROWSER").is_ok();
}

#[test_resources("crates/next-dev/tests/integration/*/*/*")]
#[tokio::main(flavor = "current_thread")]
async fn test(resource: &str) {
    if resource.ends_with("__skipped__") {
        // "Skip" directories named `__skipped__`, which include test directories to
        // skip. These tests are not considered truly skipped by `cargo test`, but they
        // are not run.
        return;
    }

    let run_result = run_test(resource).await;

    assert!(
        !run_result.test_results.is_empty(),
        "Expected one or more tests to run."
    );

    let mut messages = vec![];
    for test_result in run_result.test_results {
        // It's possible to fail multiple tests across these tests,
        // so collect them and fail the respective test in Rust with
        // an aggregate message.
        if !test_result.errors.is_empty() {
            messages.push(format!(
                "\"{}\":\n{}",
                test_result.test_path[1..].join(" > "),
                test_result.errors.join("\n")
            ));
        }
    }

    if !messages.is_empty() {
        panic!(
            "Failed with error(s) in the following test(s):\n\n{}",
            messages.join("\n\n--\n")
        )
    };
}

#[test_resources("crates/next-dev/tests/integration/*/*/__skipped__/*")]
#[should_panic]
#[tokio::main]
async fn test_skipped_fails(resource: &str) {
    let run_result = run_test(resource).await;

    // Assert that this skipped test itself has at least one browser test which
    // fails.
    assert!(
        // Skipped tests sometimes have errors (e.g. unsupported syntax) that prevent tests from
        // running at all. Allow them to have empty results.
        run_result.test_results.is_empty()
            || run_result
                .test_results
                .into_iter()
                .any(|r| !r.errors.is_empty()),
    );
}

async fn run_test(resource: &str) -> JestRunResult {
    register();
    let path = Path::new(resource)
        // test_resources matches and returns relative paths from the workspace root,
        // but pwd in cargo tests is the crate under test.
        .strip_prefix("crates/next-dev")
        .unwrap();
    assert!(path.exists(), "{} does not exist", resource);

    assert!(
        path.is_dir(),
        "{} is not a directory. Integration tests must be directories.",
        path.to_str().unwrap()
    );

    let test_entry = path.join("index.js");
    assert!(
        test_entry.exists(),
        "Test entry {} must exist.",
        test_entry.to_str().unwrap()
    );
    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_root = package_root.parent().unwrap().parent().unwrap();
    let project_dir = workspace_root.join("crates/next-dev/tests");
    let workspace_root = workspace_root.to_string_lossy().to_string();
    let requested_addr = get_free_local_addr().unwrap();
    let server = NextDevServerBuilder::new(
        TurboTasks::new(MemoryBackend::new()),
        project_dir.to_string_lossy().to_string(),
        workspace_root,
    )
    .entry_request("harness.js".into())
    .entry_request(
        sys_to_unix(test_entry.strip_prefix("tests").unwrap().to_str().unwrap()).to_string(),
    )
    .eager_compile(false)
    .hostname(requested_addr.ip())
    .port(requested_addr.port())
    .build()
    .await
    .unwrap();

    println!(
        "{event_type} - server started at http://{address}",
        event_type = "ready".green(),
        address = server.addr
    );

    tokio::select! {
        r = run_browser(server.addr) => r.unwrap(),
        _ = server.future => panic!("Never resolves"),
    }
}

async fn create_browser(
    is_debugging: bool,
) -> Result<(Browser, JoinHandle<()>), Box<dyn std::error::Error>> {
    let mut config_builder = BrowserConfig::builder();
    if is_debugging {
        config_builder = config_builder
            .with_head()
            .args(vec!["--auto-open-devtools-for-tabs"]);
    }

    let (browser, mut handler) = Browser::launch(config_builder.build()?).await?;
    // See https://crates.io/crates/chromiumoxide
    let thread_handle = tokio::task::spawn(async move {
        loop {
            if let Err(Ws(Protocol(ResetWithoutClosingHandshake))) = handler.next().await.unwrap() {
                // The user has most likely closed the browser. End gracefully.
                break;
            }
        }
    });

    Ok((browser, thread_handle))
}

async fn run_browser(addr: SocketAddr) -> Result<JestRunResult, Box<dyn std::error::Error>> {
    if *DEBUG_BROWSER {
        run_debug_browser(addr).await?;
    }

    run_test_browser(addr).await
}

async fn run_debug_browser(addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    let (browser, handle) = create_browser(true).await?;
    let page = browser.new_page(format!("http://{}", addr)).await?;

    let run_tests_msg =
        "Entering debug mode. Run `await __jest__.run()` in the browser console to run tests.";
    println!("\n\n{}", run_tests_msg);
    page.evaluate(format!(
        r#"console.info("%cTurbopack tests:", "font-weight: bold;", "{}");"#,
        run_tests_msg
    ))
    .await?;

    // Wait for the user to close the browser
    handle.await?;

    Ok(())
}

async fn run_test_browser(addr: SocketAddr) -> Result<JestRunResult, Box<dyn std::error::Error>> {
    let (browser, _) = create_browser(false).await?;
    let page = browser.new_page(format!("http://{}", addr)).await?;
    page.wait_for_navigation().await?;

    Ok(page.evaluate("__jest__.run()").await?.into_value()?)
}

fn get_free_local_addr() -> Result<SocketAddr, std::io::Error> {
    let socket = TcpSocket::new_v4()?;
    socket.bind("127.0.0.1:0".parse().unwrap())?;
    socket.local_addr()
}
