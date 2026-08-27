#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, ResolvedVc};


enum EnumI32 {
    Unit,
    Unnamed(i32),
    Named { a: i32 },
}


enum EnumResolvedVc {
    Unit,
    Unnamed(ResolvedVc<i32>),
    Named { a: ResolvedVc<i32> },
}

fn main() {}
