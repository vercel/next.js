#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_emptied_cells_session_dependent() {
    run(&REGISTRATION, || async {
        let input_op = get_state_operation();
        let input_vc = input_op.resolve().strongly_consistent().await?;
        let input = input_op.read_strongly_consistent().await?;
        input.state.set(0);

        let output = compute_operation(input_vc);
        assert_eq!(*output.read_strongly_consistent().await?, 0);

        println!("changing input");
        input.state.set(10);
        assert_eq!(*output.read_strongly_consistent().await?, 10);

        println!("changing input");
        input.state.set(5);
        assert_eq!(*output.read_strongly_consistent().await?, 5);

        println!("changing input");
        input.state.set(20);
        assert_eq!(*output.read_strongly_consistent().await?, 20);

        println!("changing input");
        input.state.set(15);
        assert_eq!(*output.read_strongly_consistent().await?, 15);

        println!("changing input");
        input.state.set(1);
        assert_eq!(*output.read_strongly_consistent().await?, 1);

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::function(operation, root)]
fn get_state_operation() -> Vc<ChangingInput> {
    ChangingInput {
        state: State::new(0),
    }
    .cell()
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::function(operation, root)]
async fn compute_operation(input: ResolvedVc<ChangingInput>) -> Result<Vc<u32>> {
    println!("compute_operation()");
    let value = *inner_compute(*input).await?;
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

#[turbo_tasks::function(session_dependent)]
async fn compute2(input: Vc<u32>) -> Result<Vc<u32>> {
    println!("compute2()");
    let value = *input.await?;
    Ok(Vc::cell(value))
}
