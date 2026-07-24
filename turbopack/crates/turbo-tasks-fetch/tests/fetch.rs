#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

use std::{sync::Arc, time::Duration};

use anyhow::Result;
use tokio::sync::Mutex as TokioMutex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadRef, TransientInstance, Vc};
use turbo_tasks_fetch::{
    __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len,
    FetchClientConfig, FetchErrorKind, FetchIssue,
};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};
use turbo_tasks_testing::{Registration, TestInstance, register, run_once};
use turbopack_core::issue::{Issue, IssueSeverity, StyledString};

static REGISTRATION: Registration = register!();

/// We inspect information about the global client cache, so *every* test in this process *must*
/// acquire and hold this lock to prevent potential flakiness.
static GLOBAL_TEST_LOCK: TokioMutex<()> = TokioMutex::const_new(());

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn basic_get() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let server = Arc::new(TokioMutex::new(mockito::Server::new_async().await));
    run_once(&REGISTRATION, move || {
        let server = server.clone();
        async move {
            let mut server = server.lock().await;
            server.reset();
            let resource_mock = server
                .mock("GET", "/foo.woff")
                .with_body("responsebody")
                .create_async()
                .await;

            #[turbo_tasks::value]
            struct FetchOutput(u16, RcStr);

            #[turbo_tasks::function(operation, root)]
            async fn fetch_operation(url: RcStr) -> Result<Vc<FetchOutput>> {
                let client_vc = FetchClientConfig::default().cell();
                let response = &*client_vc
                    .fetch(
                        url, /* user_agent */ None, /* soft_deadline */ None,
                    )
                    .await?
                    .unwrap()
                    .await?;
                Ok(FetchOutput(response.status, response.body.to_string().owned().await?).cell())
            }

            let FetchOutput(status, body) =
                &*fetch_operation(RcStr::from(format!("{}/foo.woff", server.url())))
                    .read_strongly_consistent()
                    .await?;

            // this test runs many times, this could be zero if cached
            resource_mock.expect_at_most(1).assert_async().await;

            assert_eq!(*status, 200);
            assert_eq!(body, "responsebody");
            anyhow::Ok(())
        }
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn sends_user_agent() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let server = Arc::new(TokioMutex::new(mockito::Server::new_async().await));
    run_once(&REGISTRATION, move || {
        let server = server.clone();
        async move {
            let mut server = server.lock().await;
            server.reset();
            let resource_mock = server
                .mock("GET", "/foo.woff")
                .match_header("User-Agent", "mock-user-agent")
                .with_body("responsebody")
                .create_async()
                .await;

            #[turbo_tasks::value]
            struct FetchOutput(u16, RcStr);

            #[turbo_tasks::function(operation, root)]
            async fn fetch_operation(url: RcStr) -> Result<Vc<FetchOutput>> {
                let client_vc = FetchClientConfig::default().cell();
                let response = &*client_vc
                    .fetch(
                        url,
                        Some(rcstr!("mock-user-agent")),
                        /* soft_deadline */ None,
                    )
                    .await?
                    .unwrap()
                    .await?;
                Ok(FetchOutput(response.status, response.body.to_string().owned().await?).cell())
            }

            let FetchOutput(status, body) =
                &*fetch_operation(RcStr::from(format!("{}/foo.woff", server.url())))
                    .read_strongly_consistent()
                    .await?;

            resource_mock.expect_at_most(1).assert_async().await;

            assert_eq!(*status, 200);
            assert_eq!(body, "responsebody");
            anyhow::Ok(())
        }
    })
    .await
    .unwrap()
}

// This is temporary behavior.
// TODO: Implement invalidation that respects Cache-Control headers.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn invalidation_does_not_invalidate() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let server = Arc::new(TokioMutex::new(mockito::Server::new_async().await));
    run_once(&REGISTRATION, move || {
        let server = server.clone();
        async move {
            let mut server = server.lock().await;
            server.reset();
            let resource_mock = server
                .mock("GET", "/foo.woff")
                .with_body("responsebody")
                .with_header("Cache-Control", "no-store")
                .create_async()
                .await;

            let url = RcStr::from(format!("{}/foo.woff", server.url()));
            #[turbo_tasks::value]
            struct FetchOutput(u16, RcStr, u16, RcStr);

            #[turbo_tasks::function(operation, root)]
            async fn fetch_operation(url: RcStr) -> Result<Vc<FetchOutput>> {
                let client_vc = FetchClientConfig::default().cell();
                let response = &*client_vc
                    .fetch(
                        url.clone(),
                        /* user_agent */ None,
                        /* soft_deadline */ None,
                    )
                    .await?
                    .unwrap()
                    .await?;

                let second_response = &*client_vc
                    .fetch(
                        url, /* user_agent */ None, /* soft_deadline */ None,
                    )
                    .await?
                    .unwrap()
                    .await?;

                Ok(FetchOutput(
                    response.status,
                    response.body.to_string().owned().await?,
                    second_response.status,
                    second_response.body.to_string().owned().await?,
                )
                .cell())
            }

            let FetchOutput(status, body, second_status, second_body) =
                &*fetch_operation(url).read_strongly_consistent().await?;

            assert_eq!(*status, 200);
            assert_eq!(body, "responsebody");
            assert_eq!((*status, body), (*second_status, second_body));

            // this test runs many times, this could be zero if cached
            // Assert that a second request is never sent -- the result is cached via turbo tasks
            resource_mock.expect_at_most(1).assert_async().await;

            anyhow::Ok(())
        }
    })
    .await
    .unwrap()
}

