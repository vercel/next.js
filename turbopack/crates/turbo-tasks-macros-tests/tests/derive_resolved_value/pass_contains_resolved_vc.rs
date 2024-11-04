#![allow(dead_code)]

use turbo_tasks::{ResolvedValue, ResolvedVc};

#[derive(ResolvedValue)]
struct ContainsResolvedVcNamedStruct {
    a: ResolvedVc<i32>,
}

#[derive(ResolvedValue)]
struct ContainsResolvedVcUnnamedStruct(ResolvedVc<i32>);

#[derive(ResolvedValue)]
enum ContainsResolvedVcEnum {
    Unit,
    Unnamed(ResolvedVc<i32>),
    Named { a: ResolvedVc<i32> },
}

#[derive(ResolvedValue)]
struct ContainsResolvedAlongWithOtherValues {
    a: i32,
    b: ResolvedVc<i32>,
    c: (),
}

fn main() {}
