#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::{Result, bail};
use rand::Rng;
use turbo_tasks::{State, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn random_change() {
    run(&REGISTRATION, || async {
        let state = make_state();
        let value = rand::rng().random_range(0..100);
        state.await?.state.set(value);

        let result = func(state, 0).await?;
        assert_eq!(result.value, value);

        let result = func2(state).await?;
        assert_eq!(result.value, value);

        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
struct Value {
    value: i32,
}

#[turbo_tasks::value]
#[derive(Debug)]
struct ValueContainer {
    state: State<i32>,
}

#[turbo_tasks::function]
fn make_state() -> Vc<ValueContainer> {
    ValueContainer {
        state: State::new(0),
    }
    .cell()
}

#[turbo_tasks::function]
async fn func2(input: Vc<ValueContainer>) -> Result<Vc<Value>> {
    let state = input.await?;
    let value = state.state.get();
    println!("func2 {}", *value);
    Ok(func(input, -*value))
}

#[turbo_tasks::function]
async fn func(input: Vc<ValueContainer>, nesting: i32) -> Result<Vc<Value>> {
    let state = input.await?;
    let value = state.state.get();
    if nesting < *value {
        return Ok(func(input, nesting + 1));
    }
    if nesting == *value {
        println!("func {nesting}");
        return Ok(Value { value: *value }.cell());
    }
    bail!("func no longer valid {}", nesting)
}
