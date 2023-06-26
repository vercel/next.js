#![feature(min_specialization)]
#![cfg(test)]

use std::{
    env,
    fmt::Write,
    future::{pending, Future},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    panic::{catch_unwind, resume_unwind, AssertUnwindSafe},
    path::{Path, PathBuf},
    time::Duration,
};

use anyhow::{anyhow, Context, Result};
use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    cdp::{
        browser_protocol::network::EventResponseReceived,
        js_protocol::runtime::{
            AddBindingParams, EventBindingCalled, EventConsoleApiCalled, EventExceptionThrown,
            PropertyPreview, RemoteObject,
        },
    },
    error::CdpError::Ws,
    Page,
};
use dunce::canonicalize;
use futures::StreamExt;
use lazy_static::lazy_static;
use next_core::turbopack::{
    cli_utils::issue::{format_issue, LogOptions},
    core::issue::IssueSeverity,
};
use next_dev::{EntryRequest, NextDevServerBuilder};
use owo_colors::OwoColorize;
use regex::{Captures, Regex, Replacer};
use serde::Deserialize;
use tempdir::TempDir;
use tokio::{
    net::TcpSocket,
    sync::mpsc::{unbounded_channel, UnboundedSender},
    task::JoinSet,
};
use tungstenite::{error::ProtocolError::ResetWithoutClosingHandshake, Error::Protocol};
use turbopack_binding::{
    turbo::{
        tasks::{
            debug::{ValueDebug, ValueDebugStringReadRef},
            primitives::{BoolVc, StringVc},
            NothingVc, RawVc, ReadRef, State, TransientInstance, TransientValue, TurboTasks,
        },
        tasks_fs::{DiskFileSystemVc, FileSystem, FileSystemPathVc},
        tasks_memory::MemoryBackend,
        tasks_testing::retry::{retry, retry_async},
    },
    turbopack::{
        core::issue::{
            CapturedIssues, Issue, IssueReporter, IssueReporterVc, IssueSeverityVc, IssueVc,
            IssuesVc, OptionIssueSourceVc, PlainIssueReadRef,
        },
        test_utils::snapshot::snapshot_issues,
    },
};

fn register() {
    next_dev::register();
    include!(concat!(env!("OUT_DIR"), "/register_test_integration.rs"));
}

#[derive(Debug)]
struct JsResult {
    uncaught_exceptions: Vec<String>,
    run_result: JestRunResult,
}

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
    /// Allows for interactive manual debugging of a test case in a browser with:
    /// `TURBOPACK_DEBUG_BROWSER=1 cargo test -p next-dev-tests -- test_my_pattern --nocapture`
    static ref DEBUG_BROWSER: bool = env::var("TURBOPACK_DEBUG_BROWSER").is_ok();
    /// Only starts the dev server on port 3000, but doesn't spawn a browser or run any tests.
    static ref DEBUG_START: bool = env::var("TURBOPACK_DEBUG_START").is_ok();
    /// When using TURBOPACK_DEBUG_START, this will open the browser to the dev server.
    static ref DEBUG_OPEN: bool = env::var("TURBOPACK_DEBUG_OPEN").is_ok();
}

fn run_async_test<'a, T>(future: impl Future<Output = T> + Send + 'a) -> T {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(1)
        .enable_all()
        .build()
        .unwrap();
    let result = catch_unwind(AssertUnwindSafe(|| {
        runtime.block_on(async move {
            #[cfg(feature = "tokio_console")]
            console_subscriber::init();
            future.await
        })
    }));
    println!("Stutting down runtime...");
    runtime.shutdown_timeout(Duration::from_secs(5));
    println!("Stut down runtime");
    match result {
        Ok(result) => result,
        Err(err) => resume_unwind(err),
    }
}

