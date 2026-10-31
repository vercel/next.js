#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use anyhow::Result;
use turbo_tasks::{ResolvedVc, State, Vc};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn test_hidden_mutate() {
    run_once(&REGISTRATION, async || {
        #[turbo_tasks::function(operation, root)]
        fn read_self_operation(input: ResolvedVc<Value>) -> Vc<u32> {
            input.read_self()
        }

        #[turbo_tasks::function(operation, root)]
        fn immutable_self_operation(input: ResolvedVc<Value>) -> Vc<u32> {
            input.immutable_self_fn()
        }

        let input = create_input().resolve().strongly_consistent().await?;
        input.await?.state.set(1);
        let changing_value = compute(input);
        assert_eq!(changing_value.read_strongly_consistent().await?.value, 1);

        let changing_value_resolved = changing_value.resolve().strongly_consistent().await?;
        let read_input = read_input(changing_value_resolved);
        let static_immutable = immutable_fn(changing_value_resolved);
        let read_self = read_self_operation(changing_value_resolved);
        let static_immutable_self = immutable_self_operation(changing_value_resolved);
        assert_eq!(*read_input.read_strongly_consistent().await?, 1);
        assert_eq!(*static_immutable.read_strongly_consistent().await?, 42);
        assert_eq!(*read_self.read_strongly_consistent().await?, 1);
        assert_eq!(*static_immutable_self.read_strongly_consistent().await?, 42);

        println!("changing input");
        input.await?.state.set(10);
        assert_eq!(changing_value.read_strongly_consistent().await?.value, 10);
        assert_eq!(*read_input.read_strongly_consistent().await?, 10);
        assert_eq!(*static_immutable.read_strongly_consistent().await?, 42);
        assert_eq!(*read_self.read_strongly_consistent().await?, 10);
        assert_eq!(*static_immutable_self.read_strongly_consistent().await?, 42);

        println!("changing input");
        input.await?.state.set(5);
        assert_eq!(changing_value.read_strongly_consistent().await?.value, 5);
        assert_eq!(*read_input.read_strongly_consistent().await?, 5);
        assert_eq!(*static_immutable.read_strongly_consistent().await?, 42);
        assert_eq!(*read_self.read_strongly_consistent().await?, 5);
        assert_eq!(*static_immutable_self.read_strongly_consistent().await?, 42);

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

#[turbo_tasks::function(operation, root)]
async fn create_input() -> Result<Vc<ChangingInput>> {
    println!("create_input()");
    Ok(ChangingInput {
        state: State::new(0),
    }
    .cell())
}

#[turbo_tasks::function(operation, root)]
async fn compute(input: ResolvedVc<ChangingInput>) -> Result<Vc<Value>> {
    println!("compute()");
    let input = input.await?;
    let value = input.state.get();
    Ok(Value { value: *value }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn read_input(input: ResolvedVc<Value>) -> Result<Vc<u32>> {
    println!("read_input()");
    let value = input.await?;
    Ok(Vc::cell(value.value))
}

#[turbo_tasks::function(operation, root)]
fn immutable_fn(input: ResolvedVc<Value>) -> Vc<u32> {
    let _ = input;
    println!("immutable_fn()");
    Vc::cell(42)
}

#[turbo_tasks::value_impl]
impl Value {
    #[turbo_tasks::function(root)]
    fn read_self(&self) -> Vc<u32> {
        println!("read_self()");
        Vc::cell(self.value)
    }

    #[turbo_tasks::function(root)]
    fn immutable_self_fn(self: Vc<Value>) -> Vc<u32> {
        let _ = self;
        println!("immutable_self_fn()");
        Vc::cell(42)
    }
}
