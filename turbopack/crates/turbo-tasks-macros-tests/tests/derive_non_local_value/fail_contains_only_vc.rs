#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, Vc};

#[derive(NonLocalValue)]
struct ContainsOnlyVc {
    a: Vc<i32>,
}

fn main() {}
