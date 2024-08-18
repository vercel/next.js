#![allow(dead_code)]

use turbo_tasks::{ResolvedValue, Vc};

#[derive(ResolvedValue)]
struct ContainsOnlyVc {
    a: Vc<i32>,
}

fn main() {}
