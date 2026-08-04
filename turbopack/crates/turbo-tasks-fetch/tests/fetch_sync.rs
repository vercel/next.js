#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
// Live verification of the SYNC HTTP-fetch bridge (option B): the async `reqwest`
// request is driven to completion on a small dedicated runtime via `block_on`, all
// from the sync turbo-tasks engine (no ambient tokio). Mirrors the async `basic_get`
// / `sends_user_agent` tests in `fetch.rs`. Gated to the `sync` build.
#![cfg(all(test, feature = "sync"))]

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{Vc, read};
use turbo_tasks_fetch::FetchClientConfig;
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value]
struct FetchOutput(u16, RcStr);

#[turbo_tasks::function(operation, root)]
fn fetch_operation(url: RcStr, user_agent: Option<RcStr>) -> Result<Vc<FetchOutput>> {
    let client_vc = FetchClientConfig::default().cell();
    // `read!` = `.await` in async, blocking `Vc` read in sync. The sync `fetch`
    // bridges to the edge runtime internally; here it looks like a plain `Vc` read.
    let response = &*read!(read!(client_vc.fetch(url, user_agent))?.unwrap())?;
    Ok(FetchOutput(response.status, read!(response.body.to_string().owned())?).cell())
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn sync_basic_get() {
    run_once_without_cache_check(&REGISTRATION, async {
        let mut server = mockito::Server::new();
        let resource_mock = server
            .mock("GET", "/foo.woff")
            .with_body("responsebody")
            .create();

        let url: RcStr = format!("{}/foo.woff", server.url()).into();
        let FetchOutput(status, body) =
            &*read!(fetch_operation(url, None).read_strongly_consistent())?;

        resource_mock.assert();
        assert_eq!(*status, 200);
        assert_eq!(body.as_str(), "responsebody");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn sync_sends_user_agent() {
    run_once_without_cache_check(&REGISTRATION, async {
        let mut server = mockito::Server::new();
        let resource_mock = server
            .mock("GET", "/foo.woff")
            .match_header("User-Agent", "next.js test")
            .with_body("ua-ok")
            .create();

        let url: RcStr = format!("{}/foo.woff", server.url()).into();
        let FetchOutput(status, body) = &*read!(
            fetch_operation(url, Some(RcStr::from("next.js test"))).read_strongly_consistent()
        )?;

        resource_mock.assert();
        assert_eq!(*status, 200);
        assert_eq!(body.as_str(), "ua-ok");
        anyhow::Ok(())
    })
    .await
    .unwrap()
}
