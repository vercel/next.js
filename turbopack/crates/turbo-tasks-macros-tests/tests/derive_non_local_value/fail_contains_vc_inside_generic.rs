#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, Vc};

#[derive(NonLocalValue)]
struct ContainsVcInsideGeneric {
    a: Option<Box<[Vc<i32>; 4]>>,
}

fn main() {}
