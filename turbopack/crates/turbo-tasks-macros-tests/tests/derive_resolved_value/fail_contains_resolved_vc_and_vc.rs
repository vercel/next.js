#![allow(dead_code)]

use turbo_tasks::{ResolvedValue, ResolvedVc, Vc};

#[derive(ResolvedValue)]
struct ContainsResolvedVcAndVc {
    a: ResolvedVc<i32>,
    b: Vc<i32>,
}

fn main() {}
