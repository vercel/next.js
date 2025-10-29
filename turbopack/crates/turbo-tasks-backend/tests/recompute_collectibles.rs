#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // clippy bug causes false positive

use anyhow::{Result, bail};
use turbo_rcstr::RcStr;
use turbo_tasks::{CollectiblesSource, ResolvedVc, State, ValueToString, Vc, emit};
use turbo_tasks_testing::{Registration, register, run_once};

static REGISTRATION: Registration = register!();

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn recompute() {
    run_once(&REGISTRATION, || async {
        let input = ChangingInput::new(1).resolve().await?;
        let input2 = ChangingInput::new(2).resolve().await?;
        input.await?.state.set(1);
        input2.await?.state.set(1000);
        let output = compute(input, input2, 1);
        let read = output.strongly_consistent().await?;
        assert_eq!(read.value, 42);
        assert_eq!(read.collectible, "1");

        for i in 2..100 {
            input.await?.state.set(i);
            let read = output.strongly_consistent().await?;
            assert_eq!(read.value, 42);
            assert_eq!(read.collectible, i.to_string());
        }

        for i in 0..100 {
            input2.await?.state.set(i);
            let read = output.strongly_consistent().await?;
            assert_eq!(read.value, 42);
            assert_eq!(read.collectible, "99");
        }
        anyhow::Ok(())
    })
    .await
    .unwrap()
}

#[turbo_tasks::value]
struct ChangingInput {
    state: State<u32>,
}

#[turbo_tasks::value_impl]
impl ChangingInput {
    #[turbo_tasks::function]
    fn new(key: u32) -> Vc<Self> {
        let _ = key;
        Self {
            state: State::new(1),
        }
        .cell()
    }
}

#[turbo_tasks::value]
struct Output {
    value: u32,
    collectible: String,
}

#[turbo_tasks::value]
struct Collectible {
    value: u32,
}

#[turbo_tasks::value_impl]
impl ValueToString for Collectible {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.value.to_string().into())
    }
}

#[turbo_tasks::function(operation)]
async fn inner_compute(
    input: ResolvedVc<ChangingInput>,
    input2: ResolvedVc<ChangingInput>,
) -> Result<Vc<u32>> {
    println!("inner_compute()");
    Ok(inner_compute2(*input, *input2.await?.state.get()))
}

#[turbo_tasks::function]
async fn inner_compute2(input: Vc<ChangingInput>, innerness: u32) -> Result<Vc<u32>> {
    println!("inner_compute2({innerness})");
    if innerness > 0 {
        return Ok(inner_compute2(input, innerness - 1));
    }
    let value = *input.await?.state.get();
    let collectible: ResolvedVc<Box<dyn ValueToString>> =
        ResolvedVc::upcast(Collectible { value }.resolved_cell());
    emit(collectible);

    Ok(Vc::cell(42))
}

#[turbo_tasks::function]
async fn compute(
    input: ResolvedVc<ChangingInput>,
    input2: ResolvedVc<ChangingInput>,
    innerness: u32,
) -> Result<Vc<Output>> {
    println!("compute({innerness})");
    if innerness > 0 {
        return Ok(compute(*input, *input2, innerness - 1));
    }
    let operation = inner_compute(input, input2);
    let value = *operation.connect().await?;
    let collectibles = operation.peek_collectibles::<Box<dyn ValueToString>>();
    if collectibles.len() != 1 {
        bail!("expected 1 collectible, found {}", collectibles.len());
    }
    let first = *collectibles.iter().next().unwrap();
    let collectible = first.to_string().await?;
    Ok(Output {
        value,
        collectible: collectible.to_string(),
    }
    .cell())
}