#[testing::fixture("tests/integration/*/*/*/input")]
fn test(resource: PathBuf) {
    let resource = resource.parent().unwrap().to_path_buf();
    if resource.ends_with("__skipped__") || resource.ends_with("__flakey__") {
        // "Skip" directories named `__skipped__`, which include test directories to
        // skip. These tests are not considered truly skipped by `cargo test`, but they
        // are not run.
        //
        // All current `__flakey__` tests need longer timeouts, but the current
        // build of `jest-circus-browser` does not support configuring this.
        //
        // TODO(WEB-319): Update the version of `jest-circus` in `jest-circus-browser`,
        // which supports configuring this. Or explore an alternative.
        return;
    }

    let JsResult {
        uncaught_exceptions,
        run_result,
    } = run_async_test(run_test(resource));

    let mut messages = vec![];

    if run_result.test_results.is_empty() {
        messages.push("No tests were run.".to_string());
    }

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

    for uncaught_exception in uncaught_exceptions {
        messages.push(format!("Uncaught exception: {}", uncaught_exception));
    }

    if !messages.is_empty() {
        panic!(
            "Failed with error(s) in the following test(s):\n\n{}",
            messages.join("\n\n--\n")
        )
    };
}

#[testing::fixture("tests/integration/*/*/__skipped__/*/input")]
#[should_panic]
fn test_skipped_fails(resource: PathBuf) {
    let resource = resource.parent().unwrap().to_path_buf();
    let JsResult {
        // Ignore uncaught exceptions for skipped tests.
        uncaught_exceptions: _,
        run_result,
    } = run_async_test(run_test(resource));

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

fn copy_recursive(from: &Path, to: &Path) -> std::io::Result<()> {
    let from = canonicalize(from)?;
    let to = canonicalize(to)?;
    let mut entries = vec![];
    for entry in from.read_dir()? {
        let entry = entry?;
        let path = entry.path();
        let to_path = to.join(path.file_name().unwrap());
        if path.is_dir() {
            std::fs::create_dir_all(&to_path)?;
            entries.push((path, to_path));
        } else {
            std::fs::copy(&path, &to_path)?;
        }
    }
    for (from, to) in entries {
        copy_recursive(&from, &to)?;
    }
    Ok(())
}

async fn run_test(resource: PathBuf) -> JsResult {
    register();

    let resource = canonicalize(resource).unwrap();
    assert!(resource.exists(), "{} does not exist", resource.display());
    assert!(
        resource.is_dir(),
        "{} is not a directory. Integration tests must be directories.",
        resource.to_str().unwrap()
    );

    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let tests_dir = package_root.join("tests");
    let integration_tests_dir = tests_dir.join("integration");
    // We run tests from a temporary directory because tests can modify files in the
    // test directory when testing the file watcher/HMR, and we have no reliable way
    // to ensure that we can restore the original state of the test directory after
    // running the test.
    let resource_temp: PathBuf = tests_dir.join("temp").join(
        resource
            .strip_prefix(integration_tests_dir)
            .expect("resource path must be within the integration tests directory"),
    );

    // We don't care about errors when removing the previous temp directory.
    // It can still exist if we crashed during a previous test run.
    let _ = std::fs::remove_dir_all(&resource_temp);
    std::fs::create_dir_all(&resource_temp).expect("failed to create temporary directory");
    copy_recursive(&resource, &resource_temp)
        .expect("failed to copy test files to temporary directory");

    let cargo_workspace_root = canonicalize(package_root)
        .unwrap()
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();

    let test_dir = resource_temp.to_path_buf();
    let workspace_root = cargo_workspace_root.parent().unwrap().parent().unwrap();
    let project_dir = test_dir.join("input");
    let requested_addr = if *DEBUG_START {
        "127.0.0.1:3000".parse().unwrap()
    } else {
        get_free_local_addr().unwrap()
    };

    let mock_dir = resource_temp.join("__httpmock__");
    let mock_server_future = get_mock_server_future(&mock_dir);

    let (issue_tx, mut issue_rx) = unbounded_channel();
    let issue_tx = TransientInstance::new(issue_tx);

    let result;

    {
        let tt = TurboTasks::new(MemoryBackend::default());
        let server = NextDevServerBuilder::new(
            tt.clone(),
            project_dir.to_string_lossy().to_string(),
            workspace_root.to_string_lossy().to_string(),
        )
        .entry_request(EntryRequest::Module(
            "@turbo/pack-test-harness".to_string(),
            "/harness".to_string(),
        ))
        .entry_request(EntryRequest::Relative("index.js".to_owned()))
        .eager_compile(false)
        .hostname(requested_addr.ip())
        .port(requested_addr.port())
        .log_level(turbopack_binding::turbopack::core::issue::IssueSeverity::Warning)
        .log_detail(true)
        .issue_reporter(Box::new(move || {
            TestIssueReporterVc::new(issue_tx.clone()).into()
        }))
        .show_all(true)
        .build()
        .await
        .unwrap();

        let local_addr =
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), server.addr.port());

        println!(
            "{event_type} - server started at http://{address}",
            event_type = "ready".green(),
            address = server.addr
        );

        if *DEBUG_START {
            if *DEBUG_OPEN {
                webbrowser::open(&format!("http://{}", local_addr)).unwrap();
            }
            tokio::select! {
                _ = mock_server_future => {},
                _ = pending() => {},
                _ = server.future => {},
            };
            panic!("Never resolves")
        }

        result = tokio::select! {
            // Poll the mock_server first to add the env var
            _ = mock_server_future => panic!("Never resolves"),
            r = run_browser(local_addr, &project_dir) => r.expect("error while running browser"),
            _ = server.future => panic!("Never resolves"),
        };

        env::remove_var("TURBOPACK_TEST_ONLY_MOCK_SERVER");

        let task = tt.spawn_once_task(async move {
            let issues_fs = DiskFileSystemVc::new(
                "issues".to_string(),
                resource.join("issues").to_string_lossy().to_string(),
            )
            .as_file_system();

            let mut issues = vec![];
            while let Ok(issue) = issue_rx.try_recv() {
                issues.push(issue);
            }

            snapshot_issues(
                issues.iter().cloned(),
                issues_fs.root(),
                &cargo_workspace_root.to_string_lossy(),
            )
            .await?;

            Ok(NothingVc::new().into())
        });
        tt.wait_task_completion(task, true).await.unwrap();
    }

    if let Err(err) = retry(
        (),
        |()| std::fs::remove_dir_all(&resource_temp),
        3,
        Duration::from_millis(100),
    ) {
        eprintln!("Failed to remove temporary directory: {}", err);
    }

    result
}

