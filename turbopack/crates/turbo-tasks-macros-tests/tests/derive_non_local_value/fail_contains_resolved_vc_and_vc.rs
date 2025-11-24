#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, ResolvedVc, Vc};

#[derive(NonLocalValue)]
struct ContainsResolvedVcAndVc {
    a: ResolvedVc<i32>,
    b: Vc<i32>,
}

fn main() {}
