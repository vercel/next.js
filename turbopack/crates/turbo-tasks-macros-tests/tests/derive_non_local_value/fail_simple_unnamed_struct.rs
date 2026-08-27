#![allow(dead_code)]

use turbo_tasks::NonLocalValue;

struct UnresolvedValue;


struct ContainsUnresolvedValueUnnamed(UnresolvedValue);

fn main() {}
