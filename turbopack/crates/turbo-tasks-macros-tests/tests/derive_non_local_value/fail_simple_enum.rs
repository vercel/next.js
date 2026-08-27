#![allow(dead_code)]

use turbo_tasks::NonLocalValue;

struct UnresolvedValue;


enum ContainsUnresolvedValue {
    Unit,
    Unnamed(UnresolvedValue),
    Named { a: UnresolvedValue },
}

fn main() {}
