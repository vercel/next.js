#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{State, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn recompute() {
    run(&REGISTRATION, || async {
        let input = ChangingInput {
            state: State::new(1),
        }
        .cell();
        let output = compute(input);
        assert_eq!(*output.await?, 1);

        println!("changing input");
        input.set_state(10).await?;
        assert_eq!(*output.strongly_consistent().await?, 10);

        println!("changing input");
        input.set_state(5).await?;
        assert_eq!(*output.strongly_consistent().await?, 5);

        println!("changing input");
        input.set_state(20).await?;
        assert_eq!(*output.strongly_consistent().await?, 20);

        println!("changing input");
        input.set_state(15).await?;
        assert_eq!(*output.strongly_consistent().await?, 15);

        println!("changing input");
        input.set_state(1).await?;
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

#[turbo_tasks::value_impl]
impl ChangingInput {
    // HACK: This write has to be a separate task to avoid creating a cycle in the parent/child call
    // tree, since `State::set`/`State::get` marks the writer task as a child of the reader task.
    #[turbo_tasks::function]
    fn set_state(&self, value: u32) {
        self.state.set(value);
    }
}

#[turbo_tasks::function]
async fn compute(input: Vc<ChangingInput>) -> Result<Vc<u32>> {
    let value = *inner_compute(input).await?;
    Ok(Vc::cell(value))
}

#[turbo_tasks::function]
async fn inner_compute(input: Vc<ChangingInput>) -> Result<Vc<u32>> {
    let state_value = *input.await?.state.get();
    let mut last = None;
    for i in 0..=state_value {
        last = Some(compute2(Vc::cell(i)));
    }
    Ok(last.unwrap())
}

#[turbo_tasks::function]
async fn compute2(input: Vc<u32>) -> Result<Vc<u32>> {
    let value = *input.await?;
    Ok(Vc::cell(value))
}
