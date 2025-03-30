#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // clippy bug causes false positive

use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{emit, CollectiblesSource, ResolvedVc, State, ValueToString, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn recompute() {
    run(&REGISTRATION, || async {
        let input = ChangingInput {
            state: State::new(1),
        }
        .cell();
        let output = compute(input, 100);
        let read = output.await?;
        assert_eq!(read.value, 42);
        assert_eq!(read.collectible, "1");

        for i in 2..100 {
            input.await?.state.set(i);
            let read = output.strongly_consistent().await?;
            assert_eq!(read.value, 42);
            assert_eq!(read.collectible, i.to_string());
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
fn inner_compute(input: ResolvedVc<ChangingInput>) -> Vc<u32> {
    inner_compute2(*input, 1000)
}

#[turbo_tasks::function]
async fn inner_compute2(input: Vc<ChangingInput>, innerness: u32) -> Result<Vc<u32>> {
    if innerness > 0 {
        return Ok(inner_compute2(input, innerness - 1));
    }
    let collectible: ResolvedVc<Box<dyn ValueToString>> = ResolvedVc::upcast(
        Collectible {
            value: *input.await?.state.get(),
        }
        .resolved_cell(),
    );
    emit(collectible);

    Ok(Vc::cell(42))
}

#[turbo_tasks::function]
async fn compute(input: ResolvedVc<ChangingInput>, innerness: u32) -> Result<Vc<Output>> {
    if innerness > 0 {
        return Ok(compute(*input, innerness - 1));
    }
    let operation = inner_compute(input);
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
