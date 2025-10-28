#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{State, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recompute() {
    run_once(&REGISTRATION, || async {
        let input = ChangingInput {
            state: State::new(1),
        }
        .cell();
        let output = compute(input);
        assert_eq!(*output.await?, 1);

        println!("changing input");
        input.await?.state.set(10);
        assert_eq!(*output.strongly_consistent().await?, 10);

        println!("changing input");
        input.await?.state.set(5);
        assert_eq!(*output.strongly_consistent().await?, 5);

        println!("changing input");
        input.await?.state.set(20);
        assert_eq!(*output.strongly_consistent().await?, 20);

        println!("changing input");
        input.await?.state.set(15);
        assert_eq!(*output.strongly_consistent().await?, 15);

        println!("changing input");
        input.await?.state.set(1);
        assert_eq!(*output.strongly_consistent().await?, 1);

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::function]
async fn compute(input: Vc<ChangingInput>) -> Result<Vc<u32>> {
    println!("compute()");
    let value = *inner_compute(input).await?;
    Ok(Vc::cell(value))
}

#[turbo_tasks::function]
async fn inner_compute(input: Vc<ChangingInput>) -> Result<Vc<u32>> {
    println!("inner_compute()");
    let state_value = *input.await?.state.get();
    let mut last = None;
    for i in 0..=state_value {
        last = Some(compute2(Vc::cell(i)));
    }
    Ok(last.unwrap())
}

#[turbo_tasks::function]
async fn compute2(input: Vc<u32>) -> Result<Vc<u32>> {
    println!("compute2()");
    let value = *input.await?;
    Ok(Vc::cell(value))
}
