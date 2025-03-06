#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, ResolvedVc};

#[derive(NonLocalValue)]
enum EnumI32 {
    Unit,
    Unnamed(i32),
    Named { a: i32 },
}

#[derive(NonLocalValue)]
enum EnumResolvedVc {
    Unit,
    Unnamed(ResolvedVc<i32>),
    Named { a: ResolvedVc<i32> },
}

fn main() {}
