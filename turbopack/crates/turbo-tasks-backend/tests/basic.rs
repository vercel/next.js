#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn basic() {
    run_once(&REGISTRATION, || async {
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

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: u32,
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
