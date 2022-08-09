#![cfg(test)]
extern crate test_generator;

use std::{net::SocketAddr, path::Path};

use chromiumoxide::browser::{Browser, BrowserConfig};
use futures::StreamExt;
use next_dev::{register, NextDevServerBuilder};
use serde::Deserialize;
use test_generator::test_resources;
use turbo_tasks::TurboTasks;
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

#[test_resources("crates/next-dev/tests/integration/*/*/*")]
#[tokio::main]
async fn test(resource: &str) {
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

    if path.ends_with("__skipped__") {
        // "Skip" directories named `__skipped__`, which include test directories to
        // skip. These tests are not considered truly skipped by `cargo test`, but they
        // are not run.
        return;
    }

    let test_entry = path.join("index.js");
    assert!(
        test_entry.exists(),
        "Test entry {} must exist.",
        test_entry.to_str().unwrap()
    );

    let server = NextDevServerBuilder::new()
        .turbo_tasks(TurboTasks::new(MemoryBackend::new()))
        .project_dir("tests".into())
        .entry_asset("harness.js".into())
        .entry_asset(
            test_entry
                .strip_prefix("tests")
                .unwrap()
                .to_str()
                .unwrap()
                .replace('\\', "/"),
        )
        .eager_compile(false)
        .hostname("127.0.0.1".parse().unwrap())
        .port(portpicker::pick_unused_port().unwrap())
        .build()
        .await
        .unwrap();

    println!("server started at http://{}", server.addr);

    tokio::select! {
        r = run_browser_test(server.addr) => r.unwrap(),
        r = server.future => r.unwrap(),
    };
}

async fn create_browser() -> Result<Browser, Box<dyn std::error::Error>> {
    let (browser, mut handler) = Browser::launch(BrowserConfig::builder().build()?).await?;
    // See https://crates.io/crates/chromiumoxide
    tokio::task::spawn(async move {
        loop {
            let _ = handler.next().await.unwrap();
        }
    });

    Ok(browser)
}

async fn run_browser_test(addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    let browser = create_browser().await?;

    let page = browser.new_page(format!("http://{}", addr)).await?;

    let run_result: JestRunResult = page
        .evaluate("__jest__.run()")
        .await
        .unwrap()
        .into_value()
        .unwrap();

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
    }

    Ok(())
}
