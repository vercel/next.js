#![allow(dead_code)]

use turbo_tasks::{ResolvedValue, Vc};

#[derive(ResolvedValue)]
struct ContainsVcInsideGeneric {
    a: Option<Box<[Vc<i32>; 4]>>,
}

fn main() {}
