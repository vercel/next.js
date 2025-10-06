#![allow(dead_code)]

use turbo_tasks::{OperationValue, ResolvedVc, Vc};

#[derive(OperationValue)]
struct ContainsVcAndResolvedVc {
    a: Vc<i32>,
    b: ResolvedVc<i32>,
}

fn main() {}
