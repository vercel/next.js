#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, ResolvedVc};


struct ContainsResolvedVcNamedStruct {
    a: ResolvedVc<i32>,
}


struct ContainsResolvedVcUnnamedStruct(ResolvedVc<i32>);


enum ContainsResolvedVcEnum {
    Unit,
    Unnamed(ResolvedVc<i32>),
    Named { a: ResolvedVc<i32> },
}


struct ContainsResolvedAlongWithOtherValues {
    a: i32,
    b: ResolvedVc<i32>,
    c: (),
}

fn main() {}