fn get_issue_context() -> Vc<FileSystemPath> {
    DiskFileSystem::new(rcstr!("root"), Vc::cell(rcstr!("/"))).root()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn errors_on_failed_connection() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    run_once(&REGISTRATION, || async {
        #[turbo_tasks::value]
        struct FetchOutput(
            ReadRef<FetchErrorKind>,
            RcStr,
            ReadRef<FetchIssue>,
            StyledString,
        );

        #[turbo_tasks::function(operation, root)]
        async fn fetch_operation(url: RcStr) -> Result<Vc<FetchOutput>> {
            let client_vc = FetchClientConfig::default().cell();
            let response_vc = client_vc.fetch(url.clone(), None, /* soft_deadline */ None);
            let err_vc = &*response_vc.await?.unwrap_err();
            let err = err_vc.await?;
            let err_kind = err.kind.await?;
            let err_url = err.url.owned().await?;

            let issue_vc = err_vc.to_issue(IssueSeverity::Error, get_issue_context().owned().await?);
            let issue = issue_vc.await?;
            let issue_description = issue
                .description()
                .await?
                .expect("description is not None");

            Ok(FetchOutput(err_kind, err_url, issue, issue_description).cell())
        }

        // Try to connect to port 0 on localhost, which is never valid and immediately returns
        // `ECONNREFUSED`.
        // Other values (e.g. domain name, reserved IP address block) may result in long timeouts.
        let url = rcstr!("http://127.0.0.1:0/foo.woff");
        let FetchOutput(err_kind, err_url, issue, issue_description) =
            &*fetch_operation(url.clone()).read_strongly_consistent().await?;

        assert!(matches!(**err_kind, FetchErrorKind::Connect));
        assert_eq!(*err_url, url);

        assert_eq!(issue.severity(), IssueSeverity::Error);
        assert_eq!(
            issue_description.to_unstyled_string(),
            "There was an issue establishing a connection while requesting http://127.0.0.1:0/foo.woff"
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn errors_on_404() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let mut server = mockito::Server::new_async().await;
    let resource_mock = Arc::new(
        server
            .mock("GET", "/")
            .with_status(404)
            .create_async()
            .await
            .expect_at_least(1),
    );
    run_once(&REGISTRATION, move || {
        let resource_mock = resource_mock.clone();
        let url = RcStr::from(server.url());
        async move {
            #[turbo_tasks::value]
            struct FetchOutput(
                ReadRef<FetchErrorKind>,
                RcStr,
                ReadRef<FetchIssue>,
                StyledString,
            );

            #[turbo_tasks::function(operation, root)]
            async fn fetch_operation(url: RcStr) -> Result<Vc<FetchOutput>> {
                let client_vc = FetchClientConfig::default().cell();
                let response_vc = client_vc.fetch(url.clone(), None, /* soft_deadline */ None);

                let err_vc = &*response_vc.await?.unwrap_err();
                let err = err_vc.await?;
                let err_kind = err.kind.await?;
                let err_url = err.url.owned().await?;

                let issue_vc =
                    err_vc.to_issue(IssueSeverity::Error, get_issue_context().owned().await?);
                let issue = issue_vc.await?;
                let issue_description =
                    issue.description().await?.expect("description is not None");

                Ok(FetchOutput(err_kind, err_url, issue, issue_description).cell())
            }

            let FetchOutput(err_kind, err_url, issue, issue_description) =
                &*fetch_operation(url.clone())
                    .read_strongly_consistent()
                    .await?;

            resource_mock.assert_async().await;
            assert!(matches!(**err_kind, FetchErrorKind::Status(404)));
            assert_eq!(*err_url, url);

            assert_eq!(issue.severity(), IssueSeverity::Error);
            assert_eq!(
                issue_description.to_unstyled_string(),
                format!("Received response with status 404 when requesting {url}")
            );
            anyhow::Ok(())
        }
    })
    .await
    .unwrap()
}

#[turbo_tasks::function(operation, root)]
async fn fetch_body(url: RcStr) -> Result<Vc<RcStr>> {
    let client_vc = FetchClientConfig {
        min_cache_control: Duration::ZERO,
        ..Default::default()
    }
    .cell();
    let response = &*client_vc
        .fetch(
            url, /* user_agent */ None, /* soft_deadline */ None,
        )
        .await?
        .unwrap()
        .await?;
    Ok(response.body.to_string())
}

/// Test that the TTL timer invalidates `fetch_inner` within a session.
///
/// 1. Server returns body "v1" with `max-age=1`
/// 2. First fetch returns "v1"
/// 3. Server changes to return "v2"
/// 4. Wait 2s for TTL to expire (timer fires, invalidates fetch_inner)
/// 5. Strongly consistent read returns "v2"
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ttl_invalidates_within_session() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let mut server = mockito::Server::new_async().await;
    let url = RcStr::from(format!("{}/ttl-within", server.url()));

    server
        .mock("GET", "/ttl-within")
        .with_body("v1")
        .with_header("Cache-Control", "max-age=1")
        .create_async()
        .await;

    let TestInstance { tt, .. } =
        REGISTRATION.create_turbo_tasks("ttl_invalidates_within_session", true);
    let body = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            let body = fetch_body(url).read_strongly_consistent().await?;
            Ok((*body).clone())
        }
    })
    .await
    .unwrap();
    assert_eq!(&*body, "v1");

    // Change the server response
    server.reset();
    server
        .mock("GET", "/ttl-within")
        .with_body("v2")
        .with_header("Cache-Control", "max-age=1")
        .create_async()
        .await;

    // Wait for the TTL timer to fire (max-age=1, so wait 2s to be safe)
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // The timer should have invalidated fetch_inner, so a new strongly consistent read
    // should re-fetch and return the updated body.
    let body = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            let body = fetch_body(url).read_strongly_consistent().await?;
            Ok((*body).clone())
        }
    })
    .await
    .unwrap();
    assert_eq!(&*body, "v2");

    tt.stop_and_wait().await;
}