async fn create_browser(is_debugging: bool) -> Result<(Browser, TempDir, JoinSet<()>)> {
    let mut config_builder = BrowserConfig::builder();
    config_builder = config_builder.no_sandbox();
    let tmp = TempDir::new("chromiumoxid").unwrap();
    config_builder = config_builder.user_data_dir(&tmp);
    if is_debugging {
        config_builder = config_builder
            .with_head()
            .args(vec!["--auto-open-devtools-for-tabs"]);
    }

    let (browser, mut handler) = retry_async(
        config_builder.build().map_err(|s| anyhow!(s))?,
        |c| {
            let c = c.clone();
            Browser::launch(c)
        },
        3,
        Duration::from_millis(100),
    )
    .await
    .context("Launching browser failed")?;

    // For windows it's important that the browser is dropped so that the test can
    // complete. To do that we need to cancel the spawned task below (which will
    // drop the browser). For this we are using a JoinSet which cancels all tasks
    // when dropped.
    let mut set = JoinSet::new();
    // See https://crates.io/crates/chromiumoxide
    set.spawn(async move {
        loop {
            if let Err(Ws(Protocol(ResetWithoutClosingHandshake))) = handler.next().await.unwrap() {
                // The user has most likely closed the browser. End gracefully.
                break;
            }
        }
    });

    Ok((browser, tmp, set))
}

