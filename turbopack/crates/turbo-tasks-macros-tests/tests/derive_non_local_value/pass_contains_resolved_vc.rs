#![allow(dead_code)]

use turbo_tasks::{NonLocalValue, ResolvedVc};

#[derive(NonLocalValue)]
struct ContainsResolvedVcNamedStruct {
    a: ResolvedVc<i32>,
}

#[derive(NonLocalValue)]
struct ContainsResolvedVcUnnamedStruct(ResolvedVc<i32>);

#[derive(NonLocalValue)]
enum ContainsResolvedVcEnum {
    Unit,
    Unnamed(ResolvedVc<i32>),
    Named { a: ResolvedVc<i32> },
}

#[derive(NonLocalValue)]
struct ContainsResolvedAlongWithOtherValues {
    a: i32,
    b: ResolvedVc<i32>,
    c: (),
}

fn main() {}