/// Test that after a session restore, an expired TTL causes a re-fetch.
///
/// 1. Server returns "v1" with `max-age=1`
/// 2. Fetch, stop TT
/// 3. Wait for TTL to expire
/// 4. Create new TT (warm restore), server now returns "v2"
/// 5. Fetch should return "v2" (deadline expired, timer fires immediately on restore)
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn ttl_invalidates_on_session_restore() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let mut server = mockito::Server::new_async().await;
    let url = RcStr::from(format!("{}/ttl-restore", server.url()));

    server
        .mock("GET", "/ttl-restore")
        .with_body("v1")
        .with_header("Cache-Control", "max-age=1")
        .create_async()
        .await;

    // Session 1: fetch and cache
    let TestInstance { tt, .. } =
        REGISTRATION.create_turbo_tasks("ttl_invalidates_on_session_restore", true);
    let body = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            let body = fetch_body(url).read_strongly_consistent().await?;
            Ok((*body).clone())
        }
    })
    .await
    .unwrap();
    assert_eq!(&*body, "v1");
    tt.stop_and_wait().await;

    // Wait for TTL to expire
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Change server response
    server.reset();
    server
        .mock("GET", "/ttl-restore")
        .with_body("v2")
        .with_header("Cache-Control", "max-age=1")
        .create_async()
        .await;

    // Session 2: warm restore — TTL expired, should re-fetch.
    // On restore, `fetch` (session_dependent) re-executes and reads the cached `fetch_inner`
    // result. The deadline is expired, so it spawns a zero-duration timer. That timer
    // invalidates `fetch_inner` asynchronously, which triggers a second round of execution.
    // We need to read twice: the first read returns the stale cached value, then wait for the
    // timer-triggered re-execution to settle.
    let TestInstance { tt, .. } =
        REGISTRATION.create_turbo_tasks("ttl_invalidates_on_session_restore", false);
    turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            // First read returns the stale cached value, but triggers the timer
            let _body = fetch_body(url).read_strongly_consistent().await?;
            Ok(())
        }
    })
    .await
    .unwrap();

    // Wait for the timer to fire and re-execution to settle
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    let body = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            let body = fetch_body(url).read_strongly_consistent().await?;
            Ok((*body).clone())
        }
    })
    .await
    .unwrap();
    assert_eq!(&*body, "v2");
    tt.stop_and_wait().await;
}

