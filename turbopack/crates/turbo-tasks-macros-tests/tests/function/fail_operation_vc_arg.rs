#![allow(dead_code)]

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};

#[turbo_tasks::function(operation)]
async fn multiply(value: Vc<i32>, coefficient: ResolvedVc<i32>) -> Result<Vc<i32>> {
    let value = *value.await?;
    let coefficient = *coefficient.await?;
    Ok(Vc::cell(value * coefficient))
}

fn main() {}
