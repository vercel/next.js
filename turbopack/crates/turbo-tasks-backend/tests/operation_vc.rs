#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[turbo_tasks::function(operation)]
fn bare_op_fn() -> Vc<i32> {
    Vc::cell(21)
}

// operations can take `ResolvedVc`s too (anything that's a `NonLocalValue`).
#[turbo_tasks::function(operation)]
async fn multiply(value: OperationVc<i32>, coefficient: ResolvedVc<i32>) -> Result<Vc<i32>> {
    Ok(Vc::cell((*value.connect().await?) * (*coefficient.await?)))
}

#[turbo_tasks::function]
fn use_operations() -> Vc<i32> {
    let twenty_one: OperationVc<i32> = bare_op_fn();
    let forty_two: OperationVc<i32> = multiply(twenty_one, ResolvedVc::cell(2));
    forty_two.connect()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_use_operations() -> Result<()> {
    run(&REGISTRATION, || async {
        assert_eq!(*use_operations().await?, 42);
        Ok(())
    })
    .await
}
