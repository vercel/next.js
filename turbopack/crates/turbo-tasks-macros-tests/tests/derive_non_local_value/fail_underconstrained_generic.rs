#![allow(dead_code)]

use turbo_tasks::NonLocalValue;

#[derive(NonLocalValue)]
struct ContainsUnderconstrainedGeneric<T> {
    value: T,
}

fn main() {}
