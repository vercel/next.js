#![allow(dead_code)]

use turbo_tasks::{OperationValue, OperationVc};

#[derive(OperationValue)]
struct UnitStruct;

#[derive(OperationValue)]
struct ContainsOperationVcNamed {
    a: i32,
    b: OperationVc<i32>,
    c: Vec<OperationVc<i32>>,
}

#[derive(OperationValue)]
struct ContainsOperationVcUnnamed(i32, OperationVc<i32>, Vec<OperationVc<i32>>);

fn main() {}
