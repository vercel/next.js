#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{State, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn hidden_mutate() {
    run_once(&REGISTRATION, || async {
        let input = create_input().resolve().await?;
        input.await?.state.set(1);
        let changing_value = compute(input);
        assert_eq!(changing_value.await?.value, 1);

        let changing_value_resolved = changing_value.resolve().await?;
        let read_input = read_input(changing_value_resolved);
        let static_immutable = immutable_fn(changing_value_resolved);
        let read_self = changing_value_resolved.read_self();
        let static_immutable_self = changing_value_resolved.immutable_self_fn();
        assert_eq!(*read_input.await?, 1);
        assert_eq!(*static_immutable.await?, 42);
        assert_eq!(*read_self.await?, 1);
        assert_eq!(*static_immutable_self.await?, 42);

        println!("changing input");
        input.await?.state.set(10);
        assert_eq!(changing_value.strongly_consistent().await?.value, 10);
        assert_eq!(*read_input.strongly_consistent().await?, 10);
        assert_eq!(*static_immutable.strongly_consistent().await?, 42);
        assert_eq!(*read_self.strongly_consistent().await?, 10);
        assert_eq!(*static_immutable_self.strongly_consistent().await?, 42);

        println!("changing input");
        input.await?.state.set(5);
        assert_eq!(changing_value.strongly_consistent().await?.value, 5);
        assert_eq!(*read_input.strongly_consistent().await?, 5);
        assert_eq!(*static_immutable.strongly_consistent().await?, 42);
        assert_eq!(*read_self.strongly_consistent().await?, 5);
        assert_eq!(*static_immutable_self.strongly_consistent().await?, 42);

        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::value]
struct Value {
    value: u32,
}

#[turbo_tasks::function]
async fn create_input() -> Result<Vc<ChangingInput>> {
    println!("create_input()");
    Ok(ChangingInput {
        state: State::new(0),
    }
    .cell())
}

#[turbo_tasks::function]
async fn compute(input: Vc<ChangingInput>) -> Result<Vc<Value>> {
    println!("compute()");
    let input = input.await?;
    let value = input.state.get();
    Ok(Value { value: *value }.cell())
}

#[turbo_tasks::function]
async fn read_input(input: Vc<Value>) -> Result<Vc<u32>> {
    println!("read_input()");
    let value = input.await?;
    Ok(Vc::cell(value.value))
}

#[turbo_tasks::function]
fn immutable_fn(input: Vc<Value>) -> Vc<u32> {
    let _ = input;
    println!("immutable_fn()");
    Vc::cell(42)
}

#[turbo_tasks::value_impl]
impl Value {
    #[turbo_tasks::function]
    fn read_self(&self) -> Vc<u32> {
        println!("read_self()");
        Vc::cell(self.value)
    }

    #[turbo_tasks::function]
    fn immutable_self_fn(self: Vc<Value>) -> Vc<u32> {
        let _ = self;
        println!("immutable_self_fn()");
        Vc::cell(42)
    }
}
