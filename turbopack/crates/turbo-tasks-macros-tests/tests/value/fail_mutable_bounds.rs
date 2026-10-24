#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(unexpected_cfgs)]

// Mutable-cell payloads must be cloneable and operation-safe, even if the caller
// only intends to use set rather than update.
#[turbo_tasks::value(cell = "mutable", operation)]
struct NotClone { value: u32 }

fn main() {}
