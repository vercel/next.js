#![allow(dead_code)]

use turbo_tasks::ResolvedValue;

struct UnresolvedValue;

#[derive(ResolvedValue)]
struct ContainsUnresolvedValueUnnamed(UnresolvedValue);

fn main() {}
