#![allow(dead_code)]

use turbo_tasks::NonLocalValue;

struct UnresolvedValue;

#[derive(NonLocalValue)]
struct ContainsUnresolvedValueNamed {
    a: UnresolvedValue,
}

fn main() {}