const TURBOPACK_READY_BINDING: &str = "TURBOPACK_READY";
const TURBOPACK_DONE_BINDING: &str = "TURBOPACK_DONE";
const TURBOPACK_CHANGE_FILE_BINDING: &str = "TURBOPACK_CHANGE_FILE";
const BINDINGS: [&str; 3] = [
    TURBOPACK_READY_BINDING,
    TURBOPACK_DONE_BINDING,
    TURBOPACK_CHANGE_FILE_BINDING,
];

async fn run_browser(addr: SocketAddr, project_dir: &Path) -> Result<JsResult> {
    let is_debugging = *DEBUG_BROWSER;
    println!("starting browser...");
    let (browser, _tmp, mut handle) = create_browser(is_debugging).await?;

    println!("open about:blank...");
    // `browser.new_page()` opens a tab, navigates to the destination, and waits for
    // the page to load. chromiumoxide/Chrome DevTools Protocol has been flakey,
    // returning `ChannelSendError`s (WEB-259). Retry if necessary.
    let page = retry_async(
        (),
        |_| browser.new_page("about:blank"),
        5,
        Duration::from_millis(100),
    )
    .await
    .context("Failed to create new browser page")?;

    for binding in BINDINGS {
        page.execute(AddBindingParams::new(binding)).await?;
    }

    let mut errors = page
        .event_listener::<EventExceptionThrown>()
        .await
        .context("Unable to listen to exception events")?;
    let mut binding_events = page
        .event_listener::<EventBindingCalled>()
        .await
        .context("Unable to listen to binding events")?;
    let mut console_events = page
        .event_listener::<EventConsoleApiCalled>()
        .await
        .context("Unable to listen to console events")?;
    let mut network_response_events = page
        .event_listener::<EventResponseReceived>()
        .await
        .context("Unable to listen to response received events")?;

    println!("start navigating to http://{addr}...");
    page.evaluate_expression(format!("window.location='http://{addr}'"))
        .await
        .context("Unable to evaluate javascript to naviagate to target page")?;

    println!("waiting for navigation...");
    // Wait for the next network response event
    // This is the HTML page that we're testing
    network_response_events.next().await.context(
        "Network events channel ended unexpectedly while waiting on the network response",
    )?;

    if is_debugging {
        let _ = page.evaluate(
            r#"console.info("%cTurbopack tests:", "font-weight: bold;", "Waiting for TURBOPACK_READY to be signaled by page...");"#,
        )
        .await;
    }

    println!("finished navigation to http://{addr}");
    let mut errors_next = errors.next();
    let mut bindings_next = binding_events.next();
    let mut console_next = console_events.next();
    let mut network_next = network_response_events.next();
    let mut uncaught_exceptions = vec![];

    loop {
        tokio::select! {
            event = &mut console_next => {
                if let Some(event) = event {
                    println!(
                        "console {:?}: {}",
                        event.r#type,
                        event
                            .args
                            .iter()
                            .filter_map(|a| a.value.as_ref().map(|v| format!("{:?}", v)))
                            .collect::<Vec<_>>()
                            .join(", ")
                    );
                } else {
                    return Err(anyhow!("Console events channel ended unexpectedly"));
                }
                console_next = console_events.next();
            }
            event = &mut errors_next => {
                if let Some(event) = event {
                    let mut message = String::new();
                    let d = &event.exception_details;
                    writeln!(message, "{}", d.text)?;
                    if let Some(RemoteObject { preview: Some(ref exception), .. }) = d.exception {
                        if let Some(PropertyPreview{ value: Some(ref exception_message), .. }) = exception.properties.iter().find(|p| p.name == "message") {
                            writeln!(message, "{}", exception_message)?;
                        }
                    }
                    if let Some(stack_trace) = &d.stack_trace {
                        for frame in &stack_trace.call_frames {
                            writeln!(message, "    at {} ({}:{}:{})", frame.function_name, frame.url, frame.line_number, frame.column_number)?;
                        }
                    }
                    let expected_error = message.contains("(expected error)");
                    let message = message.trim_end();
                    if !is_debugging {
                        if !expected_error {
                            uncaught_exceptions.push(message.to_string());
                        }
                    } else if expected_error {
                        println!("Exception throw in page:\n{}", message);
                    } else {
                        println!("Exception throw in page (this would fail the test case without TURBOPACK_DEBUG_BROWSER):\n{}", message);
                    }
                } else {
                    return Err(anyhow!("Error events channel ended unexpectedly"));
                }
                errors_next = errors.next();
            }
            event = &mut bindings_next => {
                if let Some(event) = event {
                    if let Some(run_result) = handle_binding(&page, &*event, project_dir, is_debugging).await? {
                        return Ok(JsResult {
                            uncaught_exceptions,
                            run_result,
                        });
                    }
                } else {
                    return Err(anyhow!("Binding events channel ended unexpectedly"));
                }
                bindings_next = binding_events.next();
            }
            event = &mut network_next => {
                if let Some(event) = event {
                    println!("network {} [{}]", event.response.url, event.response.status);
                } else {
                    return Err(anyhow!("Network events channel ended unexpectedly"));
                }
                network_next = network_response_events.next();
            }
            result = handle.join_next() => {
                if let Some(result) = result {
                    result?;
                } else {
                    return Err(anyhow!("Browser closed"));
                }
            }
            () = tokio::time::sleep(Duration::from_secs(60)) => {
                if !is_debugging {
                    return Err(anyhow!("Test timeout while waiting for TURBOPACK_READY"));
                }
            }
        };
    }
}

