use anyhow::Result;
use turbo_tasks::{OperationVc, Vc};

#[turbo_tasks::function(operation)]
fn bare_op_fn() -> Vc<i32> {
    Vc::cell(21)
}

#[turbo_tasks::function(operation)]
async fn multiply(value: OperationVc<i32>, coefficient: i32) -> Result<Vc<i32>> {
    Ok(Vc::cell(*value.connect().await? * coefficient))
}

#[allow(dead_code)]
fn use_operations() {
    let twenty_one: OperationVc<i32> = bare_op_fn();
    let _forty_two: OperationVc<i32> = multiply(twenty_one, 2);
}

fn main() {}
