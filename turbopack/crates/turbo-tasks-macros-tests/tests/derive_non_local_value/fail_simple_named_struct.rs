#![allow(dead_code)]

use turbo_tasks::NonLocalValue;

struct UnresolvedValue;


struct ContainsUnresolvedValueNamed {
    a: UnresolvedValue,
}

fn main() {}
