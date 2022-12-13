#![cfg(test)]

use turbo_tasks::primitives::{OptionStringVc, StringVc};
use turbo_tasks_fetch::{fetch, register, FetchErrorKind};
use turbo_tasks_fs::{DiskFileSystemVc, FileSystemPathVc, FileSystemVc};
use turbo_tasks_testing::{register, run};
use turbopack_core::issue::{Issue, IssueSeverity};

register!();

#[tokio::test]
async fn basic_get() {
    run! {
        register();

        let server = httpmock::MockServer::start();
        let resource_mock = server.mock(|when, then| {
            when.path("/foo.woff");
            then.status(200)
                .body("responsebody");
        });


        let result = &*fetch(StringVc::cell(server.url("/foo.woff")), OptionStringVc::cell(None)).await?;
        resource_mock.assert();

        match result {
            Err(_) => panic!(),
            Ok(response) => {
                let response = response.await?;
                assert_eq!(response.status, 200);
                assert_eq!(*response.body.to_string().await?, "responsebody");
            }
        }
    }
}

#[tokio::test]
async fn sends_user_agent() {
    run! {
        register();

        let server = httpmock::MockServer::start();
        let resource_mock = server.mock(|when, then| {
            when.path("/foo.woff").header("User-Agent", "foo");
            then.status(200)
                .body("responsebody");
        });

        let result = &*fetch(StringVc::cell(server.url("/foo.woff")), OptionStringVc::cell(Some("foo".to_owned()))).await?;
        resource_mock.assert();

        let Ok(response) = result else {
            panic!()
        };

        let response = response.await?;
        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");
    }
}

// This is temporary behavior.
// TODO: Implement invalidation that respects Cache-Control headers.
#[tokio::test]
async fn invalidation_does_not_invalidate() {
    run! {
        register();

        let server = httpmock::MockServer::start();
        let resource_mock = server.mock(|when, then| {
            when.path("/foo.woff").header("User-Agent", "foo");
            then.status(200)
                .body("responsebody");
        });

        let url = StringVc::cell(server.url("/foo.woff"));
        let user_agent = OptionStringVc::cell(Some("foo".to_owned()));
        let result = &*fetch(url, user_agent).await?;
        resource_mock.assert();

        let Ok(response_vc) = result else {
            panic!()
        };
        let response = response_vc.await?;
        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");

        let second_result = &*fetch(url, user_agent).await?;
        let Ok(second_response_vc) = second_result else {
            panic!()
        };
        let second_response = second_response_vc.await?;

        // Assert that a second request is never sent -- the result is cached via turbo tasks
        resource_mock.assert_hits(1);
        assert_eq!(response, second_response);
    }
}

#[tokio::test]
async fn errors_on_failed_connection() {
    run! {
        register();

        let url = "https://doesnotexist/foo.woff";
        let result = &*fetch(StringVc::cell(url.to_owned()), OptionStringVc::cell(None)).await?;
        let Err(err_vc) = result else {
            panic!()
        };
        let err = &*err_vc.await?;
        assert_eq!(*err.kind.await?, FetchErrorKind::Connect);
        assert_eq!(*err.url.await?, url);

        let issue = err_vc.to_issue(IssueSeverity::Error.into(), get_issue_context());
        assert_eq!(*issue.severity().await?, IssueSeverity::Error);
        assert_eq!(*issue.category().await?, "fetch");
        assert_eq!(*issue.description().await?, "There was an issue establishing a connection while requesting https://doesnotexist/foo.woff.");
    }
}

#[tokio::test]
async fn errors_on_404() {
    run! {
        register();

        let server = httpmock::MockServer::start();
        let resource_url = server.url("/");
        let result = &*fetch(StringVc::cell(resource_url.clone()), OptionStringVc::cell(None)).await?;
        let Err(err_vc) = result else {
            panic!()
        };
        let err = &*err_vc.await?;
        assert!(matches!(*err.kind.await?, FetchErrorKind::Status(404)));
        assert_eq!(*err.url.await?, resource_url);

        let issue = err_vc.to_issue(IssueSeverity::Error.into(), get_issue_context());
        assert_eq!(*issue.severity().await?, IssueSeverity::Error);
        assert_eq!(*issue.category().await?, "fetch");
        assert_eq!(*issue.description().await?, format!("Received response with status 404 when requesting {}", &resource_url));
    }
}

fn get_issue_context() -> FileSystemPathVc {
    std::convert::Into::<FileSystemVc>::into(DiskFileSystemVc::new(
        "root".to_owned(),
        "/".to_owned(),
    ))
    .root()
}
