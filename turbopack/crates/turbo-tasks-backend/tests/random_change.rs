#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::{Result, bail};
use rand::{Rng, SeedableRng, rngs::StdRng};
use turbo_tasks::{ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn random_change() {
    run_once(&REGISTRATION, || async {
        let state = make_state_operation().resolve_strongly_consistent().await?;

        let mut rng = StdRng::from_seed(Default::default());
        let func_op = func_operation(state);
        let func2_op = func2_operation(state);
        for _i in 0..10 {
            let value = rng.random_range(0..100);
            state.await?.state.set(value);

            let result = func_op.read_strongly_consistent().await?;
            assert_eq!(result.value, value);

            let result = func2_op.read_strongly_consistent().await?;
            assert_eq!(result.value, value);
        }

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

#[turbo_tasks::function(operation)]
fn make_state_operation() -> Vc<ValueContainer> {
    ValueContainer {
        state: State::new(0),
    }
    .cell()
}

#[turbo_tasks::function(operation)]
async fn func2_operation(input: ResolvedVc<ValueContainer>) -> Result<Vc<Value>> {
    let state = input.await?;
    let value = state.state.get();
    println!("func2 {}", *value);
    Ok(func(*input, -*value))
}

#[turbo_tasks::function(operation)]
async fn func_operation(input: ResolvedVc<ValueContainer>) -> Vc<Value> {
    func(*input, 0)
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