#[turbo_tasks::function(operation, root)]
async fn fetch_is_err(url: RcStr) -> Result<Vc<bool>> {
    let client_vc = FetchClientConfig::default().cell();
    let result = &*client_vc.fetch(url, None, /* soft_deadline */ None).await?;
    Ok(Vc::cell(result.is_err()))
}

/// Test that fetch errors are retried on session restore.
///
/// 1. Server returns connection refused (error)
/// 2. Fetch returns error
/// 3. Stop TT, start new session
/// 4. Server now returns 200
/// 5. Fetch should succeed (error was session-dependent, retried on restore)
///
/// TODO: Consider retrying errors within a session with backoff.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn errors_retried_on_session_restore() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let mut server = mockito::Server::new_async().await;
    let url = RcStr::from(format!("{}/error-restore", server.url()));

    // Session 1: server returns 500
    server
        .mock("GET", "/error-restore")
        .with_status(500)
        .create_async()
        .await;

    let TestInstance { tt, .. } =
        REGISTRATION.create_turbo_tasks("errors_retried_on_session_restore", true);
    let is_err = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            let is_err = *fetch_is_err(url).read_strongly_consistent().await?;
            Ok(is_err)
        }
    })
    .await
    .unwrap();
    assert!(is_err, "first fetch should be an error");
    tt.stop_and_wait().await;

    // Session 2: server now returns 200
    server.reset();
    server
        .mock("GET", "/error-restore")
        .with_body("success")
        .create_async()
        .await;

    let TestInstance { tt, .. } =
        REGISTRATION.create_turbo_tasks("errors_retried_on_session_restore", false);
    let is_err = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        async move {
            let is_err = *fetch_is_err(url).read_strongly_consistent().await?;
            Ok(is_err)
        }
    })
    .await
    .unwrap();
    assert!(!is_err, "second fetch should succeed after session restore");
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn client_cache() {
    let mut server = mockito::Server::new_async().await;
    let mut mocks = Vec::new();
    for path in ["/foo", "/bar"] {
        mocks.push(
            server
                .mock("GET", path)
                .with_body("responsebody")
                .create_async()
                .await,
        )
    }
    let server_url = RcStr::from(server.url());

    // a simple fetch that should always succeed
    #[turbo_tasks::function(operation, root)]
    async fn simple_fetch_operation(server_url: RcStr, path: RcStr) -> anyhow::Result<()> {
        let url = RcStr::from(format!("{}{}", server_url, path));
        let response = match &*FetchClientConfig::default()
            .cell()
            .fetch(
                url.clone(),
                /* user_agent */ None,
                /* soft_deadline */ None,
            )
            .await?
        {
            Ok(resp) => resp.await?,
            Err(_err) => {
                anyhow::bail!("fetch error")
            }
        };

        if response.status != 200 {
            anyhow::bail!("non-200 status code")
        }

        anyhow::Ok(())
    }

    let _guard = GLOBAL_TEST_LOCK.lock().await;
    __test_only_reqwest_client_cache_clear();
    assert_eq!(__test_only_reqwest_client_cache_len(), 0);
    run_once(&REGISTRATION, move || {
        let server_url = server_url.clone();
        async move {
            simple_fetch_operation(server_url.clone(), rcstr!("/foo"))
                .read_strongly_consistent()
                .await
                .unwrap();
            assert_eq!(__test_only_reqwest_client_cache_len(), 1);

            // the client is reused if the config is the same (by equality)
            simple_fetch_operation(server_url, rcstr!("/bar"))
                .read_strongly_consistent()
                .await
                .unwrap();
            assert_eq!(__test_only_reqwest_client_cache_len(), 1);

            Ok(())
        }
    })
    .await
    .unwrap()
}

