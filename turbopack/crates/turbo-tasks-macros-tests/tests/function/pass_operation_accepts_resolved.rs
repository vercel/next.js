use anyhow::Result;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};

#[turbo_tasks::function(operation)]
fn bare_op_fn() -> Vc<i32> {
    Vc::cell(21)
}

// operations can take `ResolvedVc`s too (anything that's a `NonLocalValue`).
#[turbo_tasks::function(operation)]
async fn multiply(value: OperationVc<i32>, coefficient: ResolvedVc<i32>) -> Result<Vc<i32>> {
    Ok(Vc::cell((*value.connect().await?) * (*coefficient.await?)))
}

#[allow(dead_code)]
fn use_operations() {
    let twenty_one: OperationVc<i32> = bare_op_fn();
    let _fourty_two: OperationVc<i32> = multiply(twenty_one, ResolvedVc::cell(2));
}

fn main() {}