fn get_free_local_addr() -> Result<SocketAddr, std::io::Error> {
    let socket = TcpSocket::new_v6()?;
    socket.bind("[::]:0".parse().unwrap())?;
    socket.local_addr()
}

async fn get_mock_server_future(mock_dir: &Path) -> Result<(), String> {
    if mock_dir.exists() {
        let port = get_free_local_addr().unwrap().port();
        env::set_var(
            "TURBOPACK_TEST_ONLY_MOCK_SERVER",
            format!("http://127.0.0.1:{}", port),
        );

        httpmock::standalone::start_standalone_server(
            port,
            false,
            Some(mock_dir.to_path_buf()),
            false,
            0,
        )
        .await
    } else {
        std::future::pending::<Result<(), String>>().await
    }
}

async fn handle_binding(
    page: &Page,
    event: &EventBindingCalled,
    project_dir: &Path,
    is_debugging: bool,
) -> Result<Option<JestRunResult>, anyhow::Error> {
    match event.name.as_str() {
        TURBOPACK_READY_BINDING => {
            if is_debugging {
                let run_tests_msg = "Entering debug mode. Run `await __jest__.run()` in the \
                                     browser console to run tests.";
                println!("\n\n{}", run_tests_msg);
                page.evaluate(format!(
                    r#"console.info("%cTurbopack tests:", "font-weight: bold;", "{}");"#,
                    run_tests_msg
                ))
                .await?;
            } else {
                page.evaluate_expression(
                    "(() => { __jest__.run().then((runResult) => \
                     TURBOPACK_DONE(JSON.stringify(runResult))) })()",
                )
                .await?;
            }
        }
        TURBOPACK_DONE_BINDING => {
            let run_result: JestRunResult = serde_json::from_str(&event.payload)?;
            return Ok(Some(run_result));
        }
        TURBOPACK_CHANGE_FILE_BINDING => {
            let change_file: ChangeFileCommand = serde_json::from_str(&event.payload)?;
            let path = Path::new(&change_file.path);

            // Ensure `change_file.path` can't escape the project directory.
            let path = path
                .components()
                .filter(|c| match c {
                    std::path::Component::Normal(_) => true,
                    _ => false,
                })
                .collect::<std::path::PathBuf>();

            let path: PathBuf = project_dir.join(path);

            let mut file_contents = std::fs::read_to_string(&path)?;
            if !file_contents.contains(&change_file.find) {
                page.evaluate(format!(
                    "__turbopackFileChanged({}, new Error({}));",
                    serde_json::to_string(&change_file.id)?,
                    serde_json::to_string(&format!(
                        "TURBOPACK_CHANGE_FILE: file {} does not contain {}",
                        path.display(),
                        &change_file.find
                    ))?
                ))
                .await?;
            } else {
                file_contents = file_contents.replace(&change_file.find, &change_file.replace_with);
                std::fs::write(&path, file_contents)?;

                page.evaluate(format!(
                    "__turbopackFileChanged({});",
                    serde_json::to_string(&change_file.id)?
                ))
                .await?;
            }
        }
        _ => {}
    };
    Ok(None)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangeFileCommand {
    path: String,
    id: String,
    find: String,
    replace_with: String,
}

#[turbo_tasks::value(shared)]
struct TestIssueReporter {
    #[turbo_tasks(trace_ignore, debug_ignore)]
    pub issue_tx: State<UnboundedSender<(PlainIssueReadRef, ValueDebugStringReadRef)>>,
}

#[turbo_tasks::value_impl]
impl TestIssueReporterVc {
    #[turbo_tasks::function]
    fn new(
        issue_tx: TransientInstance<UnboundedSender<(PlainIssueReadRef, ValueDebugStringReadRef)>>,
    ) -> Self {
        TestIssueReporter {
            issue_tx: State::new((*issue_tx).clone()),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl IssueReporter for TestIssueReporter {
    #[turbo_tasks::function]
    async fn report_issues(
        &self,
        captured_issues: TransientInstance<ReadRef<CapturedIssues>>,
        _source: TransientValue<RawVc>,
    ) -> Result<BoolVc> {
        let log_options = LogOptions {
            current_dir: PathBuf::new(),
            project_dir: PathBuf::new(),
            show_all: true,
            log_detail: true,
            log_level: IssueSeverity::Info,
        };
        let issue_tx = self.issue_tx.get_untracked().clone();
        for (issue, path) in captured_issues.iter_with_shortest_path() {
            let plain = NormalizedIssue(issue).cell().as_issue().into_plain(path);
            issue_tx.send((plain.await?, plain.dbg().await?))?;
            println!("{}", format_issue(&*plain.await?, None, &log_options));
        }
        Ok(BoolVc::cell(false))
    }
}

struct StackTraceReplacer;

impl Replacer for StackTraceReplacer {
    fn replace_append(&mut self, caps: &Captures<'_>, dst: &mut String) {
        let code = caps.get(2).map_or("", |m| m.as_str());
        if code.starts_with("node:") {
            return;
        }
        let mut name = caps.get(1).map_or("", |m| m.as_str());
        name = name.strip_prefix("Object.").unwrap_or(name);
        write!(dst, "\n at {} ({})", name, code).unwrap();
    }
}

#[turbo_tasks::value(transparent)]
struct NormalizedIssue(IssueVc);

#[turbo_tasks::value_impl]
impl Issue for NormalizedIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.0.severity()
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.0.context()
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        self.0.category()
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        self.0.title()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<StringVc> {
        let str = self.0.description().await?;
        let regex1 = Regex::new(r"\n  +at (.+) \((.+)\)(?: \[.+\])?").unwrap();
        let regex2 = Regex::new(r"\n  +at ()(.+) \[.+\]").unwrap();
        let regex3 = Regex::new(r"\n  +\[at .+\]").unwrap();
        Ok(StringVc::cell(
            regex3
                .replace_all(
                    &regex2.replace_all(
                        &regex1.replace_all(&str, StackTraceReplacer),
                        StackTraceReplacer,
                    ),
                    "",
                )
                .to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> StringVc {
        self.0.detail()
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> StringVc {
        self.0.documentation_link()
    }

    #[turbo_tasks::function]
    fn source(&self) -> OptionIssueSourceVc {
        self.0.source()
    }

    #[turbo_tasks::function]
    fn sub_issues(&self) -> IssuesVc {
        self.0.sub_issues()
    }
}
