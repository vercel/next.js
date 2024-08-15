#![allow(dead_code)]

use turbo_tasks::{ResolvedValue, ResolvedVc};

#[derive(ResolvedValue)]
enum EnumI32 {
    Unit,
    Unnamed(i32),
    Named { a: i32 },
}

#[derive(ResolvedValue)]
enum EnumResolvedVc {
    Unit,
    Unnamed(ResolvedVc<i32>),
    Named { a: ResolvedVc<i32> },
}

fn main() {}
