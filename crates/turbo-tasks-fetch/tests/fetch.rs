#![cfg(test)]
use turbo_tasks::primitives::{OptionStringVc, StringVc};
use turbo_tasks_fetch::{fetch, register};
use turbo_tasks_testing::{register, run};

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

        let response = &*fetch(StringVc::cell(server.url("/foo.woff")), OptionStringVc::cell(None)).await?;
        resource_mock.assert();
        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");
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

        let response = fetch(StringVc::cell(server.url("/foo.woff")), OptionStringVc::cell(Some("foo".to_owned()))).await?;
        resource_mock.assert();
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
        let response = fetch(url, user_agent).await?;
        resource_mock.assert();
        assert_eq!(response.status, 200);
        assert_eq!(*response.body.to_string().await?, "responsebody");

        let second_response = fetch(url, user_agent).await?;
        // Assert that a second request is never sent -- the result is cached via turbo tasks
        resource_mock.assert_hits(1);
        assert_eq!(response, second_response);
    }
}
