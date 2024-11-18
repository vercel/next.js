#![allow(dead_code)]

use turbo_tasks::ResolvedValue;

#[derive(ResolvedValue)]
struct ContainsUnderconstrainedGeneric<T> {
    value: T,
}

fn main() {}
