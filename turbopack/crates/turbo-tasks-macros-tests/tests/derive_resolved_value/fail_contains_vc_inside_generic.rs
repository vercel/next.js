#![allow(dead_code)]

use turbo_tasks::{ResolvedValue, ResolvedVc, Vc};

#[derive(ResolvedValue)]
struct ContainsVcInsideGeneric {
    a: Option<Box<[ResolvedVc<i32>; 4]>>,
}

fn main() {}