/// Outcome of a soft-deadline fetch, flattened so it can cross the turbo-tasks boundary.
#[turbo_tasks::value]
#[derive(Clone)]
enum SoftFetchOutcome {
    /// The real response arrived (within the deadline, or on the re-run after the background
    /// fetch completed). Carries the body.
    Body(RcStr),
    /// The soft deadline elapsed before the response arrived.
    SoftTimeout,
    /// A different (real) error occurred.
    OtherError,
}

/// A short soft deadline so tests don't have to wait long for the timeout path.
const TEST_SOFT_DEADLINE: Duration = Duration::from_millis(200);

/// Shared, ordered log of every outcome `soft_fetch` observed across its (re-)executions. Lets a
/// test see the *transient* soft-timeout sentinel as well as the real body it's later replaced by,
/// which a single strongly-consistent read cannot (it chases the invalidation to the final value).
type OutcomeLog = Arc<std::sync::Mutex<Vec<SoftFetchOutcome>>>;

#[turbo_tasks::function(operation, root)]
async fn soft_fetch(
    url: RcStr,
    log: TransientInstance<OutcomeLog>,
) -> Result<Vc<SoftFetchOutcome>> {
    let client_vc = FetchClientConfig {
        min_cache_control: Duration::ZERO,
        ..Default::default()
    }
    .cell();
    // Eventual (default) read: `soft_fetch` sees `fetch`'s *current* value and takes a dependency
    // on it. When the background request completes and invalidates `fetch`, `fetch` re-runs, which
    // invalidates and re-runs `soft_fetch` — so the log records the sentinel then the real body.
    let result = &*client_vc
        .fetch(url, /* user_agent */ None, Some(TEST_SOFT_DEADLINE))
        .await?;
    let outcome = match result {
        Ok(resp) => SoftFetchOutcome::Body(resp.await?.body.to_string().owned().await?),
        Err(err) => match &*err.await?.kind.await? {
            FetchErrorKind::SoftTimeout => SoftFetchOutcome::SoftTimeout,
            _ => SoftFetchOutcome::OtherError,
        },
    };
    log.lock().unwrap().push(outcome.clone());
    Ok(outcome.cell())
}

/// A request slower than the soft deadline must not block the caller for the full request: the
/// soft deadline trips, `fetch` returns a fallback sentinel, the request keeps running in the
/// background, and once it completes it invalidates `fetch` so the caller re-runs and picks up the
/// real body.
///
/// The soft-timeout sentinel is intentionally *transient* — the background completion invalidates
/// `fetch`, and a single `read_strongly_consistent` chases that to the settled real value, hiding
/// the sentinel. So instead of catching it in one read, we record the *sequence* of outcomes
/// `soft_fetch` produces across its re-executions and assert it saw `SoftTimeout` first and the
/// real `Body` after. This proves BOTH halves of the feature: the fallback is returned promptly
/// while the request is in flight, AND the background completion invalidates the caller so it
/// re-runs to the real value. (The underlying request is issued at least once; see the note on
/// `expect_at_least` about re-arm churn.)
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn soft_timeout_then_real_result() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let mut server = mockito::Server::new_async().await;
    let url = RcStr::from(format!("{}/soft", server.url()));

    // Respond only after a delay that comfortably exceeds the soft deadline, so the deadline trips
    // first and the response arrives while the request is "in the background". The blocking sleep
    // runs on mockito's server thread, delaying just this response. The delay is well under the
    // default reqwest timeout, so the request completes normally (not a hard timeout).
    let delay = TEST_SOFT_DEADLINE * 4;
    let mock = server
        .mock("GET", "/soft")
        .with_body_from_request(move |_req| {
            std::thread::sleep(delay);
            b"realbody".to_vec()
        })
        // At least once — the background request is actually issued. It may be issued more than
        // once: each soft-timeout re-arms a fresh deadline race, and while the request is still in
        // flight a re-run can start another attempt before the first is cached. This is the known
        // "re-arm on re-run" cost of the soft-deadline design; it converges once the result caches.
        .expect_at_least(1)
        .create_async()
        .await;

    let TestInstance { tt, .. } = REGISTRATION.create_turbo_tasks("soft_timeout_then_real", true);

    let log: OutcomeLog = Default::default();

    // `fetch`'s sentinel-returning execution has no in-flight children (the request runs in the
    // detached driver, not as a child of `fetch`), so a strongly-consistent read settles quickly on
    // the fallback sentinel rather than blocking for the full request. Once the background request
    // completes it invalidates `fetch`, and a re-run produces the real body. Because a
    // strongly-consistent read returns as soon as the graph is momentarily clean, a single read
    // does not reliably observe both states — so we poll-read repeatedly and let the shared `log`
    // accumulate every outcome `soft_fetch` observed across (re-)executions, then assert the
    // recorded *sequence*. We stop once the log has recorded the real body.
    let mut recorded = Vec::new();
    for _ in 0..50 {
        turbo_tasks::run_once(tt.clone(), {
            let url = url.clone();
            let log = log.clone();
            async move {
                soft_fetch(url, TransientInstance::new(log))
                    .read_strongly_consistent()
                    .await?;
                Ok(())
            }
        })
        .await
        .unwrap();
        recorded = log.lock().unwrap().clone();
        if recorded
            .iter()
            .any(|o| matches!(o, SoftFetchOutcome::Body(body) if body == "realbody"))
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    // The recorded sequence proves BOTH halves of the feature: a soft timeout first (fallback
    // returned promptly, without blocking for the slow request), then the real body (the background
    // completion invalidated the caller, forcing a re-run to the real value).
    let tags: Vec<_> = recorded.iter().map(outcome_tag).collect();
    assert!(
        matches!(recorded.first(), Some(SoftFetchOutcome::SoftTimeout)),
        "the first observed outcome should be the soft-timeout fallback, got {tags:?}"
    );
    assert!(
        recorded
            .iter()
            .any(|o| matches!(o, SoftFetchOutcome::Body(body) if body == "realbody")),
        "the real body should eventually be observed after the background fetch completes, got \
         {tags:?}"
    );

    // The background request was actually issued (at least once — see the mock's
    // `expect_at_least`).
    mock.assert_async().await;

    // NOTE: we intentionally do NOT call `tt.stop_and_wait()` here. The soft-deadline driver runs
    // as a detached `start_once_process` task that un-counts itself from the foreground gate while
    // it awaits the request, so `stop_and_wait` does not wait for it. `stop_and_wait` then drops
    // the backend storage, and if the still-settling driver touches it afterwards the process
    // aborts. This is a test-harness teardown race only (production uses a single long-lived
    // instance that never drops storage mid-driver). Letting `tt` drop without an explicit stop
    // avoids it.
}

