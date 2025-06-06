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
        let server = httpmock::MockServer::start();
        let resource_mock = server.mock(|when, then| {
            when.path("/foo.woff");
            then.status(200).body("responsebody");
        });

        let result = &*fetch(server.url("/foo.woff").into(), None, Vc::cell(None))
            .await
            .unwrap();
        resource_mock.assert();

        match result {
            Err(_) => panic!(),
            Ok(response) => {
                let response = response.await?;
                assert_eq!(response.status, 200);
                assert_eq!(*response.body.to_string().await?, "responsebody");
            }
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn sends_user_agent() {
    run(&REGISTRATION, || async {
        let server = httpmock::MockServer::start();
        let resource_mock = server.mock(|when, then| {
            when.path("/foo.woff").header("User-Agent", "foo");
            then.status(200).body("responsebody");
        });

        let result = &*fetch(
            server.url("/foo.woff").into(),
            Some(rcstr!("foo")),
            Vc::cell(None),
        )
        .await
        .unwrap();
        resource_mock.assert();

        let Ok(response) = result else { panic!() };

        let response = response.await?;
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
        let server = httpmock::MockServer::start();
        let resource_mock = server.mock(|when, then| {
            when.path("/foo.woff").header("User-Agent", "foo");
            then.status(200).body("responsebody");
        });

        let url: RcStr = server.url("/foo.woff").into();
        let user_agent = Some(rcstr!("foo"));
        let proxy = Vc::cell(None);
        let result = &*fetch(url.clone(), user_agent.clone(), proxy).await?;
        resource_mock.assert();

        let Ok(response_vc) = result else { panic!() };
        let response = response_vc.await?;
        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");

        let second_result = &*fetch(url, user_agent, proxy).await?;
        let Ok(second_response_vc) = second_result else {
            panic!()
        };
        let second_response = second_response_vc.await?;

        // Assert that a second request is never sent -- the result is cached via turbo
        // tasks
        resource_mock.assert_hits(1);
        assert_eq!(response, second_response);
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[tokio::test]
async fn errors_on_failed_connection() {
    run(&REGISTRATION, || async {
        let url = rcstr!("https://doesnotexist/foo.woff");
        let result = &*fetch(url.clone(), None, Vc::cell(None)).await?;
        let Err(err_vc) = result else {
            panic!()
        };
        let err = &*err_vc.await?;
        assert_eq!(*err.kind.await?, FetchErrorKind::Connect);
        assert_eq!(*err.url.await?, url);

        let issue = err_vc.to_issue(IssueSeverity::Error.into(), get_issue_context());
        assert_eq!(*issue.severity().await?, IssueSeverity::Error);
        assert_eq!(*issue.description().await?.unwrap().await?, StyledString::Text(rcstr!("There was an issue establishing a connection while requesting https://doesnotexist/foo.woff.")));
        anyhow::Ok(())
    })
    .await.unwrap()
}

#[tokio::test]
async fn errors_on_404() {
    run(&REGISTRATION, || async {
        let server = httpmock::MockServer::start();
        let resource_url: RcStr = server.url("/").into();
        let result = &*fetch(resource_url.clone(), None, Vc::cell(None))
            .await
            .unwrap();
        let Err(err_vc) = result else { panic!() };
        let err = &*err_vc.await?;
        assert!(matches!(*err.kind.await?, FetchErrorKind::Status(404)));
        assert_eq!(*err.url.await?, resource_url);

        let issue = err_vc.to_issue(IssueSeverity::Error.into(), get_issue_context());
        assert_eq!(*issue.severity().await?, IssueSeverity::Error);
        assert_eq!(
            *issue.description().await?.unwrap().await?,
            StyledString::Text(
                format!(
                    "Received response with status 404 when requesting {}",
                    &resource_url
                )
                .into()
            )
        );
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

fn get_issue_context() -> Vc<FileSystemPath> {
    DiskFileSystem::new(rcstr!("root"), rcstr!("/"), vec![]).root()
}
