#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

use std::sync::Arc;

use anyhow::Result;
use tokio::sync::Mutex as TokioMutex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadRef, Vc};
use turbo_tasks_fetch::{
    __test_only_reqwest_client_cache_clear, __test_only_reqwest_client_cache_len,
    FetchClientConfig, FetchErrorKind, FetchIssue,
};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};
use turbo_tasks_testing::{Registration, register, run_once};
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
                    .fetch(url, /* user_agent */ None)
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
                    .fetch(url, Some(rcstr!("mock-user-agent")))
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
                    .fetch(url.clone(), /* user_agent */ None)
                    .await?
                    .unwrap()
                    .await?;

                let second_response = &*client_vc
                    .fetch(url, /* user_agent */ None)
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
            let response_vc = client_vc.fetch(url.clone(), None);
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
                let response_vc = client_vc.fetch(url.clone(), None);

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
            .fetch(url.clone(), /* user_agent */ None)
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