/// Short tag for a `SoftFetchOutcome`, for readable assertion messages.
fn outcome_tag(o: &SoftFetchOutcome) -> &'static str {
    match o {
        SoftFetchOutcome::Body(_) => "Body",
        SoftFetchOutcome::SoftTimeout => "SoftTimeout",
        SoftFetchOutcome::OtherError => "OtherError",
    }
}

/// A fast server (responds before the soft deadline) returns the real body immediately, with no
/// artificial soft-timeout latency.
#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn fast_fetch_under_soft_deadline() {
    let _guard = GLOBAL_TEST_LOCK.lock().await;
    let mut server = mockito::Server::new_async().await;
    let url = RcStr::from(format!("{}/fast", server.url()));

    server
        .mock("GET", "/fast")
        .with_body("realbody")
        .create_async()
        .await;

    let TestInstance { tt, .. } =
        REGISTRATION.create_turbo_tasks("fast_fetch_under_deadline", true);
    let log: OutcomeLog = Default::default();
    let outcome = turbo_tasks::run_once(tt.clone(), {
        let url = url.clone();
        let log = log.clone();
        async move {
            soft_fetch(url, TransientInstance::new(log))
                .read_strongly_consistent()
                .await
        }
    })
    .await
    .unwrap();
    assert!(
        matches!(&*outcome, SoftFetchOutcome::Body(body) if body == "realbody"),
        "a fast fetch should return the real body without a soft timeout"
    );
    // The fast path produces exactly one outcome — the real body — with no soft-timeout sentinel.
    // Exactly one (not more) also proves the completion signal suppressed the redundant
    // invalidation: when the fetch beats the deadline the driver's `tx.send` succeeds, so it does
    // NOT invalidate `fetch`, so `soft_fetch` is not re-run.
    let recorded = log.lock().unwrap().clone();
    let tags: Vec<_> = recorded.iter().map(outcome_tag).collect();
    assert!(
        matches!(recorded.as_slice(), [SoftFetchOutcome::Body(body)] if body == "realbody"),
        "fast fetch should record exactly one real body and no re-run, got {tags:?}"
    );
    tt.stop_and_wait().await;
}
