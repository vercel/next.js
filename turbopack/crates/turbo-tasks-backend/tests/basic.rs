#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::sync::atomic::{AtomicUsize, Ordering};

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();
static CACHED_TOP_LEVEL_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_basic() {
    let mut nonce = 0;
    run_once(&REGISTRATION, move || {
        // pass a nonce to re-run the test body on every turbo-tasks restart
        nonce += 1;
        async move { test_basic_operation(nonce).read_strongly_consistent().await }
    })
    .await
    .unwrap()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_dirty_top_level_cached_root() {
    CACHED_TOP_LEVEL_EXECUTIONS.store(0, Ordering::SeqCst);
    let instance = REGISTRATION.create_turbo_tasks("dirty_top_level_cached_root", true);
    let tt = instance.tt;

    let input = turbo_tasks::run(tt.clone(), async {
        create_cached_top_level_input()
            .resolve()
            .strongly_consistent()
            .await
    })
    .await
    .unwrap();

    let value = turbo_tasks::run(tt.clone(), async move {
        Ok(cached_top_level_value(*input)
            .strongly_consistent()
            .await?
            .value)
    })
    .await
    .unwrap();
    assert_eq!(value, 7);

    let value = turbo_tasks::run(tt.clone(), async move {
        input.await?.state.set(9);
        Ok(cached_top_level_value(*input)
            .strongly_consistent()
            .await?
            .value)
    })
    .await
    .unwrap();
    assert_eq!(value, 9);

    assert_eq!(CACHED_TOP_LEVEL_EXECUTIONS.load(Ordering::SeqCst), 2);
    tt.stop_and_wait().await;
}

#[turbo_tasks::function(operation, root)]
async fn test_basic_operation(nonce: u32) -> Result<Vc<()>> {
    let _ = nonce; // ensure the nonce is part of our cache key

    let output1 = func_without_args();
    assert_eq!(output1.await?.value, 123);

    let input = Value { value: 42 }.cell();
    let output2 = func_transient(input);
    assert_eq!(output2.await?.value, 42);

    let output3 = func_persistent(output1);
    assert_eq!(output3.await?.value, 123);

    let output4 = nested_func_without_args_waiting();
    assert_eq!(output4.await?.value, 123);

    let output5 = nested_func_without_args_non_waiting();
    assert_eq!(output5.await?.value, 123);

    Ok(Vc::cell(()))
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
}

#[turbo_tasks::value]
struct CachedTopLevelInput {
    state: State<u32>,
}

#[turbo_tasks::function(operation, root)]
fn create_cached_top_level_input() -> Vc<CachedTopLevelInput> {
    CachedTopLevelInput {
        state: State::new(7),
    }
    .cell()
}

#[turbo_tasks::function(root)]
async fn cached_top_level_value(input: ResolvedVc<CachedTopLevelInput>) -> Result<Vc<Value>> {
    CACHED_TOP_LEVEL_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    let value = *input.await?.state.get();
    Ok(Value { value }.cell())
}

#[turbo_tasks::function]
async fn func_transient(input: Vc<Value>) -> Result<Vc<Value>> {
    println!("func_transient");
    let value = input.await?.value;
    Ok(Value { value }.cell())
}

#[turbo_tasks::function]
async fn func_persistent(input: Vc<Value>) -> Result<Vc<Value>> {
    println!("func_persistent");
    let value = input.await?.value;
    Ok(Value { value }.cell())
}

#[turbo_tasks::function]
fn func_without_args() -> Result<Vc<Value>> {
    println!("func_without_args");
    let value = 123;
    Ok(Value { value }.cell())
}

#[turbo_tasks::function]
async fn nested_func_without_args_waiting() -> Result<Vc<Value>> {
    println!("nested_func_without_args_waiting");
    let value = func_without_args().owned().await?;
    Ok(value.cell())
}

#[turbo_tasks::function]
fn nested_func_without_args_non_waiting() -> Result<Vc<Value>> {
    println!("nested_func_without_args_non_waiting");
    Ok(func_without_args())
}
