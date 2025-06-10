#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this
#![cfg(test)]

use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::Vc;
use turbo_tasks_fetch::{FetchErrorKind, fetch};
use turbo_tasks_fs::{DiskFileSystem, FileSystem, FileSystemPath};
use turbo_tasks_testing::{Registration, register, run};
use turbopack_core::issue::{Issue, IssueSeverity, StyledString};

static REGISTRATION: Registration = register!(turbo_tasks_fetch::register);

#[tokio::test]
async fn basic_get() {
    run(&REGISTRATION, || async {
        let mut server = mockito::Server::new_async().await;
        let resource_mock = server
            .mock("GET", "/foo.woff")
            .with_body("responsebody")
            .create_async()
            .await;

        let response = &*fetch(
            RcStr::from(format!("{}/foo.woff", server.url())),
            /* user_agent */ None,
            /* proxy */ Vc::cell(None),
        )
        .await?
        .unwrap()
        .await?;

        resource_mock.assert_async().await;

        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn sends_user_agent() {
    run(&REGISTRATION, || async {
        let mut server = mockito::Server::new_async().await;
        let resource_mock = server
            .mock("GET", "/foo.woff")
            .match_header("User-Agent", "mock-user-agent")
            .with_body("responsebody")
            .create_async()
            .await;

        eprintln!("{}", server.url());

        let response = &*fetch(
            RcStr::from(format!("{}/foo.woff", server.url())),
            Some(rcstr!("mock-user-agent")),
            /* proxy */ Vc::cell(None),
        )
        .await?
        .unwrap()
        .await?;

        resource_mock.assert_async().await;

        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

// This is temporary behavior.
// TODO: Implement invalidation that respects Cache-Control headers.
#[tokio::test]
async fn invalidation_does_not_invalidate() {
    run(&REGISTRATION, || async {
        let mut server = mockito::Server::new_async().await;
        let resource_mock = server
            .mock("GET", "/foo.woff")
            .with_body("responsebody")
            .with_header("Cache-Control", "no-store")
            .create_async()
            .await;

        let url = RcStr::from(format!("{}/foo.woff", server.url()));
        let proxy_vc = Vc::cell(None);
        let response = &*fetch(url.clone(), /* user_agent */ None, proxy_vc)
            .await?
            .unwrap()
            .await?;

        resource_mock.assert_async().await;

        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");

        let second_response = &*fetch(url.clone(), /* user_agent */ None, proxy_vc)
            .await?
            .unwrap()
            .await?;

        // Assert that a second request is never sent -- the result is cached via turbo tasks
        resource_mock.expect(1).assert_async().await;

        assert_eq!(response, second_response);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn errors_on_failed_connection() {
    run(&REGISTRATION, || async {
        // Try to connect to port 0 on localhost, which is never valid and immediately returns
        // `ECONNREFUSED`.
        // Other values (e.g. domain name, reservered IP address block) may result in long timeouts.
        let url = rcstr!("http://127.0.0.1:0/foo.woff");
        let response_vc = fetch(url.clone(), None, Vc::cell(None));
        let err_vc = &*response_vc.await?.unwrap_err();
        let err = err_vc.await?;

        assert_eq!(*err.kind.await?, FetchErrorKind::Connect);
        assert_eq!(*err.url.await?, url);

        let issue = err_vc.to_issue(IssueSeverity::Error.into(), get_issue_context());
        assert_eq!(*issue.severity().await?, IssueSeverity::Error);
        assert_eq!(
            *issue.description().await?.unwrap().await?,
            StyledString::Text(rcstr!(
                "There was an issue establishing a connection while requesting \
                http://127.0.0.1:0/foo.woff."
            ))
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn errors_on_404() {
    run(&REGISTRATION, || async {
        let mut server = mockito::Server::new_async().await;
        let resource_mock = server
            .mock("GET", "/")
            .with_status(404)
            .create_async()
            .await;

        let url = RcStr::from(server.url());
        let response_vc = fetch(url.clone(), None, Vc::cell(None));
        let err_vc = &*response_vc.await?.unwrap_err();
        let err = err_vc.await?;

        resource_mock.assert_async().await;
        assert!(matches!(*err.kind.await?, FetchErrorKind::Status(404)));
        assert_eq!(*err.url.await?, url);

        let issue = err_vc.to_issue(IssueSeverity::Error.into(), get_issue_context());
        assert_eq!(*issue.severity().await?, IssueSeverity::Error);
        assert_eq!(
            *issue.description().await?.unwrap().await?,
            StyledString::Text(RcStr::from(format!(
                "Received response with status 404 when requesting {url}"
            )))
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

fn get_issue_context() -> Vc<FileSystemPath> {
    DiskFileSystem::new(rcstr!("root"), rcstr!("/"), vec![]).root()
}
