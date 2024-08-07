#![feature(arbitrary_self_types)]

use anyhow::Result;
use turbo_tasks::Vc;
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn basic() {
    run(&REGISTRATION, || async {
        let input = Value { value: 42 }.cell();
        let output = func(input);
        // assert_eq!(output.await?.value, 42);

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
async fn func(input: Vc<Value>) -> Result<Vc<Value>> {
    let value = input.await?.value;
    Ok(Value { value }.cell())
}
