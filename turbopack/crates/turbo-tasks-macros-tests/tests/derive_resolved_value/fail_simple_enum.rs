#![allow(dead_code)]

use turbo_tasks::ResolvedValue;

struct UnresolvedValue;

#[derive(ResolvedValue)]
enum ContainsUnresolvedValue {
    Unit,
    Unnamed(UnresolvedValue),
    Named { a: UnresolvedValue },
}

fn main() {}
