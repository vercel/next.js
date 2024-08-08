#![feature(arbitrary_self_types)]

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn basic() {
    run(&REGISTRATION, || async {
        let output1 = func_without_args();
        assert_eq!(output1.await?.value, 123);

        let input = Value { value: 42 }.cell();
        let output2 = func_transient(input);
        assert_eq!(output2.await?.value, 42);

        let output3 = func_persistent(output1);
        assert_eq!(output3.await?.value, 123);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
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
async fn func_without_args() -> Result<Vc<Value>> {
    println!("func_without_args");
    let value = 123;
    Ok(Value { value }.cell())
}
