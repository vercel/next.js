// Phase 0 proof: the real `turbo-tasks-testing` harness (`register!` + `run_once`)
// and the dual-mode `#[turbo_tasks::test]` attribute, driving an async test body to
// completion with ZERO tokio linked.
//
// Gated on `sync`: in an async (workspace-unified) build `#[turbo_tasks::test]` would
// expand to `#[tokio::test]`, which needs a `tokio` dependency this intentionally
// tokio-free crate does not have. The whole file compiles to nothing there.
#![cfg(feature = "sync")]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use turbo_tasks::{Vc, read};
use turbo_tasks_testing::{Registration, register, run_once_without_cache_check};

static REGISTRATION: Registration = register!();

// In an async build this would be `#[turbo_tasks::test(flavor = "multi_thread",
// worker_threads = 2)]`; in the sync build the args are ignored and it becomes a
// plain `#[test]` whose body is driven by a single `sync_poll`.
//
// Uses the harness's single-run entry point. The full multi-run `run`/`run_once`
// loop (snapshot → evict → restore across instances) requires persistence, which in
// the sync engine is Phase 2 (the no-tokio background snapshot path); `storage_mode:
// None` here would panic in `snapshot_and_evict`.
#[turbo_tasks::test(flavor = "multi_thread", worker_threads = 2)]
async fn harness_drives_async_body_with_no_tokio() {
    run_once_without_cache_check(&REGISTRATION, async {
        basic_operation(7).read_strongly_consistent().await.unwrap();
    })
    .await
}

#[turbo_tasks::function(operation, root)]
async fn basic_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce; // part of the cache key

    // `read!` is the dual-mode read: `.await` in async builds, `sync_read()` (inline)
    // under `sync`. `#[turbo_tasks::function]` strips `async` in sync mode, so function
    // bodies must use `read!`/`parallel!` rather than raw `.await`.
    let leaf = compute_leaf();
    assert_eq!(read!(leaf)?.value, 123);

    let input = MyValue { value: 42 }.cell();
    let echoed = echo(input);
    assert_eq!(read!(echoed)?.value, 42);

    // A nested call chain exercises inline recursion through the harness.
    let nested = nested_leaf();
    assert_eq!(read!(nested)?.value, 123);

    Ok(Vc::cell(()))
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct MyValue {
    value: u32,
}

#[turbo_tasks::function]
fn compute_leaf() -> Result<Vc<MyValue>> {
    Ok(MyValue { value: 123 }.cell())
}

#[turbo_tasks::function]
async fn echo(input: Vc<MyValue>) -> Result<Vc<MyValue>> {
    let value = read!(input)?.value;
    Ok(MyValue { value }.cell())
}

#[turbo_tasks::function]
async fn nested_leaf() -> Result<Vc<MyValue>> {
    let value = read!(compute_leaf().owned())?;
    Ok(value.cell())
}
