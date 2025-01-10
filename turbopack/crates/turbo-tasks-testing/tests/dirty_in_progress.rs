#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

use std::time::Duration;

use anyhow::{bail, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{emit, CollectiblesSource, ResolvedVc, State, ValueToString, Vc};
use turbo_tasks_testing::{register, run, Registration};

static REGISTRATION: Registration = register!();

#[tokio::test]
async fn dirty_in_progress() {
    run(&REGISTRATION, || async {
        let cases = [
            (1, 3, 2, 2, ""),
            (11, 13, 12, 42, "12"),
            (1, 13, 11, 42, "11"),
            (1, 3, 11, 42, "11"),
            (11, 3, 2, 2, ""),
            (11, 13, 2, 2, ""),
        ];
        for (a, b, c, value, collectible) in cases {
            println!("{} -> {} -> {} = {} {}", a, b, c, value, collectible);
            let input = ChangingInput {
                state: State::new(a),
            }
            .cell();
            let input_val = input.await?;
            let output = compute(input);
            output.await?;
            println!("update to {}", b);
            input_val.state.set(b);
            tokio::time::sleep(Duration::from_millis(100)).await;
            println!("update to {}", c);
            input_val.state.set(c);
            let read = output.strongly_consistent().await?;
            assert_eq!(read.value, value);
            assert_eq!(read.collectible, collectible);
            println!("\n");
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

#[turbo_tasks::function]
async fn inner_compute(input: Vc<ChangingInput>) -> Result<Vc<u32>> {
    println!("start inner_compute");
    let value = *input.await?.state.get();
    tokio::time::sleep(Duration::from_millis(200)).await;
    if value > 10 {
        let collectible: ResolvedVc<Box<dyn ValueToString>> =
            ResolvedVc::upcast(Collectible { value }.resolved_cell());
        emit(collectible);

        println!("end inner_compute with collectible");
        Ok(Vc::cell(42))
    } else {
        println!("end inner_compute without collectible");
        Ok(Vc::cell(value))
    }
}

#[turbo_tasks::function]
async fn compute(input: Vc<ChangingInput>) -> Result<Vc<Output>> {
    println!("start compute");
    let operation = inner_compute(input);
    let value = *operation.await?;
    let collectibles = operation.peek_collectibles::<Box<dyn ValueToString>>();
    if collectibles.len() > 1 {
        bail!("expected 0..1 collectible, found {}", collectibles.len());
    }
    let first = collectibles.iter().next();
    let collectible = if let Some(first) = first {
        first.to_string().await?.to_string()
    } else {
        "".to_string()
    };
    println!("end compute");
    Ok(Output { value, collectible }.cell())
}
